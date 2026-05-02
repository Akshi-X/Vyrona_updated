import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ivfService } from '../../../services/ivfService';
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
import { authUtils } from '../../../utils/auth';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

export const KPI_TABS = [
  { id: 'temp_external', label: 'External Temperature', unit: '°C' },
  { id: 'temp_internal', label: 'Internal Temperature', unit: '°C' },
  { id: 'ln2_level', label: 'LN2', unit: 'kg' },
  { id: 'ln2_evaporation_rate', label: 'Evaporation Rate', unit: 'kg/h' },
  { id: 'tive_battery_percentage', label: 'Battery Level', unit: '%' },
  { id: 'ln2_lid_state', label: 'Lid State', unit: '' },
  { id: 'shock', label: 'Shock Detection', unit: '' },
] as const;

export type KpiTabId = (typeof KPI_TABS)[number]['id'];

type KpiThresholdLine = { kind: 'min' | 'max'; value: number; label: string };
type KpiThresholdConfig = { min: number | null; max: number | null; lines: KpiThresholdLine[] };
type KpiThresholdMap = Record<string, KpiThresholdConfig>;

const DEFAULT_TAB_UNIT_MAP = KPI_TABS.reduce<Record<string, string>>((acc, tab) => {
  acc[tab.id] = tab.unit;
  return acc;
}, {});

const KPI_ORDER = [
  'temp_external',
  'temp_internal',
  'ln2_level',
  'ln2_evaporation_rate',
  'tive_battery_percentage',
  'ln2_lid_state',
  'shock',
] as const;

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
    const lines: KpiThresholdLine[] = [];
    const seen = new Set<string>();

    const pushLine = (kind: 'min' | 'max', value: unknown, label: string) => {
      const parsed = toFiniteNumber(value);
      if (parsed == null) return;
      const key = `${label}:${parsed}`;
      if (seen.has(key)) return;
      seen.add(key);
      lines.push({ kind, value: parsed, label });
    };

    // Shape A: named bands (e.g. "LN2 L1", "LN2 L2")
    const entries = Object.entries(groups);
    const l1Entry = entries.find(([name]) => name.toLowerCase().includes('l1'))?.[1] ?? null;
    const l2Entry = entries.find(([name]) => name.toLowerCase().includes('l2'))?.[1] ?? null;
    const l3Entry = entries.find(([name]) => name.toLowerCase().includes('l3'))?.[1] ?? null;

    // Match Current Quality Status mapping so markers align between cards
    // L1 from L1.max (or L2.min fallback), L2 from L1.min (or L2.max fallback)
    pushLine('max', l1Entry?.max ?? l2Entry?.min, 'L1');
    pushLine('min', l1Entry?.min ?? l2Entry?.max, 'L2');
    pushLine('min', l2Entry?.min ?? l3Entry?.max ?? l3Entry?.min, 'L3');

    // Shape B: compact object fields (l1/l2/critical)
    pushLine('max', groups?.l1?.max, 'L1');
    pushLine('min', groups?.l1?.min, 'L2');
    pushLine('min', groups?.l2?.max, 'L2');
    pushLine('min', groups?.l2?.min, 'L3');
    pushLine('min', groups?.critical?.max, 'Critical');

    // Shape C: flat min/max fallback
    if (lines.length === 0) {
      pushLine('max', groups?.max, 'L1');
      pushLine('min', groups?.min, 'L2');
    }

    if (lines.length > 0) {
      return {
        min: Math.min(...lines.map((line) => line.value)),
        max: Math.max(...lines.map((line) => line.value)),
        lines,
      };
    }
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

/** Max readings to keep in state so 7D range has enough; display filters by time window. */
const MAX_READINGS_CAP = 250;
/** Time range: LIVE = last 10 min only (WebSocket). Others = static fetch from DB (1H/24H/7D = aggregated). */
const LIVE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const TIME_RANGES = [
  { id: 'LIVE' as const, label: 'LATEST', windowMs: LIVE_WINDOW_MS, durationMinutes: undefined },
  { id: '1H' as const, label: '1H', windowMs: 60 * 60 * 1000, durationMinutes: 60 },
  { id: '24H' as const, label: '24H', windowMs: 24 * 60 * 60 * 1000, durationMinutes: 1440 },
  { id: '7D' as const, label: '7D', windowMs: 7 * 24 * 60 * 60 * 1000, durationMinutes: 10080 },
] as const;
export type TimeRangeId = (typeof TIME_RANGES)[number]['id'] | 'CUSTOM';

