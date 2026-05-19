import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ivfService } from '../../services/ivfService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { authUtils } from '../../utils/auth';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

// ---------------------------------------------------------------------------
// KPI configuration for incubators
// ---------------------------------------------------------------------------
const INCUBATOR_KPI_TABS = [
  { id: 'incubator_temp',     label: 'Temperature',  unit: '°C'  },
  { id: 'incubator_co2',      label: 'CO₂',          unit: '%'   },
  { id: 'incubator_o2',       label: 'O₂',           unit: '%'   },
  { id: 'incubator_humidity', label: 'Humidity',      unit: '%'   },
  { id: 'incubator_ph',       label: 'pH',           unit: ''    },
  { id: 'incubator_voc',      label: 'VOC',          unit: 'ppb' },
  { id: 'incubator_lid_state',label: 'Lid State',    unit: ''    },
] as const;

type IncubatorKpiTabId = (typeof INCUBATOR_KPI_TABS)[number]['id'];

const KPI_ORDER: IncubatorKpiTabId[] = [
  'incubator_temp', 'incubator_co2', 'incubator_o2',
  'incubator_humidity', 'incubator_ph', 'incubator_voc', 'incubator_lid_state',
];

const DEFAULT_TAB_UNIT_MAP = INCUBATOR_KPI_TABS.reduce<Record<string, string>>((acc, tab) => {
  acc[tab.id] = tab.unit;
  return acc;
}, {});

