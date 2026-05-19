import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import { ivfService } from '../../../services/ivfService';
import { KPI_TABS } from './IVFQualityTrackingChart';

const KPI_ORDER = [
  'temp_external',
  'temp_internal',
  'ln2_level',
  'ln2_evaporation_rate',
  'tive_battery_percentage',
  'ln2_lid_state',
  'shock',
] as const;

const DEFAULT_TAB_UNIT_MAP = KPI_TABS.reduce<Record<string, string>>((acc, tab) => {
  acc[tab.id] = tab.unit;
  return acc;
}, {});

const BATTERY_DEAD_THRESHOLD_MS = 2 * 60 * 1000 + 15 * 1000;
const BATTERY_DEAD_LEVEL_THRESHOLD = 5;
const DEAD_BATTERY_TOOLTIP =
  'Charge your device to show Internal Temperature, External Temperature, Shock Detection';


const parseTimestampToMs = (timestamp?: string): number | null => {
  if (!timestamp || typeof timestamp !== 'string') return null;
  const raw = timestamp.trim().replace(' ', 'T');
  const trimmedMicroseconds = raw.replace(/(\.\d{3})\d+/, '$1');
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(trimmedMicroseconds);
  const normalized = hasTimezone ? trimmedMicroseconds : `${trimmedMicroseconds}Z`;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeKpiValue = (name: string, rawValue: unknown): number | null => {
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : null;
  }
  if (typeof rawValue === 'boolean') {
    return rawValue ? 1 : 0;
  }
  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim().toLowerCase();
    const isLidKpi =
      name === 'ln2_lid_state' ||
      name === 'lid_state' ||
      name === 'lid_status';
    if (isLidKpi) {
      if (['open', 'opened', '1', 'true', 'on'].includes(normalized)) return 1;
      if (['close', 'closed', '0', 'false', 'off'].includes(normalized)) return 0;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};


const kpiNameToLabel = (name: string): string => {
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
};

const getKpiLabelFromLimits = (limitGroup: unknown, kpiName: string): string => {
  if (limitGroup && typeof limitGroup === 'object') {
    const names = Object.keys(limitGroup as Record<string, unknown>).filter(Boolean);
    if (names.length > 0) return names[0];
  }
  return kpiNameToLabel(kpiName);
};

const formatKpiValue = (name: string, value: number | null, unit?: string): string => {
  if (value == null) return '-';
  if (name === 'ln2_lid_state' || name === 'lid_state' || name === 'lid_status') {
    return value >= 1 ? 'Open' : 'Closed';
  }
  if (name === 'tive_battery_percentage') {
    return `${Math.round(value)}%`;
  }
  if (name === 'shock') {
    return `${Math.round(value)}`;
  }
  const unitLabel = unit || DEFAULT_TAB_UNIT_MAP[name] || '';
  const decimals = name.includes('temp') ? 1 : 1;
  const formatted = Number.isFinite(value) ? value.toFixed(decimals) : String(value);
  return unitLabel ? `${formatted}${unitLabel}` : formatted;
};

const formatTimeAgo = (nowTs: number, timestampMs: number | null): string | null => {
  if (timestampMs == null) return null;
  const diffMs = Math.max(0, nowTs - timestampMs);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return 'just now';
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 6) / 10;
    return `${hours} hours ago`;
  }
  return `${diffMinutes} min ago`;
};


type KpiLimits = Record<string, Record<string, { alert_type?: string | null }>>;

type LatestKpi = {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  tsMs: number;
};

export type CryocanSensorTile = {
  id: string;
  label: string;
  value: string;
  timestamp: string | null;
  isMissing: boolean;
  isMuted: boolean;
  tooltip?: string;
  history: number[];
};

export type IvfKpiSnapshot = {
  sensorTiles: CryocanSensorTile[];
  ln2Level: number | null;
  internalTemp: number | null;
  externalTemp: number | null;
  lidStatus: 'open' | 'closed' | null;
  kpiLimits: KpiLimits;
  isInitialLoading: boolean;
};

type UseIvfKpiSnapshotOptions = {
  tankId?: string;
  enabled?: boolean;
};