/** Parse timestamp; treat ISO strings without timezone as UTC so we can show locale time. */
const parseTimestamp = (timestamp: string): Date | null => {
  try {
    if (!timestamp) return null;
    const normalized = timestamp.trim().replace(' ', 'T');
    // If no timezone suffix (Z or ±HH:MM), assume UTC so display in locale is correct
    const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(normalized);
    const toParse = hasTimezone ? normalized : `${normalized}${normalized.endsWith('Z') ? '' : 'Z'}`;
    const parsed = new Date(toParse);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

/** Format timestamp for axis: time (HH:MM); for 7D only, two lines: date then time. */
const formatTimeLabel = (timestamp: string, timeRange?: TimeRangeId): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;
  if (timeRange === '7D') {
    const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${datePart}, ${timePart}`;
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

/** Format timestamp as date + time (for tooltip hover); no seconds. */
const formatDateTimeLabel = (timestamp: string): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;
  const datePart = date.toLocaleDateString(undefined, {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart}, ${timePart}`;
};

function getKpiStats(reading: KpiReading, kpiName: string): { avg: number; min: number | null; max: number | null } | null {
  const k =
    reading.kpis.find((x) => x.name === kpiName) ??
    (kpiName === 'ln2_lid_state' ? reading.kpis.find((x) => x.name === 'lid_state') : null);
  if (!k) return null;

  const baseValue = typeof k.avg === 'number' && Number.isFinite(k.avg)
    ? k.avg
    : (typeof k.value === 'number' && Number.isFinite(k.value) ? k.value : null);

  if (baseValue == null) return null;

  let min = typeof k.min === 'number' && Number.isFinite(k.min) ? k.min : null;
  let max = typeof k.max === 'number' && Number.isFinite(k.max) ? k.max : null;
  let avg = baseValue;

  if (kpiName === 'lid_state' || kpiName === 'ln2_lid_state') {
    avg = avg >= 1 ? 1 : 0;
    min = min == null ? null : (min >= 1 ? 1 : 0);
    max = max == null ? null : (max >= 1 ? 1 : 0);
  }

  if (min != null && max != null && min > max) {
    const temp = min;
    min = max;
    max = temp;
  }

  return { avg, min, max };
}


/** Build display label from KPI name (e.g. temp_external -> Temp External). */
function kpiNameToLabel(name: string): string {
  const labelMap: Record<string, string> = {
    temp_internal: 'Internal Temperature',
    temp_external: 'External Temperature',
    shock: 'Shock Detection',
    tive_battery_percentage: 'Battery Level',
    ln2_level: 'LN2',
    ln2_evaporation_rate: 'Evaporation Rate',
    ln2_lid_state: 'Lid State',
  };
  if (labelMap[name]) return labelMap[name];

  return name
    .split('_')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function getKpiLabelFromLimits(limitGroup: unknown, kpiName: string): string {
  if (limitGroup && typeof limitGroup === 'object') {
    const names = Object.keys(limitGroup as Record<string, unknown>).filter(Boolean);
    if (names.length > 0) return names[0];
  }
  return kpiNameToLabel(kpiName);
}

interface IVFQualityTrackingChartProps {
  canisterNumber?: string;
  selectedKpiKey?: string | null;
  hideTabs?: boolean;
  onClose?: () => void;
}

export default function IVFQualityTrackingChart({
  canisterNumber,
  selectedKpiKey,
  hideTabs = false,
  onClose,
}: IVFQualityTrackingChartProps) {
  const tankId = canisterNumber != null ? String(canisterNumber) : undefined;
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

  const [kpiReadings, setKpiReadings] = useState<KpiReading[]>([]);
  /** Time range: 1H / 24H / 7D; drives API fetch and chart window; live data still appends. */
  const [timeRange, setTimeRange] = useState<TimeRangeId>('LIVE');
  /** Tabs strictly from DB kpi_config; until loaded, keep null-state. */
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
  const activeTabLabel = useMemo(() => {
    if (!activeTab) return '';
    return kpiTabs.find((tab) => tab.id === activeTab)?.label ?? kpiNameToLabel(activeTab);
  }, [activeTab, kpiTabs]);
  /** LIVE = last 10 min; 1H/24H/7D = filter by time window; CUSTOM = filter by selected dates. */
  const displayReadings = useMemo(() => {
    if (timeRange === 'CUSTOM') {
      // Date input gives YYYY-MM-DD which JS parses as UTC midnight.
      // IST midnight = UTC midnight - 5h30m, so subtract to align with backend query.
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const fromMs = appliedCustomFrom ? new Date(appliedCustomFrom).getTime() - IST_OFFSET_MS : 0;
      return kpiReadings.filter((r) => {
        const t = parseTimestamp(r.timestamp)?.getTime();
        return t != null && t >= fromMs;
      });
    }
    // LIVE: show all data received from backend — no fixed time window
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
    latestKpiTimestampRef.current = {};
    setHasLoadedKpiConfig(false);
    setKpiTabs([]);
    setKpiThresholds({});
    setActiveTab('');
  }, [tankId]);

  // Fetch KPI config (limits + units) for tabs and visualization
  useEffect(() => {
    if (!tankId) return;
    ivfService
      .getTankKpiConfig(tankId)
      .then((res) => {
        if (!isMountedRef.current) return;
        if (!res?.kpi_limits) {
          setHasLoadedKpiConfig(true);
          return;
        }
        const thresholdMap = Object.entries(res.kpi_limits as Record<string, unknown>).reduce<KpiThresholdMap>(
          (acc, [kpiName, limitGroup]) => {
            acc[kpiName] = extractThresholdConfigFromKpiLimits(kpiName, limitGroup);
            return acc;
          },
          {}
        );
        setKpiThresholds(thresholdMap);
        const keys = Object.keys(res.kpi_limits)
          .filter((name) => {
            const entry = (res.kpi_limits as Record<string, unknown>)[name];
            if (!entry || typeof entry !== 'object') return true;
            return Object.values(entry as Record<string, any>).some((band) => band?.alert_type != null);
          })
          .sort(
            (a, b) =>
              (KPI_ORDER.indexOf(a as (typeof KPI_ORDER)[number]) >= 0
                ? KPI_ORDER.indexOf(a as (typeof KPI_ORDER)[number])
                : KPI_ORDER.length) -
              (KPI_ORDER.indexOf(b as (typeof KPI_ORDER)[number]) >= 0
                ? KPI_ORDER.indexOf(b as (typeof KPI_ORDER)[number])
                : KPI_ORDER.length)
          );
        const tabs = keys.map((name) => ({
          id: name,
          label: getKpiLabelFromLimits((res.kpi_limits as Record<string, unknown>)[name], name) || 'null',
          unit: DEFAULT_TAB_UNIT_MAP[name] || '',
        }));
        setKpiTabs(tabs);
        setActiveTab((current) => (tabs.some((t) => t.id === current) ? current : tabs[0]?.id ?? ''));
        setHasLoadedKpiConfig(true);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setHasLoadedKpiConfig(true);
      });
  }, [tankId]);

  useEffect(() => {
    if (!selectedKpiKey) return;
    if (!kpiTabs.length) return;
    if (kpiTabs.some((tab) => tab.id === selectedKpiKey) && activeTab !== selectedKpiKey) {
      setActiveTab(selectedKpiKey);
    }
  }, [selectedKpiKey, kpiTabs, activeTab]);

  // Fetch KPI history when tank or time range changes. LIVE = raw limit. 1H/24H/7D = aggregated. CUSTOM = raw from selected start.
  useEffect(() => {
    if (!tankId) return;
    if (timeRange === 'CUSTOM' && !appliedCustomFrom) return;
    setHistoryLoaded(false);
    setIsRangeLoading(true);
    setNoDataForCustomDate(false);
    const requestSeq = ++historyRequestSeqRef.current;
    const apiCall =
      timeRange === 'CUSTOM' && appliedCustomFrom
        ? ivfService.getKpiHistoryByDate(tankId, appliedCustomFrom)
        : ivfService.getKpiHistory(tankId, TIME_RANGES.find((r) => r.id === timeRange)?.durationMinutes);
    apiCall
      .then((res) => {
        if (!isMountedRef.current || requestSeq != historyRequestSeqRef.current) return;
        const series = res?.kpi_series || {};
        const entries = Object.entries(series);
        if (entries.length === 0 && timeRange === 'CUSTOM') {
          setNoDataForCustomDate(true);
          setKpiReadings([]);
        }
        if (entries.length > 0) {
          const isStaticRange = timeRange !== 'LIVE';
          setKpiReadings((prev) => {
            const byTs = new Map<string, KpiReading>();
            const appendKpiPoint = (
              kpiName: string,
              point: {
                timestamp?: string;
                value?: number;
                avg?: number;
                min?: number;
                max?: number;
                count?: number;
                alert_count?: number;
                unit?: string;
              }
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
              const existing = byTs.get(timestamp);
              const alertCount = typeof point.alert_count === 'number' ? point.alert_count : 0;
              const nextKpi = {
                name: kpiName,
                value,
                avg: Number.isFinite(avg) ? avg : value,
                min: Number.isFinite(minValue) ? minValue : undefined,
                max: Number.isFinite(maxValue) ? maxValue : undefined,
                count: Number.isFinite(countValue) ? countValue : undefined,
                alert_count: alertCount,
                unit: point.unit ?? '',
              };
              if (existing) {
                const filtered = existing.kpis.filter((k) => k.name !== kpiName);
                existing.kpis = [...filtered, nextKpi];
                byTs.set(timestamp, existing);
              } else {
                byTs.set(timestamp, {
                  tank_id: res?.tank_id ?? 0,
                  tank_code: res?.tank_code ?? '',
                  timestamp,
                  kpis: [nextKpi],
                });
              }
            };

            // Static range (1H/24H/7D): use only API data so x-axis matches selected window. LIVE: merge with prev.
            if (!isStaticRange) {
              prev.forEach((reading) => {
                if (reading?.timestamp) byTs.set(reading.timestamp, reading);
              });
            }
            entries.forEach(([kpiName, points]) => {
              (points || []).forEach((point) => appendKpiPoint(kpiName, point));
            });

            const merged = Array.from(byTs.values()).sort(
              (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
            );
            merged.forEach((reading) => {
              const tsMs = parseTimestamp(reading.timestamp)?.getTime();
              if (!Number.isFinite(tsMs)) return;
              reading.kpis.forEach((k) => {
                if (!k?.name) return;
                const prevTs = latestKpiTimestampRef.current[k.name];
                if (prevTs == null || (tsMs as number) > prevTs) {
                  latestKpiTimestampRef.current[k.name] = tsMs as number;
                }
              });
            });
            return isStaticRange ? merged : merged.slice(-MAX_READINGS_CAP);
          });
          setHasReceivedData(true);
        }
      })
      .catch(() => {
      })
      .finally(() => {
        if (isMountedRef.current && requestSeq == historyRequestSeqRef.current) {
          setIsRangeLoading(false);
          setHistoryLoaded(true);
        }
      });
  }, [tankId, timeRange, appliedCustomFrom]);

  // WebSocket connected for all time ranges; live data applied to chart only when range is LIVE.
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0; // fresh attempts when canister or token changes
    if (!historyLoaded) return;   // wait for kpi-history fetch to complete first
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
            const live = timeRangeRef.current === 'LIVE';
            ws.send(JSON.stringify({ tank_id: Number.isFinite(numericTankId) ? numericTankId : tankId, live }));
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

            // Tank KPI update for current canister: accept any message with tank_id + kpis (match by tank_id only)
            const normalizedTankId = tankId != null ? String(tankId) : '';
            const isTankKpi =
              parsed.tank_id != null &&
              String(parsed.tank_id) === normalizedTankId &&
              Array.isArray(parsed.kpis) &&
              parsed.kpis.length > 0;
            if (isTankKpi) {
              // Only accept live socket data when range is LIVE; ignore for 1H / 24H / 7D (static API only)
              if (timeRangeRef.current !== 'LIVE') return;
              const groupedByTimestamp = new Map<string, Array<{ name: string; value: number; unit: string }>>();
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
                if (!groupedByTimestamp.has(ts)) groupedByTimestamp.set(ts, []);
                groupedByTimestamp.get(ts)!.push({
                  name,
                  value: Number(value),
                  unit: k?.unit ?? '',
                });
              });
              if (groupedByTimestamp.size === 0) return;
              setHasReceivedData(true);
              // When kpi_config didn't load (e.g. tank not in DB), derive tabs from incoming KPI names so chart can show data
              setKpiTabs((currentTabs) => {
                if (currentTabs.length > 0) return currentTabs;
                const names = new Set<string>();
                parsed.kpis.forEach((k: { name?: string }) => {
                  if (typeof k?.name === 'string' && k.name.trim()) names.add(k.name.trim());
                });
                if (names.size === 0) return currentTabs;
                const sorted = Array.from(names).sort(
                  (a, b) =>
                    (KPI_ORDER.indexOf(a as (typeof KPI_ORDER)[number]) >= 0
                      ? KPI_ORDER.indexOf(a as (typeof KPI_ORDER)[number])
                      : KPI_ORDER.length) -
                    (KPI_ORDER.indexOf(b as (typeof KPI_ORDER)[number]) >= 0
                      ? KPI_ORDER.indexOf(b as (typeof KPI_ORDER)[number])
                      : KPI_ORDER.length)
                );
                const tabs = sorted.map((id) => ({
                  id,
                  label: id
                    .split('_')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' '),
                  unit: DEFAULT_TAB_UNIT_MAP[id] ?? '',
                }));
                return tabs;
              });
              setActiveTab((current) => current || parsed.kpis[0]?.name || '');
              setKpiReadings((prev) => {
                const byTs = new Map(prev.map((r) => [r.timestamp, r]));
                groupedByTimestamp.forEach((incomingKpis, ts) => {
                  const existing = byTs.get(ts);
                  if (existing) {
                    const incomingNames = new Set(incomingKpis.map((k) => k.name));
                    const filteredExisting = existing.kpis.filter((k) => !incomingNames.has(k.name));
                    byTs.set(ts, { ...existing, kpis: [...filteredExisting, ...incomingKpis] });
                    return;
                  }
                  byTs.set(ts, {
                    tank_id: parsed.tank_id ?? 0,
                    tank_code: parsed.tank_code,
                    timestamp: ts,
                    kpis: incomingKpis,
                  });
                });
                const merged = Array.from(byTs.values()).sort(
                  (a, b) =>
                    (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
                );
                return merged.slice(-MAX_READINGS_CAP);
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
              String(parsed.tank_id) === normalizedTankId
            ) {
              if (timeRangeRef.current !== 'LIVE') return; // only apply live updates when LIVE
              const ts = typeof parsed.timestamp === 'string' ? parsed.timestamp : '';
              const tsMs = parseTimestamp(ts)?.getTime();
              if (!ts || !Number.isFinite(tsMs)) return;
              const rawKpis = [
                { name: 'temp_external', value: parsed.temp_external ?? parsed.frequency_results?.temp_external, unit: '°C' },
                { name: 'temp_internal', value: parsed.temp_internal ?? parsed.frequency_results?.temp_internal, unit: '°C' },
                { name: 'ln2_level', value: parsed.ln2_level, unit: '%' },
                { name: 'ln2_evaporation_rate', value: parsed.ln2_evaporation_rate, unit: 'kg/day' },
                { name: 'tive_battery_percentage', value: parsed.tive_battery_percentage, unit: '%' },
              ].filter((k) => k.value != null && Number.isFinite(Number(k.value)))
               .map((k) => ({ ...k, value: Number(k.value) }));
              const kpis = rawKpis.filter((k) => {
                const prevTs = latestKpiTimestampRef.current[k.name];
                if (prevTs != null && (tsMs as number) <= prevTs) return false;
                latestKpiTimestampRef.current[k.name] = tsMs as number;
                return true;
              });
              if (kpis.length === 0) return;
              const reading: KpiReading = {
                tank_id: parsed.tank_id ?? 0,
                tank_code: parsed.tank_code || tankId,
                timestamp: ts,
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
                return merged.slice(-MAX_READINGS_CAP);
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
  }, [tankId, token, historyLoaded]);

  // Always keep the server streaming live data regardless of chart range,
  // so Current Quality Status receives updates on all ranges.
  // The chart's onmessage handler already ignores data when range is not LIVE.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !tankId) return;
    const numericTankId = Number(tankId);
    ws.send(
      JSON.stringify({
        tank_id: Number.isFinite(numericTankId) ? numericTankId : tankId,
        live: true,
      })
    );
  }, [timeRange, tankId]);

  // Close custom picker when clicking outside
  useEffect(() => {
    if (!showCustomPicker) return;
    const handler = (e: MouseEvent) => {
      if (customPickerRef.current && !customPickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCustomPicker]);

  const plottedReadings = useMemo(() => {
    const sorted = [...displayReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    // For LIVE: filter to timestamps where the active KPI has a value so each tab
    // gets its own dynamic x-axis without blank gaps from other KPIs.
    if (timeRange === 'LIVE' && activeTab) {
      return sorted.filter((r) =>
        r.kpis?.some((k: any) => k.name === activeTab && k.value != null && Number.isFinite(Number(k.value)))
      );
    }
    return sorted;
  }, [displayReadings, timeRange, activeTab]);

  const chartData = useMemo(() => {
    const sorted = plottedReadings;
    const labels = sorted.map((r) => formatTimeLabel(r.timestamp, timeRange));
    const stats = sorted.map((r) => getKpiStats(r, activeTab));
    const values = stats.map((s) => (s ? s.avg : null));
    const numericAverages = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const avgSpan =
      numericAverages.length > 1
        ? Math.max(...numericAverages) - Math.min(...numericAverages)
        : 0;
    const visualPad = Math.max(avgSpan * 0.01, 0.01);
    const rangeValues = stats.map((s) => {
      if (!s) return null;
      let low = s.min ?? s.avg;
      let high = s.max ?? s.avg;
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      if (low > high) {
        const temp = low;
        low = high;
        high = temp;
      }
      if (Math.abs(high - low) < Number.EPSILON) {
        low -= visualPad / 2;
        high += visualPad / 2;
      }
      return [low, high];
    });
    const tab = kpiTabs.find((t) => t.id === activeTab);
    const unit = tab?.unit ?? '';
    const datasetLabel = unit
      ? `${tab?.label ?? activeTab} (${unit})`
      : `${tab?.label ?? activeTab}`;
    const showCandlestick = timeRange !== 'LIVE';
    const isLidKpi = activeTab === 'lid_state' || activeTab === 'ln2_lid_state';
    const showLidBar = isLidKpi && timeRange !== 'LIVE';

    // For lid state in non-LIVE: count open events per bucket (avg * count = open readings)
    const lidOpenCounts = showLidBar
      ? sorted.map((r) => {
          const k =
            r.kpis.find((x: any) => x.name === activeTab) ??
            r.kpis.find((x: any) => x.name === 'lid_state');
          if (!k) return null;
          const avg = typeof k.avg === 'number' ? k.avg : typeof k.value === 'number' ? k.value : null;
          const count = typeof k.count === 'number' ? k.count : 1;
          if (avg == null) return null;
          return Math.round(avg * count);
        })
      : [];

    const datasets: any[] = [];

    if (showLidBar) {
      datasets.push({
        type: 'bar',
        label: 'Lid Open Count',
        data: lidOpenCounts,
        backgroundColor: 'rgba(107, 17, 118, 0.55)',
        borderColor: 'rgba(107, 17, 118, 0.85)',
        borderWidth: 1,
        borderRadius: 0,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.9,
        order: 1,
        _isLidCount: true,
      });
      return { labels, datasets };
    }

    if (showCandlestick) {
      datasets.push({
        type: 'bar',
        label: `${tab?.label ?? activeTab} Range (Min–Max)`,
        data: rangeValues,
        backgroundColor: 'rgba(107, 17, 118, 0.26)',
        borderColor: 'rgba(107, 17, 118, 0.65)',
        borderWidth: 1.2,
        borderRadius: 0,
        borderSkipped: false,
        barPercentage: 0.78,
        categoryPercentage: 0.9,
        maxBarThickness: 14,
        order: 1,
        _isRange: true,
      });
    }

    datasets.push({
      type: 'line',
      label: showCandlestick ? `${datasetLabel} Avg` : datasetLabel,
      data: values,
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
      pointRadius: showCandlestick ? 0 : 2.5,
      pointHoverRadius: 4,
      pointBackgroundColor: '#6B1176',
      pointBorderColor: '#6B1176',
      pointBorderWidth: 0,
      tension: 0.3,
      fill: !showCandlestick,
      spanGaps: true,
      order: 2,
    });

    const thresholds = kpiThresholds[activeTab];
    const mergedThresholdLines = (() => {
      const sourceLines = thresholds?.lines ?? [];
      const grouped = new Map<string, { line: KpiThresholdLine; count: number }>();
      sourceLines.forEach((line) => {
        const key = line.value.toFixed(6);
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        grouped.set(key, { line, count: 1 });
      });
      return Array.from(grouped.values()).map(({ line, count }) => ({
        ...line,
        label: count > 1 ? 'Limit' : line.label,
      }));
    })();

    mergedThresholdLines.forEach((line, idx) => {
      datasets.push({
        label: line.label,
        data: values.map(() => line.value),
        borderColor: line.kind === 'max' ? 'rgba(220, 38, 38, 0.45)' : 'rgba(249, 115, 22, 0.45)',
        borderWidth: 1.5,
        borderDash: idx % 2 === 0 ? [4, 4] : [8, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: true,
      });
    });

    return { labels, datasets };
  }, [plottedReadings, activeTab, kpiTabs, kpiThresholds, timeRange]);

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

  const isLidKpi = activeTab === 'lid_state' || activeTab === 'ln2_lid_state';
  const showLidCountChart = isLidKpi && timeRange !== 'LIVE';

  const chartOptions = useMemo(() => {
    const sorted = plottedReadings;
    const stats = sorted.map((r) => getKpiStats(r, activeTab)).filter((v): v is { avg: number; min: number | null; max: number | null } => v != null);
    const values = stats.flatMap((s) => {
      const parts = [s.avg];
      if (s.min != null) parts.push(s.min);
      if (s.max != null) parts.push(s.max);
      return parts;
    });
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
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            color: '#4B4B4B',
            usePointStyle: true,
            font: { size: 11 },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          padding: 8,
          cornerRadius: 6,
          boxPadding: 2,
          titleFont: { size: 12 },
          bodyFont: { size: 11 },
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return '';
              const idx = items[0].dataIndex;
              if (idx >= sorted.length) return '';
              const r = sorted[idx];
              if (!r) return '';
              return timeRange !== 'LIVE' ? formatBucketRange(r.timestamp) : formatDateTimeLabel(r.timestamp);
            },
            label: (context: any) => {
              const toShortLabel = (rawLabel: string): string => {
                const normalized = String(rawLabel || '').toLowerCase();
                if (normalized.includes('avg')) return 'Avg';
                if (normalized.includes('lower limit')) return 'Lower';
                if (normalized.includes('upper limit')) return 'Upper';
                if (normalized.includes('critical')) return 'Critical';
                if (normalized.includes('l1')) return 'L1';
                if (normalized.includes('l2')) return 'L2';
                if (normalized.includes('l3')) return 'L3';
                return rawLabel || 'Value';
              };
              const formatNum = (value: number) => (Math.round(value * 100) / 100).toFixed(2);
              const parsedY = context.parsed?.y;
              if (parsedY == null) return '';
              const label = context.dataset.label || '';
              if (Boolean(context?.dataset?._isLidCount)) {
                return `Open: ${Math.round(parsedY)} time${Math.round(parsedY) !== 1 ? 's' : ''}`;
              }
              const isRangeDataset = Boolean(context?.dataset?._isRange);
              if (isRangeDataset) {
                const raw = context.raw;
                const min = Array.isArray(raw) ? raw[0] : null;
                const max = Array.isArray(raw) ? raw[1] : null;
                if (min == null || max == null) return '';
                const idx = context.dataIndex;
                const reading = idx < sorted.length ? sorted[idx] : null;
                const kpi = reading?.kpis?.find((k: any) => k.name === activeTab) ??
                  (activeTab === 'ln2_lid_state' ? reading?.kpis?.find((k: any) => k.name === 'lid_state') : null);
                const count = typeof kpi?.count === 'number' ? kpi.count : null;
                return `Range: ${formatNum(Number(min))}–${formatNum(Number(max))}${count != null ? ` (n=${count})` : ''}`;
              }
              if (activeTab === 'lid_state' || activeTab === 'ln2_lid_state') {
                const shortLabel = toShortLabel(label);
                const stateText = parsedY >= 1 ? 'Open' : 'Close';
                if (shortLabel === 'Avg') return `Avg: ${stateText}`;
                if (
                  shortLabel === 'Lower' ||
                  shortLabel === 'Upper' ||
                  shortLabel === 'Critical' ||
                  shortLabel === 'L1' ||
                  shortLabel === 'L2' ||
                  shortLabel === 'L3' ||
                  shortLabel === 'Limit'
                ) {
                  return `Limit: ${stateText}`;
                }
                return `State: ${stateText}`;
              }
              const shortLabel = toShortLabel(label);
              return `${shortLabel}: ${typeof parsedY === 'number' ? formatNum(parsedY) : parsedY}`;
            },
            afterBody: (items: any[]) => {
              if (!items?.length) return [];
              const idx = items[0].dataIndex;
              const r = idx < sorted.length ? sorted[idx] : null;
              if (!r) return [];
              const kpi = r.kpis?.find((k: any) => k.name === activeTab) ??
                (activeTab === 'ln2_lid_state' ? r.kpis?.find((k: any) => k.name === 'lid_state') : null);
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
          ticks: {
            color: '#4B4B4B',
            font: { size: 11 },
            maxRotation: 35,
            minRotation: 0,
            maxTicksLimit: 10,
            includeBounds: true,
          },
          border: { display: false },
        },
        y: showLidCountChart
          ? {
              min: 0,
              grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
              title: { display: true, text: 'Open count', color: '#6B6B6B', font: { size: 10 } },
              ticks: {
                color: '#6B6B6B',
                font: { size: 10 },
                stepSize: 1,
                callback: (value: string | number) => {
                  const n = Number(value);
                  return Number.isInteger(n) ? n : '';
                },
              },
              border: { display: false },
            }
          : {
              // Keep binary ticks at 0/1, but add headroom for visual breathing space.
              min: isLidKpi ? -0.2 : (minY != null ? minY - padding : undefined),
              max: isLidKpi ? 1.2 : (maxY != null ? maxY + padding : undefined),
              grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
              ticks: {
                color: '#6B6B6B',
                font: { size: 10 },
                stepSize: isLidKpi ? 1 : undefined,
                callback: (value: string | number) => {
                  if (!isLidKpi) {
                    const numericValue = Number(value);
                    if (!Number.isFinite(numericValue)) return String(value);
                    return Number(numericValue.toFixed(2)).toString();
                  }
                  const numericValue = Number(value);
                  if (Math.abs(numericValue - 0) < 1e-6) return 'Close';
                  if (Math.abs(numericValue - 1) < 1e-6) return 'Open';
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
    <div id="onboarding-ivf-quality-chart" className="w-full min-w-0 min-h-[360px] h-full flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-black text-[16px]">Quality Tracking</h3>
          {hideTabs && activeTabLabel && (
            <span className="text-xs text-gray-500">{activeTabLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isConnected && wsRef.current?.readyState === WebSocket.OPEN && (
            <span className="text-xs text-green-600">● Connected</span>
          )}
          {(!isConnected || wsRef.current?.readyState !== WebSocket.OPEN) && !error && (
            <span className="text-xs text-yellow-600">● Connecting...</span>
          )}
          {error && <span className="text-xs text-red-600">● {error}</span>}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-1 inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300"
              aria-label="Close chart"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* KPI Tabs (from DB kpi_config when available) */}
      {!hideTabs && (
        <div id="onboarding-chart-kpi-tabs" className="flex gap-1 mb-3 flex-wrap">
          {!hasLoadedKpiConfig ? (
            <span className="text-xs text-[#7C7C7C]">Loading...</span>
          ) : (
            kpiTabs.map((tab) => (
              <button
                key={tab.id}
                id={tab.id === 'ln2_level' ? 'onboarding-chart-tab-ln2' : undefined}
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
      )}

      {error && !isConnected && (
        <div className="text-red-500 text-xs mb-2" role="alert">
          {error}
        </div>
      )}

      <div className="min-h-[260px] flex-1 w-full min-w-0 relative">
        {!hasData ? (
          isRangeLoading ? (
            <div className="flex items-center justify-center h-full">
              <svg
                className="animate-spin h-8 w-8 text-[#6B1176]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-label="Loading"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
              {(() => {
                const noDataLabel =
                  timeRange === 'LIVE' ? 'No data available'
                  : timeRange === 'CUSTOM' ? `No data available for ${appliedCustomFrom}`
                  : timeRange === '1H' ? 'No data available for 1 hour'
                  : timeRange === '24H' ? 'No data available for 24 hours'
                  : timeRange === '7D' ? 'No data available for 7 days'
                  : 'No data available';
                return noDataForCustomDate
                  ? noDataLabel
                  : !hasLoadedKpiConfig
                  ? 'Loading...'
                  : !isConnected || wsRef.current?.readyState !== WebSocket.OPEN
                  ? 'Connecting...'
                  : isConnected && !hasReceivedData
                    ? noDataLabel
                    : 'Waiting for data...';
              })()}
            </div>
          )
        ) : (
          <>
            <Chart type="line" data={chartData} options={chartOptions as any} />
            {isRangeLoading && (
              <div
                className="absolute inset-0 bg-white/75 flex items-center justify-center z-10"
                aria-hidden="true"
              >
                <svg
                  className="animate-spin h-8 w-8 text-[#6B1176]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-label="Loading"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
          </>
        )}
      </div>

      {/* Time range toggle: fetch from API for range; live data still appends */}
      <div id="onboarding-chart-range-switcher" className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
        <span className="text-xs text-[#7C7C7C] mr-1">Range:</span>
        <div className="flex rounded-md border border-gray-200 overflow-hidden bg-gray-50">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              id={range.id === '24H' ? 'onboarding-chart-range-24h' : undefined}
              type="button"
              onClick={() => {
                if (range.id !== timeRange) setIsRangeLoading(true);
                setTimeRange(range.id);
                setShowCustomPicker(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                timeRange === range.id
                  ? 'bg-[#6B1176] text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Custom date range picker */}
        <div className="relative" ref={customPickerRef}>
          <button
            type="button"
            onClick={() => setShowCustomPicker((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              timeRange === 'CUSTOM'
                ? 'bg-[#6B1176] text-white border-[#6B1176]'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
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
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#6B1176]"
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
                  className="w-full py-1.5 text-xs font-medium rounded bg-[#6B1176] text-white disabled:opacity-40 hover:bg-[#591063] transition-colors"
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
