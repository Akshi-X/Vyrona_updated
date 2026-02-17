import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ivfService } from '../../../services/ivfService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { authUtils } from '../../../utils/auth';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

interface Ln2DataPoint {
  timestamp: string;
  evaporation_rate_kg_per_h: number | null;
  ln2_mass_kg: number | null;
}

const MAX_DATA_POINTS = 30;
const TIME_WINDOW_MS = 6 * 60 * 60 * 1000;
const INTERVAL_MINUTES = 60;
const INTERVALS_COUNT = 6;

const parseTimestamp = (timestamp: string): Date | null => {
  try {
    if (!timestamp) return null;
    let normalizedTimestamp = timestamp.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalizedTimestamp)) {
      normalizedTimestamp = normalizedTimestamp.replace(' ', 'T');
    }
    const parsed = new Date(normalizedTimestamp);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const filterDataByTimeWindow = (points: Ln2DataPoint[]): Ln2DataPoint[] => {
  if (points.length === 0) return points;
  const now = new Date().getTime();
  const filtered = points.filter((point) => {
    const pointDate = parseTimestamp(point.timestamp);
    if (!pointDate) return false;
    const timeDiff = now - pointDate.getTime();
    const maxAge = points.length === 1 ? 2 * TIME_WINDOW_MS : TIME_WINDOW_MS;
    return timeDiff >= -10 * 60 * 1000 && timeDiff <= maxAge;
  });
  if (filtered.length === 0 && points.length > 0) {
    const validPoints = points.filter((p) => parseTimestamp(p.timestamp) !== null);
    if (validPoints.length > 0) {
      validPoints.sort((a, b) => {
        const dateA = parseTimestamp(a.timestamp);
        const dateB = parseTimestamp(b.timestamp);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime();
      });
      return [validPoints[0]];
    }
  }
  return filtered;
};

const getIntervalIndex = (timestamp: string): number => {
  try {
    const now = new Date().getTime();
    const pointDate = parseTimestamp(timestamp);
    if (!pointDate) return 0;
    const minutesAgo = Math.floor((now - pointDate.getTime()) / (60 * 1000));
    const intervalIndex = minutesAgo < 0 ? 0 : Math.floor(minutesAgo / INTERVAL_MINUTES);
    return Math.max(0, Math.min(INTERVALS_COUNT - 1, intervalIndex));
  } catch {
    return 0;
  }
};

