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
  { id: 'ln2_evaporation_rate', label: 'Evaporation Rate', unit: 'kg/h' },
  { id: 'tive_battery_percentage', label: 'Battery Level', unit: '%' },
  { id: 'ln2_lid_state', label: 'Lid Status', unit: '' },
  { id: 'shock', label: 'Shock', unit: '' },
] as const;

export type KpiTabId = (typeof KPI_TABS)[number]['id'];

type KpiThresholdLine = { kind: 'min' | 'max'; value: number; label: string };
type KpiThresholdConfig = { min: number | null; max: number | null; lines: KpiThresholdLine[] };
type KpiThresholdMap = Record<string, KpiThresholdConfig>;

const DEFAULT_TAB_UNIT_MAP = KPI_TABS.reduce<Record<string, string>>((acc, tab) => {
  acc[tab.id] = tab.unit;
  return acc;
}, {});

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

/**
 * kpi_limits payload can contain multiple named thresholds per KPI
 * (example: LN2 L1 and LN2 L2). Keep every min/max as independent lines.
 */
const extractThresholdConfigFromKpiLimits = (
  kpiName: string,
  limitGroup: unknown
): KpiThresholdConfig => {
  if (!limitGroup || typeof limitGroup !== 'object') {
    return { min: null, max: null, lines: [] };
  }

  // Custom LN2 mapping requested:
  // - LN2 L1.max (100) => L1
  // - LN2 L1.min (60)  => L2
  // - LN2 L2.min (0)   => L3
  // - LN2 L2.max (59)  => ignored
  if (kpiName === 'ln2_level') {
    const groups = limitGroup as Record<string, any>;
    const l1 = groups['LN2 L1'] ?? groups['ln2 l1'] ?? null;
    const l2 = groups['LN2 L2'] ?? groups['ln2 l2'] ?? null;

    const l1Max = toFiniteNumber(l1?.max);
    const l1Min = toFiniteNumber(l1?.min);
    const l2Min = toFiniteNumber(l2?.min);

    const lines: KpiThresholdLine[] = [];
    if (l1Max != null) lines.push({ kind: 'max', value: l1Max, label: 'L1' });
    if (l1Min != null) lines.push({ kind: 'min', value: l1Min, label: 'L2' });
    if (l2Min != null) lines.push({ kind: 'min', value: l2Min, label: 'L3' });

    return {
      min: lines.length ? Math.min(...lines.map((line) => line.value)) : null,
      max: lines.length ? Math.max(...lines.map((line) => line.value)) : null,
      lines,
    };
  }

  const lines: KpiThresholdLine[] = [];
  Object.entries(limitGroup as Record<string, any>).forEach(([thresholdName, entry]) => {
    const min = toFiniteNumber(entry?.min);
    const max = toFiniteNumber(entry?.max);
    const alertType = typeof entry?.alert_type === 'string' ? entry.alert_type : '';
    const suffix = [thresholdName, alertType].filter(Boolean).join(' - ');

    if (min != null) {
      lines.push({
        kind: 'min',
        value: min,
        label: suffix ? `Lower limit (${suffix})` : 'Lower limit',
      });
    }
    if (max != null) {
      lines.push({
        kind: 'max',
        value: max,
        label: suffix ? `Upper limit (${suffix})` : 'Upper limit',
      });
    }
  });

  const mins = lines
    .filter((line) => line.kind === 'min')
    .map((line) => line.value)
    .filter((value): value is number => value != null);
  const maxes = lines
    .filter((line) => line.kind === 'max')
    .map((line) => line.value)
    .filter((value): value is number => value != null);

  return {
    min: mins.length ? Math.min(...mins) : null,
    max: maxes.length ? Math.max(...maxes) : null,
    lines,
  };
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
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

function getKpiValue(reading: KpiReading, kpiName: string): number | null {
  const k = reading.kpis.find((x) => x.name === kpiName);
  if (k == null || typeof k.value !== 'number' || isNaN(k.value)) return null;
  if (kpiName === 'lid_state') {
    // Enforce binary display: 0 = Close, 1 = Open.
    return k.value >= 1 ? 1 : 0;
  }
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
  const tankId = canisterNumber != null ? String(canisterNumber) : undefined;
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
  const [kpiThresholds, setKpiThresholds] = useState<KpiThresholdMap>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (!tankId) return;
    setKpiTabs([...KPI_TABS]);
    setKpiThresholds({});
    setActiveTab('temp_external');
  }, [tankId]);

  // Fetch KPI config (limits + units) for tabs and visualization; prefer over kpi_history's kpi_config
  useEffect(() => {
    if (!tankId) return;
    ivfService
      .getTankKpiConfig(tankId)
      .then((res) => {
        if (!isMountedRef.current || !res?.kpi_limits) return;
        const thresholdMap = Object.entries(res.kpi_limits as Record<string, unknown>).reduce<KpiThresholdMap>(
          (acc, [kpiName, limitGroup]) => {
            acc[kpiName] = extractThresholdConfigFromKpiLimits(kpiName, limitGroup);
            return acc;
          },
          {}
        );
        setKpiThresholds(thresholdMap);
        const order = [
          'temp_external',
          'temp_internal',
          'ln2_level',
          'ln2_evaporation_rate',
          'tive_battery_level',
          'lid_state',
          'shock',
        ];
        const keys = Object.keys(res.kpi_limits).sort(
          (a, b) => (order.indexOf(a) >= 0 ? order.indexOf(a) : order.length) - (order.indexOf(b) >= 0 ? order.indexOf(b) : order.length)
        );
        if (keys.length > 0) {
          const tabs = keys.map((name) => ({
            id: name,
            label: KPI_TABS.find((t) => t.id === name)?.label ?? kpiNameToLabel(name),
            unit: DEFAULT_TAB_UNIT_MAP[name] || '',
          }));
          setKpiTabs(tabs);
          setActiveTab((current) => (tabs.some((t) => t.id === current) ? current : tabs[0]?.id ?? current));
        }
      })
      .catch(() => {});
  }, [tankId]);

  // Fetch KPI history (past data); tabs may already be set from kpi-config
  useEffect(() => {
    if (!tankId) return;
    ivfService
      .getKpiHistory(tankId, MAX_DATA_POINTS)
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
          void last;
        }
      })
      .catch(() => {});
  }, [tankId]);

  // WebSocket for live KPI updates
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0; // fresh attempts when canister or token changes
    if (!tankId) {
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
          if (ws.readyState === WebSocket.OPEN && tankId) {
            const numericTankId = Number(tankId);
            ws.send(JSON.stringify({ tank_id: Number.isFinite(numericTankId) ? numericTankId : tankId }));
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
              parsed.tank_id != null &&
              String(parsed.tank_id) === tankId &&
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
            if (
              isQuality &&
              hasCanister &&
              hasTs &&
              hasTemp &&
              parsed.tank_id != null &&
              String(parsed.tank_id) === tankId
            ) {
              const kpis = [
                { name: 'temp_external', value: parsed.temp_external ?? parsed.frequency_results?.temp_external ?? 0, unit: '°C' },
                { name: 'temp_internal', value: parsed.temp_internal ?? parsed.frequency_results?.temp_internal ?? 0, unit: '°C' },
                { name: 'ln2_level', value: parsed.ln2_level ?? 0, unit: '%' },
                { name: 'ln2_evaporation_rate', value: parsed.ln2_evaporation_rate ?? 0, unit: 'kg/day' },
                { name: 'tive_battery_level', value: parsed.tive_battery_percentage ?? 0, unit: '%' },
              ];
              const reading: KpiReading = {
                tank_id: parsed.tank_id ?? 0,
                tank_code: parsed.tank_code || tankId,
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
  }, [tankId, token]);

  const chartData = useMemo(() => {
    const sorted = [...kpiReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    const labels = sorted.map((r) => formatTimeLabel(r.timestamp));
    const values = sorted.map((r) => getKpiValue(r, activeTab));
    const tab = kpiTabs.find((t) => t.id === activeTab);
    const unit = tab?.unit ?? '';
    const datasetLabel = unit
      ? `${tab?.label ?? activeTab} (${unit})`
      : `${tab?.label ?? activeTab}`;

    // Extend timeline beyond last point so the curve doesn't end at the right edge
    const bufferLabels = [...labels, ...Array(TIMELINE_BUFFER_SLOTS).fill('')];
    const bufferValues = [...values, ...Array(TIMELINE_BUFFER_SLOTS).fill(null)];

    const datasets: any[] = [
      {
        label: datasetLabel,
        data: bufferValues,
        borderColor: '#6B1176',
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) {
            return 'rgba(107, 17, 118, 0.75)';
          }
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(107, 17, 118, 0.75)');
          gradient.addColorStop(1, 'rgba(107, 17, 118, 0.08)');
          return gradient;
        },
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointBackgroundColor: '#6B1176',
        pointBorderColor: '#6B1176',
        pointBorderWidth: 0,
        tension: 0.3,
        fill: true,
        spanGaps: true,
      },
    ];

    const thresholds = kpiThresholds[activeTab];
    thresholds?.lines?.forEach((line, idx) => {
      datasets.push({
        label: line.label,
        data: [...values.map(() => line.value), ...Array(TIMELINE_BUFFER_SLOTS).fill(line.value)],
        borderColor: line.kind === 'max' ? 'rgba(220, 38, 38, 0.45)' : 'rgba(249, 115, 22, 0.45)',
        borderWidth: 1.5,
        borderDash: idx % 2 === 0 ? [4, 4] : [8, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: true,
      });
    });

    return { labels: bufferLabels, datasets };
  }, [kpiReadings, activeTab, kpiTabs, kpiThresholds]);

  const chartOptions = useMemo(() => {
    const sorted = [...kpiReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    const values = sorted.map((r) => getKpiValue(r, activeTab)).filter((v): v is number => v != null);
    const thresholds = kpiThresholds[activeTab];
    let minY: number | undefined;
    let maxY: number | undefined;
    if (values.length > 0) {
      minY = Math.min(...values);
      maxY = Math.max(...values);
    }
    thresholds?.lines?.forEach((line) => {
      minY = minY != null ? Math.min(minY, line.value) : line.value;
      maxY = maxY != null ? Math.max(maxY, line.value) : line.value;
    });
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
              if (activeTab === 'lid_state') {
                return `${label}: ${v >= 1 ? 'Open (1)' : 'Close (0)'}`;
              }
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
          // Keep binary ticks at 0/1, but add headroom for visual breathing space.
          min: activeTab === 'lid_state' ? -0.2 : (minY != null ? minY - padding : undefined),
          max: activeTab === 'lid_state' ? 1.2 : (maxY != null ? maxY + padding : undefined),
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
          ticks: {
            color: '#6B6B6B',
            font: { size: 10 },
            stepSize: activeTab === 'lid_state' ? 1 : undefined,
            callback: (value: string | number) => {
              if (activeTab !== 'lid_state') {
                const numericValue = Number(value);
                if (!Number.isFinite(numericValue)) return String(value);
                // Avoid float artifacts like 0.45000000000000007.
                return Number(numericValue.toFixed(2)).toString();
              }
              const numericValue = Number(value);
              if (Math.abs(numericValue - 0) < 1e-6) return 'Close';
              if (Math.abs(numericValue - 1) < 1e-6) return 'Open';
              // Hide labels for padded headroom ticks.
              return '';
            },
          },
          border: { display: false },
        },
      },
    };
  }, [kpiReadings, activeTab, kpiTabs, kpiThresholds]);

  const hasData = kpiReadings.length > 0;

  return (
    <div className="w-full min-w-0 min-h-[360px] h-full flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h3 className="font-semibold text-black text-[16px]">Quality Tracking</h3>
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

      {/* KPI Tabs (from DB kpi_config when available) */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {kpiTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-100 border-purple-300 text-purple-900'
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
