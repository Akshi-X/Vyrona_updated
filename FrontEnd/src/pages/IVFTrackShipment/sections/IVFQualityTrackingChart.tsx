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

export const KPI_TABS = [
  { id: 'temp_external', label: 'Temp External', unit: '°C' },
  { id: 'temp_internal', label: 'Temp Internal', unit: '°C' },
  { id: 'ln2_level', label: 'LN2 Level', unit: '%' },
  { id: 'evaporation_rate', label: 'Evaporation Rate', unit: 'kg/h' },
  { id: 'battery_level', label: 'Battery Level', unit: '%' },
  { id: 'lid_status', label: 'Lid Status', unit: '' },
  { id: 'shock', label: 'Shock', unit: '' },
] as const;

export type KpiTabId = (typeof KPI_TABS)[number]['id'];

/** Optional upper/lower bounds for red threshold lines (null = no line). */
const KPI_THRESHOLDS: Partial<Record<KpiTabId, { min: number | null; max: number | null }>> = {
  temp_external: { min: 20, max: 35 },
  temp_internal: { min: -210, max: -190 },
  ln2_level: { min: 30, max: 100 },
  evaporation_rate: { min: null, max: 0.5 },
  battery_level: { min: 20, max: 100 },
};

interface KpiReading {
  tank_id: number;
  tank_code: string;
  timestamp: string;
  kpis: Array<{ name: string; value: number; unit: string }>;
}

const MAX_DATA_POINTS = 50;
/** Extra slots at end of timeline so the curve doesn't end at the right edge (responsive "beyond end"). */
const TIMELINE_BUFFER_SLOTS = 4;