const formatTimestampToInterval = (minutesAgo: number): string => {
  const now = new Date();
  const intervalTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
  const hours = intervalTime.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:00 ${ampm}`;
};

interface LN2ReadingsChartProps {
  canisterNumber?: string;
}

export default function LN2ReadingsChart({ canisterNumber }: LN2ReadingsChartProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const [dataPoints, setDataPoints] = useState<Ln2DataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasReceivedData, setHasReceivedData] = useState(false);

  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/ivf/quality/ln2-ws`;
  };

  const closeWebSocket = () => {
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, 'Component unmounting');
        }
      } catch {}
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectingRef.current = false;
  };

  useEffect(() => {
    if (!canisterNumber) return;
    ivfService.getLn2History(canisterNumber).then((res) => {
      if (!isMountedRef.current) return;
      if (res?.history?.length) {
        const points: Ln2DataPoint[] = res.history.map((h: any) => ({
          timestamp: h.timestamp,
          evaporation_rate_kg_per_h: h.evaporation_rate_kg_per_h ?? h.ln2_evaporation_rate ?? null,
          ln2_mass_kg: h.ln2_mass_kg ?? h.ln2_level ?? null,
        }));
        setDataPoints((prev) => {
          const combined = [...points];
          prev.forEach((p) => {
            if (!combined.some((c) => c.timestamp === p.timestamp)) combined.push(p);
          });
          combined.sort(
            (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
          );
          return combined.slice(-MAX_DATA_POINTS);
        });
        setHasReceivedData(true);
      }
    }).catch(() => {});
  }, [canisterNumber]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!canisterNumber) {
      setError('Canister number missing');
      return;
    }
    const authToken = token || authUtils.getToken();
    if (!authToken) {
      setError('Authentication token missing');
      return;
    }
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const connectWebSocket = () => {
      if (!isMountedRef.current) return;
      if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED)) return;

      try {
        isConnectingRef.current = true;
        const url = `${getWebSocketUrl()}?token=${encodeURIComponent(authToken)}`;
        const ws = new WebSocket(url);

        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          isConnectingRef.current = false;
          setHasReceivedData(false);
          if (ws.readyState === WebSocket.OPEN && canisterNumber) {
            ws.send(JSON.stringify({ tank_code: canisterNumber }));
          }
        };

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return;
          try {
            const data: any = JSON.parse(event.data);
            if (data.type === 'subscription_confirmed') return;
            if (data.type === 'error') {
              setError(data.message || 'Unknown error');
              return;
            }
            const evap = data.evaporation_rate_kg_per_h ?? data.ln2_evaporation_rate;
            const mass = data.ln2_mass_kg ?? data.ln2_level;
            const hasLn2 = data.tank_code != null && data.timestamp && (mass != null || evap != null);
            if (hasLn2) {
              const parseNum = (v: any): number | null =>
                v == null ? null : typeof v === 'number' ? v : parseFloat(v);
              const point: Ln2DataPoint = {
                timestamp: data.timestamp,
                evaporation_rate_kg_per_h: parseNum(evap),
                ln2_mass_kg: parseNum(mass),
              };
              setHasReceivedData(true);
              setDataPoints((prev) => {
                if (prev.some((p) => p.timestamp === point.timestamp)) return prev;
                const newPoints = [...prev, point];
                return newPoints.length > MAX_DATA_POINTS ? newPoints.slice(-MAX_DATA_POINTS) : newPoints;
              });
            }
          } catch {}
        };

        ws.onerror = () => {
          if (!isMountedRef.current) return;
          setIsConnected(false);
          setError('WebSocket connection error');
          isConnectingRef.current = false;
        };

        ws.onclose = (event) => {
          if (!isMountedRef.current) return;
          setIsConnected(false);
          isConnectingRef.current = false;
          if (event.code === 1000 || event.code === 1008) {
            if (event.code === 1008) setError('Authentication failed. Please refresh the page.');
            wsRef.current = null;
            return;
          }
          if (isMountedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current) connectWebSocket();
            }, reconnectDelay);
          } else {
            if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
              setError('Failed to reconnect. Please refresh the page.');
            }
            wsRef.current = null;
          }
        };

        wsRef.current = ws;
      } catch {
        setError('Failed to connect to WebSocket');
        setIsConnected(false);
        isConnectingRef.current = false;
      }
    };

    connectWebSocket();

    const cleanupInterval = setInterval(() => {
      if (isMountedRef.current) {
        setDataPoints((prev) => {
          const filtered = filterDataByTimeWindow(prev);
          return filtered.length !== prev.length ? filtered : prev;
        });
      }
    }, 60000);

    return () => {
      isMountedRef.current = false;
      clearInterval(cleanupInterval);
      closeWebSocket();
    };
  }, [canisterNumber, token]);

  const chartData = useMemo(() => {
    const filteredDataPoints = filterDataByTimeWindow(dataPoints);
    const palette = { ln2_mass_kg: '#4A90E2', evaporation_rate_kg_per_h: '#E2A84A' } as const;

    const intervalLabels: string[] = [];
    for (let i = INTERVALS_COUNT - 1; i >= 0; i--) {
      intervalLabels.push(formatTimestampToInterval(i * INTERVAL_MINUTES));
    }

    const intervalData: { [key: number]: Ln2DataPoint[] } = {};
    filteredDataPoints.forEach((point) => {
      const idx = getIntervalIndex(point.timestamp);
      if (!intervalData[idx]) intervalData[idx] = [];
      intervalData[idx].push(point);
    });

    const intervalValues: { [key: number]: { ln2_mass_kg: number | null; evaporation_rate_kg_per_h: number | null } } = {};
    Object.keys(intervalData).forEach((key) => {
      const index = parseInt(key);
      const points = intervalData[index];
      if (points.length > 0) {
        const sorted = [...points].sort((a, b) => {
          const dateA = parseTimestamp(a.timestamp);
          const dateB = parseTimestamp(b.timestamp);
          if (!dateA || !dateB) return 0;
          return dateB.getTime() - dateA.getTime();
        });
        const latest = sorted[0];
        intervalValues[index] = {
          ln2_mass_kg: latest.ln2_mass_kg,
          evaporation_rate_kg_per_h: latest.evaporation_rate_kg_per_h,
        };
      }
    });

    const ln2MassData: (number | null)[] = [];
    const evapRateData: (number | null)[] = [];
    for (let i = INTERVALS_COUNT - 1; i >= 0; i--) {
      if (intervalValues[i]) {
        ln2MassData.push(intervalValues[i].ln2_mass_kg);
        evapRateData.push(intervalValues[i].evaporation_rate_kg_per_h);
      } else {
        ln2MassData.push(null);
        evapRateData.push(null);
      }
    }

    return {
      labels: intervalLabels,
      datasets: [
        {
          label: 'LN2 Mass (kg)',
          data: ln2MassData,
          borderColor: palette.ln2_mass_kg,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: false,
          spanGaps: true,
        },
        {
          label: 'Evaporation Rate (kg/h)',
          data: evapRateData,
          borderColor: palette.evaporation_rate_kg_per_h,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: false,
          hidden: evapRateData.every((v) => v === null),
          spanGaps: true,
        },
      ],
    };
  }, [dataPoints]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: { boxWidth: 8, boxHeight: 8, padding: 16, color: '#4B4B4B', usePointStyle: true, font: { size: 11 } },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          padding: 10,
          cornerRadius: 6,
        },
      },
      layout: { padding: { top: 0, right: 8, bottom: 0, left: 0 } },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          grid: { display: true, color: 'rgba(0,0,0,0.06)', borderDash: [2, 6] },
          ticks: { color: '#4B4B4B', font: { size: 11 }, maxRotation: 0, minRotation: 0 },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: (() => {
            const vals = filterDataByTimeWindow(dataPoints).flatMap((p) =>
              [p.ln2_mass_kg, p.evaporation_rate_kg_per_h].filter((v) => v != null)
            ) as number[];
            if (vals.length === 0) return 100;
            return Math.ceil(Math.max(...vals) / 10) * 10 + 10;
          })(),
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
          ticks: { stepSize: 10, color: '#6B6B6B', font: { size: 10 } },
          border: { display: false },
        },
      },
    }),
    [dataPoints]
  );

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[460px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-black text-[16px]">LN2 Readings</h3>
        <div className="flex items-center gap-3">
          {isConnected && wsRef.current?.readyState === WebSocket.OPEN && (
            <span className="text-xs text-green-600">● Connected</span>
          )}
          {(!isConnected || wsRef.current?.readyState !== WebSocket.OPEN) && !error && (
            <span className="text-xs text-yellow-600">● Connecting...</span>
          )}
          {error && <span className="text-xs text-red-600">● {error}</span>}
        </div>
      </div>

      {error && !isConnected && (
        <div className="text-red-500 text-xs mb-2" role="alert">
          {error}
        </div>
      )}

      <div className="h-[380px]">
        {filterDataByTimeWindow(dataPoints).length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
            {!isConnected || wsRef.current?.readyState !== WebSocket.OPEN
              ? 'Connecting...'
              : isConnected && wsRef.current?.readyState === WebSocket.OPEN && !hasReceivedData
                ? 'No data available'
                : 'Waiting for data...'}
          </div>
        ) : (
          <Line data={chartData} options={chartOptions as any} />
        )}
      </div>
    </div>
  );
}
