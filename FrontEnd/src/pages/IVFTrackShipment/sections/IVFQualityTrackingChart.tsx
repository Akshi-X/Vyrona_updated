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

/** Max readings to keep in state so 7D range has enough; display filters by time window. */
const MAX_READINGS_CAP = 250;
/** Extra slots at end of timeline so the curve doesn't end at the right edge (responsive "beyond end"). */
const TIMELINE_BUFFER_SLOTS = 4;

/** Time range: LIVE = last 10 min only (WebSocket). Others = static fetch from DB (1H/24H/7D = aggregated). */
const LIVE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const TIME_RANGES = [
  { id: 'LIVE' as const, label: 'LIVE', windowMs: LIVE_WINDOW_MS, durationMinutes: undefined },
  { id: '1H' as const, label: '1H', windowMs: 60 * 60 * 1000, durationMinutes: 60 },
  { id: '24H' as const, label: '24H', windowMs: 24 * 60 * 60 * 1000, durationMinutes: 1440 },
  { id: '7D' as const, label: '7D', windowMs: 7 * 24 * 60 * 60 * 1000, durationMinutes: 10080 },
] as const;
export type TimeRangeId = (typeof TIME_RANGES)[number]['id'];

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

function getKpiValue(reading: KpiReading, kpiName: string): number | null {
  const k =
    reading.kpis.find((x) => x.name === kpiName) ??
    (kpiName === 'ln2_lid_state' ? reading.kpis.find((x) => x.name === 'lid_state') : null);
  if (k == null || typeof k.value !== 'number' || isNaN(k.value)) return null;
  if (kpiName === 'lid_state' || kpiName === 'ln2_lid_state') {
    // Enforce binary display: 0 = Close, 1 = Open.
    return k.value >= 1 ? 1 : 0;
  }
  return k.value;
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
}