const parseTimestamp = (timestamp: string): Date | null => {
  try {
    if (!timestamp) return null;
    const normalized = timestamp.trim().replace(' ', 'T');
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const formatTimeLabel = (timestamp: string): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const displayH = h % 12 || 12;
  return `${displayH}:${m} ${ampm}`;
};

function getKpiValue(reading: KpiReading, kpiName: string): number | null {
  const k = reading.kpis.find((x) => x.name === kpiName);
  if (k == null || typeof k.value !== 'number' || isNaN(k.value)) return null;
  return k.value;
}

/** Build display label from KPI name (e.g. temp_external -> Temp External). */
function kpiNameToLabel(name: string): string {
  return name
    .split('_')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

interface IVFQualityTrackingChartProps {
  canisterNumber?: string;
}

export default function IVFQualityTrackingChart({ canisterNumber }: IVFQualityTrackingChartProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const [kpiReadings, setKpiReadings] = useState<KpiReading[]>([]);
  /** Tabs from DB (kpi_config) when available; otherwise fallback to KPI_TABS. */
  const [kpiTabs, setKpiTabs] = useState<Array<{ id: string; label: string; unit: string }>>([...KPI_TABS]);
  const [activeTab, setActiveTab] = useState<string>('temp_external');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [hasReceivedData, setHasReceivedData] = useState(false);

  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    return `${baseUrl.replace(/^http/, 'ws')}/api/kpi/ws`;
  };

  const getManagerBranchOverride = (): string | undefined => {
    try {
      const role = (localStorage.getItem('user_role') || '').trim().toLowerCase();
      if (!role.includes('manager')) return undefined;
      const fromUrl =
        new URLSearchParams(window.location.search).get('branch_id_override') ||
        new URLSearchParams(window.location.search).get('branch_id') ||
        undefined;
      const fromSession = sessionStorage.getItem('ivf_selected_branch_id') || undefined;
      return fromUrl || fromSession || undefined;
    } catch {
      return undefined;
    }
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

  // Reset tabs when canister changes (until new config loads)
  useEffect(() => {
    if (!canisterNumber) return;
    setKpiTabs([...KPI_TABS]);
    setActiveTab('temp_external');
  }, [canisterNumber]);

  // Fetch KPI config (limits + units) for tabs and visualization; prefer over kpi_history's kpi_config
  useEffect(() => {
    if (!canisterNumber) return;
    ivfService
      .getTankKpiConfig(canisterNumber)
      .then((res) => {
        if (!isMountedRef.current || !res?.kpi_limits) return;
        const order = [
          'temp_external',
          'temp_internal',
          'ln2_level',
          'evaporation_rate',
          'battery_level',
          'lid_status',
          'shock',
        ];
        const keys = Object.keys(res.kpi_limits).sort(
          (a, b) => (order.indexOf(a) >= 0 ? order.indexOf(a) : order.length) - (order.indexOf(b) >= 0 ? order.indexOf(b) : order.length)
        );
        if (keys.length > 0) {
          const tabs = keys.map((name) => ({
            id: name,
            label: kpiNameToLabel(name),
            unit: (res.kpi_limits[name]?.unit as string) || '',
          }));
          setKpiTabs(tabs);
          setActiveTab((current) => (tabs.some((t) => t.id === current) ? current : tabs[0]?.id ?? current));
        }
      })
      .catch(() => {});
  }, [canisterNumber]);

  // Fetch KPI history (past data); tabs may already be set from kpi-config
  useEffect(() => {
    if (!canisterNumber) return;
    ivfService
      .getKpiHistory(canisterNumber, MAX_DATA_POINTS)
      .then((res) => {
        if (!isMountedRef.current) return;
        // Fallback: use history's kpi_config for tabs only when config endpoint didn't set them (still default)
        if (res?.kpi_config?.length) {
          const tabs = res.kpi_config.map((k) => ({
            id: k.name,
            label: kpiNameToLabel(k.name),
            unit: k.unit || '',
          }));
          setKpiTabs((prev) => {
            const isDefault = prev.length === KPI_TABS.length && prev[0]?.id === KPI_TABS[0].id;
            return isDefault ? tabs : prev;
          });
          setActiveTab((current) => (tabs.some((t) => t.id === current) ? current : tabs[0]?.id ?? current));
        }
        if (res?.history?.length) {
          setKpiReadings((prev) => {
            const byTs = new Map<string, KpiReading>();
            const normalize = (r: any): KpiReading | null => {
              const kpis = r.kpis ?? [];
              if (!kpis.length) return null;
              const timestamp = r.timestamp ?? (kpis[0] && typeof kpis[0].timestamp === 'string' ? kpis[0].timestamp : null);
              if (!timestamp) return null;
              const normalizedKpis = kpis.map((k: { name?: string; value?: number; unit?: string }) => ({
                name: k.name ?? '',
                value: typeof k.value === 'number' ? k.value : 0,
                unit: k.unit ?? '',
              }));
              return {
                tank_id: r.tank_id ?? 0,
                tank_code: r.tank_code ?? '',
                timestamp,
                kpis: normalizedKpis,
              };
            };
            [...(res.history || []), ...prev].forEach((r) => {
              const reading = normalize(r);
              if (reading) byTs.set(reading.timestamp, reading);
            });
            const merged = Array.from(byTs.values()).sort(
              (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
            );
            return merged.slice(-MAX_DATA_POINTS);
          });
          setHasReceivedData(true);
          const last = res.history[res.history.length - 1];
          const kpis = last?.kpis ?? [];
          const bat = kpis.find((k: { name: string }) => k.name === 'battery_level') as { value?: number } | undefined;
          if (bat != null && typeof bat.value === 'number') setBatteryLevel(bat.value);
        }
      })
      .catch(() => {});
  }, [canisterNumber]);

  // WebSocket for live KPI updates
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0; // fresh attempts when canister or token changes
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
        const params = new URLSearchParams({ token: authToken });
        const branchOverride = getManagerBranchOverride();
        if (branchOverride) params.set('branch_id_override', branchOverride);
        const ws = new WebSocket(`${getWebSocketUrl()}?${params.toString()}`);

        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }
          hasConnectedRef.current = true;
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
            const parsed: any = JSON.parse(event.data);
            if (parsed.type === 'subscription_confirmed') return;
            if (parsed.type === 'error') {
              setError(parsed.message || 'Unknown error');
              if (
                parsed.message &&
                (parsed.message.includes('token') || parsed.message.includes('Invalid canister'))
              ) {
                reconnectAttemptsRef.current = maxReconnectAttempts;
              }
              return;
            }

            // Tank KPI update for current canister: accept any message with tank_code + kpis (no type check)
            const isTankKpi =
              parsed.tank_code === canisterNumber &&
              Array.isArray(parsed.kpis) &&
              parsed.kpis.length > 0;
            if (isTankKpi) {
              const timestamp =
                parsed.timestamp ??
                (parsed.kpis[0] && typeof parsed.kpis[0].timestamp === 'string' ? parsed.kpis[0].timestamp : null);
              if (!timestamp) return;
              const normalizedKpis = parsed.kpis.map((k: { name?: string; value?: number; unit?: string }) => ({
                name: k.name ?? '',
                value: typeof k.value === 'number' ? k.value : 0,
                unit: k.unit ?? '',
              }));
              const reading: KpiReading = {
                tank_id: parsed.tank_id ?? 0,
                tank_code: parsed.tank_code,
                timestamp,
                kpis: normalizedKpis,
              };
              const bat = normalizedKpis.find((k: { name: string; value: number; unit: string }) => k.name === 'battery_level');
              if (bat != null && typeof bat.value === 'number') setBatteryLevel(bat.value);
              setHasReceivedData(true);
              setKpiReadings((prev) => {
                const byTs = new Map(prev.map((r) => [r.timestamp, r]));
                byTs.set(reading.timestamp, reading);
                const merged = Array.from(byTs.values()).sort(
                  (a, b) =>
                    (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
                );
                return merged.slice(-MAX_DATA_POINTS);
              });
              return;
            }

            // Legacy IVF quality (optional: could map to KPI if needed)
            const isQuality =
              parsed.type === 'ivf_quality' || parsed.type === undefined;
            const hasCanister = parsed.tank_code || parsed.canister_number || parsed.canister_id;
            const hasTs = parsed.timestamp;
            const hasTemp =
              parsed.temp_internal !== undefined ||
              parsed.frequency_results?.temp_internal !== undefined;
            if (isQuality && hasCanister && hasTs && hasTemp && parsed.tank_code === canisterNumber) {
              const kpis = [
                { name: 'temp_external', value: parsed.temp_external ?? parsed.frequency_results?.temp_external ?? 0, unit: '°C' },
                { name: 'temp_internal', value: parsed.temp_internal ?? parsed.frequency_results?.temp_internal ?? 0, unit: '°C' },
                { name: 'ln2_level', value: parsed.ln2_level ?? 0, unit: '%' },
                { name: 'evaporation_rate', value: parsed.evaporation_rate ?? 0, unit: 'kg/day' },
                { name: 'battery_level', value: parsed.battery_percentage ?? 0, unit: '%' },
              ];
              const reading: KpiReading = {
                tank_id: parsed.tank_id ?? 0,
                tank_code: parsed.tank_code || canisterNumber,
                timestamp: parsed.timestamp,
                kpis,
              };
              setHasReceivedData(true);
              setKpiReadings((prev) => {
                const byTs = new Map(prev.map((r) => [r.timestamp, r]));
                byTs.set(reading.timestamp, reading);
                const merged = Array.from(byTs.values()).sort(
                  (a, b) =>
                    (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
                );
                return merged.slice(-MAX_DATA_POINTS);
              });
            }
          } catch (err) {
            console.error('WS parse error:', err);
          }
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
            if (event.code === 1008) {
              const reason = event.reason?.trim() || 'Authentication failed. Please refresh the page.';
              setError(reason);
            }
            wsRef.current = null;
            return;
          }
          if (isMountedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            setError(null); // clear so "Connecting..." shows during retry
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current) connectWebSocket();
            }, reconnectDelay);
          } else {
            if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
              setError(
                hasConnectedRef.current
                  ? 'Failed to reconnect. Please refresh the page.'
                  : 'Could not connect to KPI updates. Check that the server is running and /api/kpi/ws is available.'
              );
            }
            wsRef.current = null;
          }
        };

        wsRef.current = ws;
      } catch (err) {
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
    const sorted = [...kpiReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    const labels = sorted.map((r) => formatTimeLabel(r.timestamp));
    const values = sorted.map((r) => getKpiValue(r, activeTab));
    const tab = kpiTabs.find((t) => t.id === activeTab);
    const unit = tab?.unit ?? '';

    // Extend timeline beyond last point so the curve doesn't end at the right edge
    const bufferLabels = [...labels, ...Array(TIMELINE_BUFFER_SLOTS).fill('')];
    const bufferValues = [...values, ...Array(TIMELINE_BUFFER_SLOTS).fill(null)];

    const datasets: any[] = [
      {
        label: `${tab?.label ?? activeTab} (${unit})`,
        data: bufferValues,
        borderColor: '#1a1a1a',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
        spanGaps: true,
      },
    ];

    const thresholds = KPI_THRESHOLDS[activeTab as KpiTabId];
    if (thresholds?.min != null) {
      datasets.push({
        label: 'Lower limit',
        data: [...values.map(() => thresholds.min), ...Array(TIMELINE_BUFFER_SLOTS).fill(thresholds.min)],
        borderColor: '#dc2626',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: true,
      });
    }
    if (thresholds?.max != null) {
      datasets.push({
        label: 'Upper limit',
        data: [...values.map(() => thresholds.max), ...Array(TIMELINE_BUFFER_SLOTS).fill(thresholds.max)],
        borderColor: '#dc2626',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: true,
      });
    }

    return { labels: bufferLabels, datasets };
  }, [kpiReadings, activeTab, kpiTabs]);

  const chartOptions = useMemo(() => {
    const sorted = [...kpiReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    const values = sorted.map((r) => getKpiValue(r, activeTab)).filter((v): v is number => v != null);
    const thresholds = KPI_THRESHOLDS[activeTab as KpiTabId];
    let minY: number | undefined;
    let maxY: number | undefined;
    if (values.length > 0) {
      minY = Math.min(...values);
      maxY = Math.max(...values);
    }
    if (thresholds?.min != null) {
      minY = minY != null ? Math.min(minY, thresholds.min) : thresholds.min;
    }
    if (thresholds?.max != null) {
      maxY = maxY != null ? Math.max(maxY, thresholds.max) : thresholds.max;
    }
    const padding = maxY != null && minY != null ? (maxY - minY) * 0.1 || 1 : 5;
    return {
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
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return '';
              const idx = items[0].dataIndex;
              const sorted = [...kpiReadings].sort(
                (a, b) =>
                  (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
              );
              if (idx >= sorted.length) return '';
              const r = sorted[idx];
              return r ? formatTimeLabel(r.timestamp) : '';
            },
            label: (context: any) => {
              const v = context.parsed?.y;
              if (v == null) return '';
              const label = context.dataset.label || '';
              return `${label}: ${typeof v === 'number' ? (Math.round(v * 100) / 100).toFixed(2) : v}`;
            },
          },
        },
      },
      layout: { padding: { top: 0, right: 8, bottom: 0, left: 0 } },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          grid: { display: true, color: 'rgba(0,0,0,0.06)', borderDash: [2, 6] },
          ticks: { color: '#4B4B4B', font: { size: 11 }, maxRotation: 45, maxTicksLimit: 12 },
          border: { display: false },
        },
        y: {
          min: minY != null ? minY - padding : undefined,
          max: maxY != null ? maxY + padding : undefined,
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
          ticks: { color: '#6B6B6B', font: { size: 10 } },
          border: { display: false },
        },
      },
    };
  }, [kpiReadings, activeTab, kpiTabs]);

  const hasData = kpiReadings.length > 0;

  return (
    <div className="w-full min-w-0 min-h-[360px] h-full flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h3 className="font-semibold text-black text-[16px]">Quality Tracking</h3>
        <div className="flex items-center gap-3">
          {batteryLevel != null && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md">
              <svg className="w-5 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="16" height="10" rx="2" fill="none" />
                <line x1="22" y1="11" x2="22" y2="13" />
                <rect
                  x="3"
                  y="8"
                  width={Math.max(0, Math.min(14, (14 * Math.round(batteryLevel)) / 100))}
                  height="8"
                  rx="1.5"
                  fill="#9C3AA6"
                />
              </svg>
              <span className="text-xs font-medium text-gray-700">{Math.round(batteryLevel)}%</span>
            </div>
          )}
          {isConnected && wsRef.current?.readyState === WebSocket.OPEN && (
            <span className="text-xs text-green-600">● Connected</span>
          )}
          {(!isConnected || wsRef.current?.readyState !== WebSocket.OPEN) && !error && (
            <span className="text-xs text-yellow-600">● Connecting...</span>
          )}
          {error && <span className="text-xs text-red-600">● {error}</span>}
        </div>
      </div>

      {/* KPI Tabs (from DB kpi_config when available) */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {kpiTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && !isConnected && (
        <div className="text-red-500 text-xs mb-2" role="alert">
          {error}
        </div>
      )}

      <div className="min-h-[260px] flex-1 w-full min-w-0 relative">
        {!hasData ? (
          <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
            {!isConnected || wsRef.current?.readyState !== WebSocket.OPEN
              ? 'Connecting...'
              : isConnected && !hasReceivedData
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