export function useIvfKpiSnapshot({ tankId, enabled = true }: UseIvfKpiSnapshotOptions): IvfKpiSnapshot {
  const normalizedTankId = tankId != null ? String(tankId) : undefined;
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const latestKpiTimestampRef = useRef<Record<string, number>>({});
  const latestByNameRef = useRef<Record<string, LatestKpi>>({});
  const kpiHistoryRef = useRef<Record<string, number[]>>({});

  const [kpiLimits, setKpiLimits] = useState<KpiLimits>({});
  const [latestByName, setLatestByName] = useState<Record<string, LatestKpi>>({});
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [tankMaxCapacity, setTankMaxCapacity] = useState<number | null>(null);
  const [tankMinCapacity, setTankMinCapacity] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [batteryTimestampMs, setBatteryTimestampMs] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

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

  const updateLatest = (incoming: LatestKpi[]) => {
    if (!incoming.length) return;
    let hasUpdate = false;
    let latestTs: number | null = null;

    setLatestByName((prev) => {
      const next = { ...prev };
      for (const kpi of incoming) {
        const prevTs = latestKpiTimestampRef.current[kpi.name];
        if (prevTs != null && kpi.tsMs < prevTs) continue;
        latestKpiTimestampRef.current[kpi.name] = kpi.tsMs;
        const existing = latestByNameRef.current[kpi.name];
        if (!existing || kpi.tsMs >= existing.tsMs) {
          next[kpi.name] = kpi;
          latestByNameRef.current[kpi.name] = kpi;
          const hist = kpiHistoryRef.current[kpi.name] ?? [];
          hist.push(kpi.value);
          if (hist.length > 20) hist.splice(0, hist.length - 20);
          kpiHistoryRef.current[kpi.name] = hist;
          hasUpdate = true;
          latestTs = latestTs == null ? kpi.tsMs : Math.max(latestTs, kpi.tsMs);
          if (kpi.name === 'tive_battery_percentage') {
            setBatteryTimestampMs(kpi.tsMs);
          }
        }
      }
      return hasUpdate ? next : prev;
    });

    if (hasUpdate && latestTs != null) {
      setLastUpdateAt(latestTs);
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    if (!normalizedTankId) {
      setKpiLimits({});
      return;
    }
    let cancelled = false;
    ivfService
      .getTankKpiConfig(normalizedTankId)
      .then((res) => {
        if (cancelled) return;
        setKpiLimits((res?.kpi_limits ?? {}) as KpiLimits);
        setTankMaxCapacity(res?.tank_max_capacity_reading ?? null);
        setTankMinCapacity(res?.tank_min_capacity_reading ?? null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [normalizedTankId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!normalizedTankId) return;
    setIsInitialLoading(true);
    latestKpiTimestampRef.current = {};
    latestByNameRef.current = {};
    kpiHistoryRef.current = {};
    setLatestByName({});

    ivfService
      .getKpiHistory(normalizedTankId)
      .then((res) => {
        if (!isMountedRef.current || !res?.kpi_series) return;
        const latestEntries: LatestKpi[] = [];
        Object.entries(res.kpi_series).forEach(([name, points]) => {
          const kpiName = name.trim();
          if (!kpiName) return;
          if (!Array.isArray(points) || points.length === 0) return;
          const latest = points[points.length - 1];
          const numericValue = normalizeKpiValue(kpiName, latest?.value);
          if (numericValue == null) return;
          if (typeof latest?.timestamp !== 'string' || !latest.timestamp.trim()) return;
          const tsMs = parseTimestampToMs(latest.timestamp);
          if (tsMs == null) return;
          latestEntries.push({
            name: kpiName,
            value: numericValue,
            unit: latest?.unit || '',
            timestamp: latest.timestamp,
            tsMs,
          });
        });
        updateLatest(latestEntries);
      })
      .catch(() => {})
      .finally(() => {
        if (!isMountedRef.current) return;
        setIsInitialLoading(false);
      });
  }, [normalizedTankId, enabled]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled) return;
    if (!normalizedTankId) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) return;

    const params = new URLSearchParams({ token: authToken });
    const branchOverride = getManagerBranchOverride();
    if (branchOverride) params.set('branch_id_override', branchOverride);
    const ws = new WebSocket(`${getWebSocketUrl()}?${params.toString()}`);

    ws.onopen = () => {
      if (normalizedTankId) {
        const numericTankId = Number(normalizedTankId);
        ws.send(JSON.stringify({ tank_id: Number.isFinite(numericTankId) ? numericTankId : normalizedTankId }));
      }
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const data: any = JSON.parse(event.data);
        if (data.type === 'subscription_confirmed') return;
        if (data.type === 'error') return;
        const incomingKpis: LatestKpi[] = Array.isArray(data.kpis)
          ? data.kpis
              .map((k: any) => {
                const name = typeof k?.name === 'string' ? k.name.trim() : '';
                if (!name) return null;
                const value = normalizeKpiValue(name, k?.value);
                if (value == null) return null;
                const timestamp =
                  typeof k?.timestamp === 'string'
                    ? k.timestamp
                    : typeof data?.timestamp === 'string'
                      ? data.timestamp
                      : undefined;
                const tsMs = parseTimestampToMs(timestamp);
                if (tsMs == null || !timestamp) return null;
                return {
                  name,
                  value,
                  unit: typeof k?.unit === 'string' ? k.unit : '',
                  timestamp,
                  tsMs,
                };
              })
              .filter((kpi: LatestKpi | null): kpi is LatestKpi => kpi != null)
          : typeof data.kpi_name === 'string'
            ? (() => {
                const value = normalizeKpiValue(data.kpi_name, data.kpi_value);
                const timestamp = typeof data.timestamp === 'string' ? data.timestamp : undefined;
                const tsMs = parseTimestampToMs(timestamp);
                if (value == null || !timestamp || tsMs == null) return [];
                return [
                  {
                    name: data.kpi_name,
                    value,
                    unit: data.kpi_unit || '',
                    timestamp,
                    tsMs,
                  },
                ];
              })()
            : [];

        const messageMatchesTank = data.tank_id == null || String(data.tank_id) === normalizedTankId;
        if (messageMatchesTank && incomingKpis.length) {
          updateLatest(incomingKpis);
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {};
    wsRef.current = ws;

    return () => {
      isMountedRef.current = false;
      try {
        wsRef.current?.close(1000, 'unmount');
      } catch {}
      wsRef.current = null;
    };
  }, [normalizedTankId, token, enabled]);

  const batteryStatusTimestampMs = batteryTimestampMs ?? lastUpdateAt;
  const batteryLevel = latestByName['tive_battery_percentage']?.value ?? null;
  const batteryDead =
    batteryLevel != null &&
    batteryLevel <= BATTERY_DEAD_LEVEL_THRESHOLD &&
    batteryStatusTimestampMs != null &&
    nowTs - batteryStatusTimestampMs >= BATTERY_DEAD_THRESHOLD_MS;

  const ln2LevelRaw = latestByName['ln2_level']?.value ?? null;
  const ln2_100per =
    tankMaxCapacity != null && tankMinCapacity != null ? tankMaxCapacity - tankMinCapacity : null;
  const ln2LevelPercent =
    ln2LevelRaw != null && ln2_100per != null && ln2_100per > 0
      ? Math.floor((ln2LevelRaw / ln2_100per) * 100)
      : ln2LevelRaw;

  const internalTemp = latestByName['temp_internal']?.value ?? null;
  const externalTemp = latestByName['temp_external']?.value ?? null;
  const lidValue =
    latestByName['ln2_lid_state']?.value ??
    latestByName['lid_state']?.value ??
    latestByName['lid_status']?.value ??
    null;
  const lidStatus = lidValue == null ? null : lidValue >= 1 ? 'open' : 'closed';

  const kpiTabs = useMemo(() => {
    const keys = Object.keys(kpiLimits)
      .filter((name) => {
        const entry = kpiLimits[name];
        if (!entry || typeof entry !== 'object') return true;
        return Object.values(entry).some((band) => band?.alert_type != null);
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
    return keys.map((name) => ({
      id: name,
      label: getKpiLabelFromLimits(kpiLimits[name], name) || 'null',
      unit: DEFAULT_TAB_UNIT_MAP[name] || '',
    }));
  }, [kpiLimits]);

  const sensorTiles = useMemo<CryocanSensorTile[]>(() => {
    const tiles = kpiTabs.map((tab) => {
      const latest = latestByName[tab.id];
      const value = latest ? latest.value : null;
      const tsMs = latest ? latest.tsMs : null;
      const isMuted =
        batteryDead &&
        (tab.id === 'temp_internal' || tab.id === 'temp_external' || tab.id === 'shock');
      return {
        id: tab.id,
        label: tab.label,
        value: formatKpiValue(tab.id, value, latest?.unit || tab.unit),
        timestamp: formatTimeAgo(nowTs, tsMs),
        isMissing: value == null,
        isMuted,
        tooltip: isMuted ? DEAD_BATTERY_TOOLTIP : undefined,
        history: kpiHistoryRef.current[tab.id]?.slice() ?? [],
      };
    });
    return tiles;
  }, [kpiTabs, latestByName, nowTs, batteryDead]);

  return {
    sensorTiles,
    ln2Level: ln2LevelPercent,
    internalTemp,
    externalTemp,
    lidStatus,
    kpiLimits,
    isInitialLoading,
  };
}