export default function IVFQualityTrackingChart({ canisterNumber }: IVFQualityTrackingChartProps) {
  const tankId = canisterNumber != null ? String(canisterNumber) : undefined;
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const latestKpiTimestampRef = useRef<Record<string, number>>({});
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const timeRangeConfig = TIME_RANGES.find((r) => r.id === timeRange) ?? TIME_RANGES[0];
  timeRangeRef.current = timeRange;
  /** LIVE = last 10 min; 1H/24H/7D = filter by time window. */
  const displayReadings = useMemo(() => {
    if (timeRangeConfig.windowMs == null) return kpiReadings;
    const windowStart = Date.now() - timeRangeConfig.windowMs;
    return kpiReadings.filter((r) => {
      const t = parseTimestamp(r.timestamp)?.getTime();
      return t != null && t >= windowStart;
    });
  }, [kpiReadings, timeRange, timeRangeConfig.windowMs]);

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

  // Fetch KPI config (limits + units) for tabs and visualization; prefer over kpi_history's kpi_config
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
        const keys = Object.keys(res.kpi_limits).sort(
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

  // Fetch KPI history when tank or time range changes. LIVE = raw limit. 1H/24H/7D = aggregated (no limit in backend).
  useEffect(() => {
    if (!tankId) return;
    const rangeConfig = TIME_RANGES.find((r) => r.id === timeRange);
    const durationMinutes = rangeConfig?.durationMinutes;
    ivfService
      .getKpiHistory(tankId, durationMinutes)
      .then((res) => {
        if (!isMountedRef.current) return;
        setIsRangeLoading(false);
        const series = res?.kpi_series || {};
        const entries = Object.entries(series);
        if (entries.length > 0) {
          const isStaticRange = durationMinutes != null && durationMinutes > 0;
          setKpiReadings((prev) => {
            const byTs = new Map<string, KpiReading>();
            const appendKpiPoint = (kpiName: string, point: { timestamp?: string; value?: number; unit?: string }) => {
              const timestamp = typeof point.timestamp === 'string' ? point.timestamp : '';
              if (!timestamp) return;
              const value = typeof point.value === 'number' ? point.value : Number(point.value ?? 0);
              if (Number.isNaN(value)) return;
              const existing = byTs.get(timestamp);
              const nextKpi = {
                name: kpiName,
                value,
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
        } else {
          setIsRangeLoading(false);
        }
      })
      .catch(() => {
        if (isMountedRef.current) setIsRangeLoading(false);
      });
  }, [tankId, timeRange]);

  // WebSocket connected for all time ranges; live data applied to chart only when range is LIVE.
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
              setActiveTab((current) => {
                if (current && parsed.kpis.some((k: { name?: string }) => k?.name === current)) return current;
                const first = parsed.kpis[0]?.name;
                return typeof first === 'string' && first.trim() ? first.trim() : current;
              });
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
                { name: 'temp_external', value: parsed.temp_external ?? parsed.frequency_results?.temp_external ?? 0, unit: '°C' },
                { name: 'temp_internal', value: parsed.temp_internal ?? parsed.frequency_results?.temp_internal ?? 0, unit: '°C' },
                { name: 'ln2_level', value: parsed.ln2_level ?? 0, unit: '%' },
                { name: 'ln2_evaporation_rate', value: parsed.ln2_evaporation_rate ?? 0, unit: 'kg/day' },
                { name: 'tive_battery_percentage', value: parsed.tive_battery_percentage ?? 0, unit: '%' },
              ];
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
  }, [tankId, token]);

  // Tell server to send socket data only when LIVE; stop sending when 1H/24H/7D
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !tankId) return;
    const live = timeRange === 'LIVE';
    if (live) {
      const numericTankId = Number(tankId);
      ws.send(
        JSON.stringify({
          tank_id: Number.isFinite(numericTankId) ? numericTankId : tankId,
          live: true,
        })
      );
    } else {
      ws.send(JSON.stringify({ live: false }));
    }
  }, [timeRange, tankId]);

  const chartData = useMemo(() => {
    const sorted = [...displayReadings].sort(
      (a, b) => (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
    );
    const labels = sorted.map((r) => formatTimeLabel(r.timestamp, timeRange));
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
  }, [displayReadings, activeTab, kpiTabs, kpiThresholds, timeRange]);

  const chartOptions = useMemo(() => {
    const sorted = [...displayReadings].sort(
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
              const sorted = [...displayReadings].sort(
                (a, b) =>
                  (parseTimestamp(a.timestamp)?.getTime() ?? 0) - (parseTimestamp(b.timestamp)?.getTime() ?? 0)
              );
              if (idx >= sorted.length) return '';
              const r = sorted[idx];
              return r ? formatDateTimeLabel(r.timestamp) : '';
            },
            label: (context: any) => {
              const v = context.parsed?.y;
              if (v == null) return '';
              const label = context.dataset.label || '';
              if (activeTab === 'lid_state' || activeTab === 'ln2_lid_state') {
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
          min: activeTab === 'lid_state' || activeTab === 'ln2_lid_state' ? -0.2 : (minY != null ? minY - padding : undefined),
          max: activeTab === 'lid_state' || activeTab === 'ln2_lid_state' ? 1.2 : (maxY != null ? maxY + padding : undefined),
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false, borderDash: [2, 8] },
          ticks: {
            color: '#6B6B6B',
            font: { size: 10 },
            stepSize: activeTab === 'lid_state' || activeTab === 'ln2_lid_state' ? 1 : undefined,
            callback: (value: string | number) => {
              if (activeTab !== 'lid_state' && activeTab !== 'ln2_lid_state') {
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
  }, [displayReadings, activeTab, kpiTabs, kpiThresholds]);

  const hasData = displayReadings.length > 0;

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

      {error && !isConnected && (
        <div className="text-red-500 text-xs mb-2" role="alert">
          {error}
        </div>
      )}

      <div className="min-h-[260px] flex-1 w-full min-w-0 relative">
        {!hasData ? (
          <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
            {!hasLoadedKpiConfig
              ? 'Loading...'
              : !isConnected || wsRef.current?.readyState !== WebSocket.OPEN
              ? 'Connecting...'
              : isConnected && !hasReceivedData
                ? 'No data available'
                : 'Waiting for data...'}
          </div>
        ) : (
          <>
            <Line data={chartData} options={chartOptions as any} />
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
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-[#7C7C7C] mr-1">Range:</span>
        <div className="flex rounded-md border border-gray-200 overflow-hidden bg-gray-50">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => {
                if (range.id !== timeRange) setIsRangeLoading(true);
                setTimeRange(range.id);
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
      </div>
    </div>
  );
}