// ---------------------------------------------------------------------------
// Threshold helpers (same logic as IVFQualityTrackingChart)
// ---------------------------------------------------------------------------
type KpiThresholdLine = { kind: 'min' | 'max'; value: number; label: string };
type KpiThresholdConfig = { min: number | null; max: number | null; lines: KpiThresholdLine[] };
type KpiThresholdMap = Record<string, KpiThresholdConfig>;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const extractThresholdConfig = (kpiName: string, limitGroup: unknown): KpiThresholdConfig => {
  if (!limitGroup || typeof limitGroup !== 'object') return { min: null, max: null, lines: [] };

  const isLidKpi = kpiName === 'incubator_lid_state';
  if (isLidKpi) return { min: null, max: null, lines: [] };

  const lines: KpiThresholdLine[] = [];
  Object.entries(limitGroup as Record<string, any>).forEach(([thresholdName, entry]) => {
    const min = toFiniteNumber(entry?.min);
    const max = toFiniteNumber(entry?.max);
    const alertType = typeof entry?.alert_type === 'string' ? entry.alert_type : '';
    const suffix = [thresholdName, alertType].filter(Boolean).join(' - ');
    if (min != null) lines.push({ kind: 'min', value: min, label: suffix ? `Lower limit (${suffix})` : 'Lower limit' });
    if (max != null) lines.push({ kind: 'max', value: max, label: suffix ? `Upper limit (${suffix})` : 'Upper limit' });
  });

  const mins = lines.filter((l) => l.kind === 'min').map((l) => l.value);
  const maxes = lines.filter((l) => l.kind === 'max').map((l) => l.value);
  return {
    min: mins.length ? Math.min(...mins) : null,
    max: maxes.length ? Math.max(...maxes) : null,
    lines,
  };
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface IncubatorKpiReading {
  incubator_id: number;
  incubator_code: string;
  chamber_id: string;
  timestamp: string;
  kpis: Array<{
    name: string;
    value: number;
    avg?: number;
    min?: number;
    max?: number;
    count?: number;
    alert_count?: number;
    unit: string;
  }>;
}

const MAX_READINGS_CAP = 250;
const LIVE_WINDOW_MS = 10 * 60 * 1000;

const TIME_RANGES = [
  { id: 'LIVE' as const,  label: 'LATEST', windowMs: LIVE_WINDOW_MS,              durationMinutes: undefined },
  { id: '1H'  as const,  label: '1H',     windowMs: 60 * 60 * 1000,              durationMinutes: 60 },
  { id: '24H' as const,  label: '24H',    windowMs: 24 * 60 * 60 * 1000,         durationMinutes: 1440 },
  { id: '7D'  as const,  label: '7D',     windowMs: 7 * 24 * 60 * 60 * 1000,     durationMinutes: 10080 },
] as const;
type TimeRangeId = (typeof TIME_RANGES)[number]['id'] | 'CUSTOM';

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------
const parseTimestamp = (timestamp: string): Date | null => {
  try {
    if (!timestamp) return null;
    const normalized = timestamp.trim().replace(' ', 'T');
    const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(normalized);
    const toParse = hasTimezone ? normalized : `${normalized}Z`;
    const parsed = new Date(toParse);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const formatTimeLabel = (timestamp: string, timeRange?: TimeRangeId): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;
  if (timeRange === '7D') {
    const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${datePart}, ${timePart}`;
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDateTimeLabel = (timestamp: string): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;
  return `${date.toLocaleDateString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

function getKpiStats(
  reading: IncubatorKpiReading,
  kpiName: string
): { avg: number; min: number | null; max: number | null } | null {
  const k = reading.kpis.find((x) => x.name === kpiName);
  if (!k) return null;

  const baseValue =
    typeof k.avg === 'number' && Number.isFinite(k.avg)
      ? k.avg
      : typeof k.value === 'number' && Number.isFinite(k.value)
      ? k.value
      : null;
  if (baseValue == null) return null;

  let min = typeof k.min === 'number' && Number.isFinite(k.min) ? k.min : null;
  let max = typeof k.max === 'number' && Number.isFinite(k.max) ? k.max : null;

  if (kpiName === 'incubator_lid_state') {
    const toState = (v: number | null) => (v == null ? null : v >= 1 ? 1 : 0);
    return { avg: baseValue >= 1 ? 1 : 0, min: toState(min), max: toState(max) };
  }

  if (min != null && max != null && min > max) { const t = min; min = max; max = t; }
  return { avg: baseValue, min, max };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface IncubatorQualityTrackingChartProps {
  incubatorId: number;
  chamberId: string;
  incubatorCode?: string;
  onLatestValues?: (vals: Record<string, number | string>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function IncubatorQualityTrackingChart({
  incubatorId,
  chamberId,
  incubatorCode,
  onLatestValues,
}: IncubatorQualityTrackingChartProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const latestKpiTimestampRef = useRef<Record<string, number>>({});
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRequestSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const timeRangeRef = useRef<TimeRangeId>('LIVE');
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const [kpiReadings, setKpiReadings] = useState<IncubatorKpiReading[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRangeId>('LIVE');
  const [kpiTabs, setKpiTabs] = useState<Array<{ id: string; label: string; unit: string }>>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [kpiThresholds, setKpiThresholds] = useState<KpiThresholdMap>({});
  const [hasLoadedKpiConfig, setHasLoadedKpiConfig] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [isRangeLoading, setIsRangeLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('');
  const [noDataForCustomDate, setNoDataForCustomDate] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const customPickerRef = useRef<HTMLDivElement>(null);

  const timeRangeConfig = TIME_RANGES.find((r) => r.id === timeRange) ?? TIME_RANGES[0];
  timeRangeRef.current = timeRange;

  const displayReadings = useMemo(() => {
    if (timeRange === 'CUSTOM') {
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const fromMs = appliedCustomFrom ? new Date(appliedCustomFrom).getTime() - IST_OFFSET_MS : 0;
      return kpiReadings.filter((r) => {
        const t = parseTimestamp(r.timestamp)?.getTime();
        return t != null && t >= fromMs;
      });
    }
    if (timeRange === 'LIVE') return kpiReadings;
    if (timeRangeConfig.windowMs == null) return kpiReadings;
    const windowStart = Date.now() - timeRangeConfig.windowMs;
    return kpiReadings.filter((r) => {
      const t = parseTimestamp(r.timestamp)?.getTime();
      return t != null && t >= windowStart;
    });
  }, [kpiReadings, timeRange, timeRangeConfig.windowMs, appliedCustomFrom]);

  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    return `${baseUrl.replace(/^http/, 'ws')}/api/ivf/quality/incubator-kpi-ws`;
  };

  const getManagerBranchOverride = (): string | undefined => {
    try {
      const role = (localStorage.getItem('user_role') || '').trim().toLowerCase();
      if (!role.includes('manager')) return undefined;
      return (
        new URLSearchParams(window.location.search).get('branch_id_override') ||
        new URLSearchParams(window.location.search).get('branch_id') ||
        sessionStorage.getItem('ivf_selected_branch_id') ||
        undefined
      );
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
        if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(1000, 'Component unmounting');
      } catch {}
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectingRef.current = false;
  };

  // Reset state when incubator or chamber changes
  useEffect(() => {
    latestKpiTimestampRef.current = {};
    setHasLoadedKpiConfig(false);
    setKpiTabs([]);
    setKpiThresholds({});
    setActiveTab('');
    setKpiReadings([]);
    setHasReceivedData(false);
    setHistoryLoaded(false);
    setError(null);
  }, [incubatorId, chamberId]);

  // Fetch KPI config for tabs and threshold lines
  useEffect(() => {
    ivfService
      .getIncubatorKpiConfig(incubatorId, chamberId)
      .then((res) => {
        if (!isMountedRef.current) return;
        if (!res?.kpi_limits) {
          setHasLoadedKpiConfig(true);
          return;
        }
        const thresholdMap = Object.entries(res.kpi_limits).reduce<KpiThresholdMap>(
          (acc, [kpiName, limitGroup]) => {
            acc[kpiName] = extractThresholdConfig(kpiName, limitGroup);
            return acc;
          },
          {}
        );
        setKpiThresholds(thresholdMap);

        // Build tabs from DB kpi_config; order by KPI_ORDER
        const keys = Object.keys(res.kpi_limits)
          .filter((name) => {
            const entry = (res.kpi_limits as Record<string, unknown>)[name];
            if (!entry || typeof entry !== 'object') return true;
            return Object.values(entry as Record<string, any>).some((band) => band?.alert_type != null);
          })
          .sort((a, b) => {
            const ai = KPI_ORDER.indexOf(a as IncubatorKpiTabId);
            const bi = KPI_ORDER.indexOf(b as IncubatorKpiTabId);
            return (ai >= 0 ? ai : KPI_ORDER.length) - (bi >= 0 ? bi : KPI_ORDER.length);
          });

        const tabs = keys.map((name) => {
          const tabDef = INCUBATOR_KPI_TABS.find((t) => t.id === name);
          return { id: name, label: tabDef?.label ?? name, unit: tabDef?.unit ?? '' };
        });
        setKpiTabs(tabs);
        setActiveTab((current) => (tabs.some((t) => t.id === current) ? current : tabs[0]?.id ?? ''));
        setHasLoadedKpiConfig(true);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        // Fall back to full INCUBATOR_KPI_TABS
        const tabs = INCUBATOR_KPI_TABS.map((t) => ({ id: t.id, label: t.label, unit: t.unit }));
        setKpiTabs(tabs);
        setActiveTab(tabs[0]?.id ?? '');
        setHasLoadedKpiConfig(true);
      });
  }, [incubatorId, chamberId]);

  // Fetch history when incubator/chamber/range changes
  useEffect(() => {
    if (timeRange === 'CUSTOM' && !appliedCustomFrom) return;
    setHistoryLoaded(false);
    setIsRangeLoading(true);
    setNoDataForCustomDate(false);
    const requestSeq = ++historyRequestSeqRef.current;

    const apiCall =
      timeRange === 'CUSTOM' && appliedCustomFrom
        ? ivfService.getIncubatorKpiHistoryByDate(incubatorId, appliedCustomFrom, chamberId)
        : ivfService.getIncubatorKpiHistory(incubatorId, chamberId, TIME_RANGES.find((r) => r.id === timeRange)?.durationMinutes);

    apiCall
      .then((res) => {
        if (!isMountedRef.current || requestSeq !== historyRequestSeqRef.current) return;
        const series = res?.kpi_series || {};
        const entries = Object.entries(series);
        if (entries.length === 0 && timeRange === 'CUSTOM') setNoDataForCustomDate(true);
        if (entries.length > 0) {
          const isStaticRange = timeRange !== 'LIVE';
          setKpiReadings((prev) => {
            const byTs = new Map<string, IncubatorKpiReading>();
            const appendPoint = (
              kpiName: string,
              point: { timestamp?: string; value?: number; avg?: number; min?: number; max?: number; count?: number; alert_count?: number; unit?: string }
            ) => {
              const timestamp = typeof point.timestamp === 'string' ? point.timestamp : '';
              if (!timestamp) return;
              const avg = typeof point.avg === 'number' ? point.avg : Number(point.avg ?? NaN);
              const fallbackValue = typeof point.value === 'number' ? point.value : Number(point.value ?? NaN);
              const value = Number.isFinite(avg) ? avg : fallbackValue;
              if (Number.isNaN(value)) return;
              const minValue = typeof point.min === 'number' ? point.min : Number(point.min ?? NaN);
              const maxValue = typeof point.max === 'number' ? point.max : Number(point.max ?? NaN);
              const countValue = typeof point.count === 'number' ? point.count : Number(point.count ?? NaN);
              const alertCount = typeof point.alert_count === 'number' ? point.alert_count : 0;
              const nextKpi = {
                name: kpiName, value,
                avg: Number.isFinite(avg) ? avg : value,
                min: Number.isFinite(minValue) ? minValue : undefined,
                max: Number.isFinite(maxValue) ? maxValue : undefined,
                count: Number.isFinite(countValue) ? countValue : undefined,
                alert_count: alertCount,
                unit: point.unit ?? '',
              };
              const existing = byTs.get(timestamp);
              if (existing) {
                existing.kpis = [...existing.kpis.filter((k) => k.name !== kpiName), nextKpi];
                byTs.set(timestamp, existing);
              } else {
                byTs.set(timestamp, {
                  incubator_id: res?.incubator_id ?? incubatorId,
                  incubator_code: res?.incubator_code ?? incubatorCode ?? '',
                  chamber_id: res?.chamber_id ?? chamberId,
                  timestamp,
                  kpis: [nextKpi],
                });
              }
            };

            if (!isStaticRange) prev.forEach((r) => { if (r?.timestamp) byTs.set(r.timestamp, r); });
            entries.forEach(([kpiName, points]) => (points || []).forEach((p) => appendPoint(kpiName, p)));

            const merged = Array.from(byTs.values()).sort(
              (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
            );
            merged.forEach((r) => {
              const tsMs = parseTimestamp(r.timestamp)?.getTime();
              if (!Number.isFinite(tsMs)) return;
              r.kpis.forEach((k) => {
                if (!k?.name) return;
                const prevTs = latestKpiTimestampRef.current[k.name];
                if (prevTs == null || (tsMs as number) > prevTs) latestKpiTimestampRef.current[k.name] = tsMs as number;
              });
            });
            return isStaticRange ? merged : merged.slice(-MAX_READINGS_CAP);
          });
          setHasReceivedData(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current && requestSeq === historyRequestSeqRef.current) {
          setIsRangeLoading(false);
          setHistoryLoaded(true);
        }
      });
  }, [incubatorId, chamberId, timeRange, appliedCustomFrom]);

  // WebSocket for live updates
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    if (!historyLoaded) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) { setError('Authentication token missing'); return; }
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) return;

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
          if (!isMountedRef.current) { ws.close(); return; }
          hasConnectedRef.current = true;
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
          isConnectingRef.current = false;
          setHasReceivedData(false);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ incubator_id: incubatorId, chamber_id: chamberId, live: timeRangeRef.current === 'LIVE' }));
          }
        };

        ws.onmessage = (event) => {
          if (!isMountedRef.current) return;
          try {
            const parsed: any = JSON.parse(event.data);
            if (parsed.type === 'subscription_confirmed') return;
            if (parsed.type === 'error') {
              setError(parsed.message || 'Unknown error');
              if (parsed.message?.includes('token')) reconnectAttemptsRef.current = maxReconnectAttempts;
              return;
            }

            // Only accept incubator_kpi messages matching our incubator+chamber
            const isIncubatorKpi =
              parsed.type === 'incubator_kpi' &&
              parsed.incubator_id != null &&
              Number(parsed.incubator_id) === incubatorId &&
              parsed.chamber_id === chamberId &&
              Array.isArray(parsed.kpis) &&
              parsed.kpis.length > 0;

            if (!isIncubatorKpi) return;
            if (timeRangeRef.current !== 'LIVE') return; // don't apply live to static ranges

            const groupedByTs = new Map<string, Array<{ name: string; value: number; unit: string }>>();
            parsed.kpis.forEach((k: { name?: string; value?: number; unit?: string; timestamp?: string }) => {
              const name = k?.name ?? '';
              if (!name) return;
              const value = typeof k.value === 'number' ? k.value : Number(k?.value);
              if (!Number.isFinite(value)) return;
              const ts =
                (typeof k?.timestamp === 'string' && k.timestamp.trim()) ||
                (typeof parsed?.timestamp === 'string' && parsed.timestamp.trim()) ||
                '';
              if (!ts) return;
              const tsMs = parseTimestamp(ts)?.getTime();
              if (!Number.isFinite(tsMs)) return;
              const prevTs = latestKpiTimestampRef.current[name];
              if (prevTs != null && (tsMs as number) <= prevTs) return;
              latestKpiTimestampRef.current[name] = tsMs as number;
              if (!groupedByTs.has(ts)) groupedByTs.set(ts, []);
              groupedByTs.get(ts)!.push({ name, value: Number(value), unit: k?.unit ?? '' });
            });
            if (groupedByTs.size === 0) return;

            setHasReceivedData(true);

            // Derive tabs from incoming KPI names if kpi_config returned nothing
            setKpiTabs((currentTabs) => {
              if (currentTabs.length > 0) return currentTabs;
              const names = new Set<string>();
              parsed.kpis.forEach((k: { name?: string }) => { if (k?.name?.trim()) names.add(k.name.trim()); });
              if (names.size === 0) return currentTabs;
              const sorted = Array.from(names).sort((a, b) => {
                const ai = KPI_ORDER.indexOf(a as IncubatorKpiTabId);
                const bi = KPI_ORDER.indexOf(b as IncubatorKpiTabId);
                return (ai >= 0 ? ai : KPI_ORDER.length) - (bi >= 0 ? bi : KPI_ORDER.length);
              });
              return sorted.map((id) => {
                const tabDef = INCUBATOR_KPI_TABS.find((t) => t.id === id);
                return { id, label: tabDef?.label ?? id, unit: tabDef?.unit ?? DEFAULT_TAB_UNIT_MAP[id] ?? '' };
              });
            });
            setActiveTab((c) => c || parsed.kpis[0]?.name || '');

            setKpiReadings((prev) => {
              const byTs = new Map(prev.map((r) => [r.timestamp, r]));
              groupedByTs.forEach((incomingKpis, ts) => {
                const existing = byTs.get(ts);
                if (existing) {
                  const incomingNames = new Set(incomingKpis.map((k) => k.name));
                  byTs.set(ts, { ...existing, kpis: [...existing.kpis.filter((k) => !incomingNames.has(k.name)), ...incomingKpis] });
                } else {
                  byTs.set(ts, {
                    incubator_id: parsed.incubator_id ?? incubatorId,
                    incubator_code: parsed.incubator_code ?? incubatorCode ?? '',
                    chamber_id: parsed.chamber_id ?? chamberId,
                    timestamp: ts,
                    kpis: incomingKpis,
                  });
                }
              });
              const merged = Array.from(byTs.values()).sort(
                (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
              );
              return merged.slice(-MAX_READINGS_CAP);
            });

            // Notify parent of latest values (for illustration panel)
            if (onLatestValues) {
              const latest: Record<string, number | string> = {};
              parsed.kpis.forEach((k: { name?: string; value?: number | string }) => {
                if (k?.name) latest[k.name] = k.value ?? '';
              });
              onLatestValues(latest);
            }
          } catch (err) {
            console.error('Incubator KPI WS parse error:', err);
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
            if (event.code === 1008) setError(event.reason?.trim() || 'Authentication failed. Please refresh.');
            wsRef.current = null;
            return;
          }
          if (isMountedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            setError(null);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current) connectWebSocket();
            }, reconnectDelay);
          } else {
            if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
              setError(
                hasConnectedRef.current
                  ? 'Failed to reconnect. Please refresh the page.'
                  : 'Could not connect to KPI updates. Check server.'
              );
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
  }, [incubatorId, chamberId, token, historyLoaded]);

  // Always stream live data regardless of chart range (for future real-time indicators)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ incubator_id: incubatorId, chamber_id: chamberId, live: true }));
  }, [timeRange, incubatorId, chamberId]);

  // Close custom picker on outside click
  useEffect(() => {
    if (!showCustomPicker) return;
    const handler = (e: MouseEvent) => {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target as Node)) setShowCustomPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCustomPicker]);

  const plottedReadings = useMemo(() => {
    const sorted = [...displayReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    if (timeRange === 'LIVE' && activeTab) {
      return sorted.filter((r) =>
        r.kpis?.some((k: any) => k.name === activeTab && k.value != null && Number.isFinite(Number(k.value)))
      );
    }
    return sorted;
  }, [displayReadings, timeRange, activeTab]);

  const bucketMinutes =
    timeRange === '1H' ? 1
    : timeRange === '24H' ? 20
    : timeRange === '7D' ? 180
    : timeRange === 'CUSTOM' ? 20
    : 0;

  const formatBucketRange = (timestamp: string): string => {
    const start = parseTimestamp(timestamp);
    if (!start) return formatDateTimeLabel(timestamp);
    const fmt = (d: Date) => {
      const day = String(d.getDate()).padStart(2, '0');
      const mon = String(d.getMonth() + 1);
      const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase().replace(' ', '');
      return `${day}/${mon} - ${time}`;
    };
    if (bucketMinutes === 0) return fmt(start);
    const end = new Date(start.getTime() + bucketMinutes * 60 * 1000);
    return `${fmt(start)} to ${fmt(end)}`;
  };

  const isLidKpi = activeTab === 'incubator_lid_state';
  const showLidCountChart = isLidKpi && timeRange !== 'LIVE';

  const chartData = useMemo(() => {
    const sorted = plottedReadings;
    const labels = sorted.map((r) => formatTimeLabel(r.timestamp, timeRange));
    const stats = sorted.map((r) => getKpiStats(r, activeTab));
    const values = stats.map((s) => (s ? s.avg : null));
    const numericAverages = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const avgSpan = numericAverages.length > 1 ? Math.max(...numericAverages) - Math.min(...numericAverages) : 0;
    const visualPad = Math.max(avgSpan * 0.01, 0.01);

    const rangeValues = stats.map((s) => {
      if (!s) return null;
      let low = s.min ?? s.avg;
      let high = s.max ?? s.avg;
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      if (low > high) { const t = low; low = high; high = t; }
      if (Math.abs(high - low) < Number.EPSILON) { low -= visualPad / 2; high += visualPad / 2; }
      return [low, high];
    });

    const tab = kpiTabs.find((t) => t.id === activeTab);
    const unit = tab?.unit ?? '';
    const datasetLabel = unit ? `${tab?.label ?? activeTab} (${unit})` : (tab?.label ?? activeTab);
    const showCandlestick = timeRange !== 'LIVE';

    const lidOpenCounts = showLidCountChart
      ? sorted.map((r) => {
          const k = r.kpis.find((x: any) => x.name === activeTab);
          if (!k) return null;
          const avg = typeof k.avg === 'number' ? k.avg : typeof k.value === 'number' ? k.value : null;
          const count = typeof k.count === 'number' ? k.count : 1;
          if (avg == null) return null;
          return Math.round(avg * count);
        })
      : [];

    const datasets: any[] = [];

    if (showLidCountChart) {
      datasets.push({
        type: 'bar', label: 'Lid Open Count', data: lidOpenCounts,
        backgroundColor: 'rgba(107, 17, 118, 0.55)', borderColor: 'rgba(107, 17, 118, 0.85)',
        borderWidth: 1, borderRadius: 0, borderSkipped: false, barPercentage: 0.7,
        categoryPercentage: 0.9, order: 1, _isLidCount: true,
      });
      return { labels, datasets };
    }

    if (showCandlestick) {
      datasets.push({
        type: 'bar', label: `${tab?.label ?? activeTab} Range (Min–Max)`, data: rangeValues,
        backgroundColor: 'rgba(107, 17, 118, 0.26)', borderColor: 'rgba(107, 17, 118, 0.65)',
        borderWidth: 1.2, borderRadius: 0, borderSkipped: false, barPercentage: 0.78,
        categoryPercentage: 0.9, maxBarThickness: 14, order: 1, _isRange: true,
      });
    }

    datasets.push({
      type: 'line',
      label: showCandlestick ? `${datasetLabel} Avg` : datasetLabel,
      data: values,
      borderColor: '#6b1176',
      backgroundColor: (context: any) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return 'rgba(107, 17, 118, 0.75)';
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, 'rgba(107, 17, 118, 0.75)');
        gradient.addColorStop(1, 'rgba(107, 17, 118, 0.08)');
        return gradient;
      },
      borderWidth: 2, pointRadius: showCandlestick ? 0 : 2.5, pointHoverRadius: 4,
      pointBackgroundColor: '#6b1176', pointBorderColor: '#6b1176', pointBorderWidth: 0,
      tension: 0.3, fill: !showCandlestick, spanGaps: true, order: 2,
    });

    // Threshold dashed lines
    const thresholds = kpiThresholds[activeTab];
    const mergedThresholdLines = (() => {
      const grouped = new Map<string, { line: KpiThresholdLine; count: number }>();
      (thresholds?.lines ?? []).forEach((line) => {
        const key = line.value.toFixed(6);
        const existing = grouped.get(key);
        if (existing) { existing.count += 1; return; }
        grouped.set(key, { line, count: 1 });
      });
      return Array.from(grouped.values()).map(({ line, count }) => ({ ...line, label: count > 1 ? 'Limit' : line.label }));
    })();

    mergedThresholdLines.forEach((line, idx) => {
      datasets.push({
        label: line.label, data: values.map(() => line.value),
        borderColor: line.kind === 'max' ? 'rgba(220, 38, 38, 0.45)' : 'rgba(249, 115, 22, 0.45)',
        borderWidth: 1.5, borderDash: idx % 2 === 0 ? [4, 4] : [8, 4],
        pointRadius: 0, tension: 0, fill: false, spanGaps: true,
      });
    });

    return { labels, datasets };
  }, [plottedReadings, activeTab, kpiTabs, kpiThresholds, timeRange, showLidCountChart]);

  const chartOptions = useMemo(() => {
    const sorted = plottedReadings;
    const stats = sorted.map((r) => getKpiStats(r, activeTab)).filter((v): v is { avg: number; min: number | null; max: number | null } => v != null);
    const allVals = stats.flatMap((s) => { const p = [s.avg]; if (s.min != null) p.push(s.min); if (s.max != null) p.push(s.max); return p; });
    const thresholds = kpiThresholds[activeTab];
    let minY: number | undefined, maxY: number | undefined;
    if (allVals.length > 0) { minY = Math.min(...allVals); maxY = Math.max(...allVals); }
    thresholds?.lines?.forEach((line) => {
      minY = minY != null ? Math.min(minY, line.value) : line.value;
      maxY = maxY != null ? Math.max(maxY, line.value) : line.value;
    });
    const padding = maxY != null && minY != null ? (maxY - minY) * 0.1 || 1 : 5;

    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' as const, labels: { boxWidth: 10, boxHeight: 10, padding: 14, color: '#4B4B4B', usePointStyle: true, font: { size: 11 } } },
        tooltip: {
          enabled: true, backgroundColor: 'rgba(20, 20, 20, 0.92)', padding: 8, cornerRadius: 6, boxPadding: 2,
          titleFont: { size: 12 }, bodyFont: { size: 11 },
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return '';
              const r = sorted[items[0].dataIndex];
              if (!r) return '';
              return timeRange !== 'LIVE' ? formatBucketRange(r.timestamp) : formatDateTimeLabel(r.timestamp);
            },
            label: (context: any) => {
              const formatNum = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
              const parsedY = context.parsed?.y;
              if (parsedY == null) return '';
              if (Boolean(context?.dataset?._isLidCount)) return `Open: ${Math.round(parsedY)} time${Math.round(parsedY) !== 1 ? 's' : ''}`;
              if (Boolean(context?.dataset?._isRange)) {
                const raw = context.raw;
                const min = Array.isArray(raw) ? raw[0] : null;
                const max = Array.isArray(raw) ? raw[1] : null;
                if (min == null || max == null) return '';
                const kpi = sorted[context.dataIndex]?.kpis?.find((k: any) => k.name === activeTab);
                const count = typeof kpi?.count === 'number' ? kpi.count : null;
                return `Range: ${formatNum(Number(min))}–${formatNum(Number(max))}${count != null ? ` (n=${count})` : ''}`;
              }
              if (isLidKpi) {
                const stateText = parsedY >= 1 ? 'Open' : 'Close';
                const label = String(context.dataset.label || '').toLowerCase();
                if (label.includes('avg')) return `Avg: ${stateText}`;
                if (label.includes('limit')) return `Limit: ${stateText}`;
                return `State: ${stateText}`;
              }
              const label = String(context.dataset.label || '');
              const normalized = label.toLowerCase();
              const shortLabel = normalized.includes('avg') ? 'Avg' : normalized.includes('lower') ? 'Lower' : normalized.includes('upper') ? 'Upper' : label || 'Value';
              return `${shortLabel}: ${typeof parsedY === 'number' ? formatNum(parsedY) : parsedY}`;
            },
            afterBody: (items: any[]) => {
              if (!items?.length) return [];
              const kpi = sorted[items[0].dataIndex]?.kpis?.find((k: any) => k.name === activeTab);
              const alertCount = kpi?.alert_count;
              if (!alertCount || alertCount <= 0) return [];
              return [`⚠ Alerts: ${alertCount}`];
            },
          },
        },
      },
      layout: { padding: { top: 0, right: 8, bottom: 0, left: 0 } },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          offset: true,
          grid: { display: true, color: 'rgba(0,0,0,0.06)', borderDash: [2, 6] },
          ticks: { color: '#4B4B4B', font: { size: 11 }, maxRotation: 35, minRotation: 0, maxTicksLimit: 10, includeBounds: true },
          border: { display: false },
        },
        y: showLidCountChart
          ? {
              min: 0,
              grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
              title: { display: true, text: 'Open count', color: '#6B6B6B', font: { size: 10 } },
              ticks: { color: '#6B6B6B', font: { size: 10 }, stepSize: 1, callback: (v: string | number) => { const n = Number(v); return Number.isInteger(n) ? n : ''; } },
              border: { display: false },
            }
          : {
              min: isLidKpi ? -0.2 : (minY != null ? minY - padding : undefined),
              max: isLidKpi ? 1.2 : (maxY != null ? maxY + padding : undefined),
              grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
              ticks: {
                color: '#6B6B6B', font: { size: 10 }, stepSize: isLidKpi ? 1 : undefined,
                callback: (value: string | number) => {
                  if (!isLidKpi) { const n = Number(value); return !Number.isFinite(n) ? String(value) : Number(n.toFixed(2)).toString(); }
                  const n = Number(value);
                  if (Math.abs(n - 0) < 1e-6) return 'Close';
                  if (Math.abs(n - 1) < 1e-6) return 'Open';
                  return '';
                },
              },
              border: { display: false },
            },
      },
    };
  }, [plottedReadings, activeTab, kpiTabs, kpiThresholds, timeRange, bucketMinutes, showLidCountChart, isLidKpi]);

  const hasData = displayReadings.length > 0;

  return (
    <div className="w-full min-w-0 min-h-[360px] h-full flex flex-col bg-white border border-line rounded-lg p-4">
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

      {/* KPI Tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {!hasLoadedKpiConfig ? (
          <span className="text-xs text-[#7C7C7C]">Loading...</span>
        ) : (
          kpiTabs.map((tab) => (
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
          ))
        )}
      </div>

      {error && !isConnected && <div className="text-red-500 text-xs mb-2" role="alert">{error}</div>}

      <div className="min-h-[260px] flex-1 w-full min-w-0 relative">
        {!hasData ? (
          isRangeLoading ? (
            <div className="flex items-center justify-center h-full">
              <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-label="Loading">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
              {!hasLoadedKpiConfig ? 'Loading...'
                : !isConnected || wsRef.current?.readyState !== WebSocket.OPEN ? 'Connecting...'
                : noDataForCustomDate ? `No data available for ${appliedCustomFrom}`
                : isConnected && !hasReceivedData ? 'Waiting for data...'
                : 'No data available'}
            </div>
          )
        ) : (
          <>
            <Chart type="line" data={chartData} options={chartOptions as any} />
            {isRangeLoading && (
              <div className="absolute inset-0 bg-white/75 flex items-center justify-center z-10" aria-hidden="true">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-label="Loading">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </>
        )}
      </div>

      {/* Time range buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
        <span className="text-xs text-[#7C7C7C] mr-1">Range:</span>
        <div className="flex rounded-md border border-gray-200 overflow-hidden bg-gray-50">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => {
                if (range.id !== timeRange) setIsRangeLoading(true);
                setTimeRange(range.id);
                setShowCustomPicker(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                timeRange === range.id ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="relative" ref={customPickerRef}>
          <button
            type="button"
            onClick={() => setShowCustomPicker((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              timeRange === 'CUSTOM' ? 'bg-primary text-white border-primary' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {timeRange === 'CUSTOM' && appliedCustomFrom ? appliedCustomFrom : 'Custom'}
          </button>
          {showCustomPicker && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]">
              <div className="flex flex-col gap-2">
                <input
                  type="date"
                  value={customFrom}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={!customFrom}
                  onClick={() => {
                    setAppliedCustomFrom(customFrom);
                    setTimeRange('CUSTOM');
                    setIsRangeLoading(true);
                    setShowCustomPicker(false);
                  }}
                  className="w-full py-1.5 text-xs font-medium rounded bg-primary text-white disabled:opacity-40 hover:bg-[#591063] transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
