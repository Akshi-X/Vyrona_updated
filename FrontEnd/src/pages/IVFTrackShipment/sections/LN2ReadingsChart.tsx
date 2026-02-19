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

const MAX_DATA_POINTS = 200;

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

/** Format timestamp for x-axis - date on first row, time on second row */
const formatTimestampLabel = (timestamp: string): string => {
  const d = parseTimestamp(timestamp);
  if (!d) return '';
  const hours = d.getHours();
  const mins = d.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dateStr = `${month}/${day}`;
  return `${dateStr}\n${timeStr}`;
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
          return combined.length > MAX_DATA_POINTS ? combined.slice(-MAX_DATA_POINTS) : combined;
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

    return () => {
      isMountedRef.current = false;
      closeWebSocket();
    };
  }, [canisterNumber, token]);

  const chartData = useMemo(() => {
    const sorted = [...dataPoints].sort((a, b) => {
      const ta = parseTimestamp(a.timestamp)?.getTime() ?? 0;
      const tb = parseTimestamp(b.timestamp)?.getTime() ?? 0;
      return ta - tb;
    });
    const labels = sorted.map((p) => formatTimestampLabel(p.timestamp));
    const palette = { ln2_mass_kg: '#4A90E2', evaporation_rate_kg_per_h: '#E2A84A' } as const;

    return {
      labels,
      datasets: [
        {
          label: 'LN2 Mass (kg)',
          data: sorted.map((p) => p.ln2_mass_kg),
          borderColor: palette.ln2_mass_kg,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.2,
          fill: false,
          spanGaps: true,
        },
        {
          label: 'Evaporation Rate (kg/h)',
          data: sorted.map((p) => p.evaporation_rate_kg_per_h),
          borderColor: palette.evaporation_rate_kg_per_h,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.2,
          fill: false,
          hidden: sorted.every((p) => p.evaporation_rate_kg_per_h == null),
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
      layout: { padding: { top: 0, right: 8, bottom: 8, left: 0 } },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          grid: { display: true, color: 'rgba(0,0,0,0.06)', borderDash: [2, 6] },
          ticks: {
            color: '#4B4B4B',
            font: { size: 11 },
            maxRotation: 45,
            minRotation: 0,
            // Flexible: few points = show all labels; many points = auto-skip to fit
            maxTicksLimit: dataPoints.length <= 15 ? dataPoints.length : Math.min(20, Math.ceil(dataPoints.length / 2)),
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: (() => {
            const vals = dataPoints.flatMap((p) =>
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
        {dataPoints.length === 0 ? (
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
