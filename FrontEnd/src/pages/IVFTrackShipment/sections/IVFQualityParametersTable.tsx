import { useState, useEffect, useRef } from 'react';
import { BatteryWarning } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import { ivfService } from '../../../services/ivfService';
// CriticalAlertsIcon import removed - using inline AlertIcon component with dynamic colors

interface IVFQualityParametersTableProps {
  tankId?: string;
}

// Icon components for KPI tiles - using system purple #6B1176
const LockIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ThermometerIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

const SunIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const EvaporationIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 19a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.5" />
    <path d="M13.5 8a7 7 0 0 1 7 7 4 4 0 0 1-4 4" />
    <path d="M12 3v3m0 4v3m0 4v3" />
  </svg>
);

const ShockIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

// Alert icon with dynamic fill color for threshold markers
const AlertIcon = ({ color = '#6B1176' }: { color?: string }) => (
  <svg width="18" height="18" viewBox="0 0 23 21" fill="none">
    <path d="M11.0476 0.100342C12.1558 0.100342 13.1313 0.667473 13.7 1.5271L13.8083 1.70288L13.8103 1.70581L13.8162 1.71753L21.5291 15.2136C21.7986 15.6712 21.9577 16.2213 21.9578 16.8074C21.9578 17.3947 21.7972 17.9445 21.5193 18.4167L21.5203 18.4177L21.5125 18.4314C20.9532 19.3859 19.9309 20.0173 18.7615 20.0173H3.31421L3.31519 20.0183C3.30974 20.0184 3.30344 20.0183 3.29761 20.0183C2.12295 20.0183 1.09697 19.3813 0.546631 18.4343L0.544678 18.4314L0.538818 18.4207L0.441162 18.2429C0.224877 17.8188 0.100342 17.3279 0.100342 16.8083C0.100355 16.2216 0.259389 15.6719 0.536865 15.2L8.24292 1.71753C8.79815 0.745596 9.82919 0.100394 11.0115 0.100342H11.0476ZM11.0193 1.80835C10.4697 1.80839 9.98895 2.10661 9.73315 2.55151L9.73413 2.55249L9.72925 2.5603L9.72827 2.56323L2.01343 16.0613L2.01245 16.0623C1.88734 16.2746 1.81323 16.5311 1.81323 16.8054C1.81327 17.08 1.88744 17.337 2.01733 17.5574H2.01831C2.27915 18.0069 2.75748 18.3035 3.30444 18.3035H18.7546C19.3009 18.3034 19.778 18.0077 20.0349 17.5671L20.0388 17.5603L20.0408 17.5564C20.1689 17.3421 20.2458 17.083 20.2458 16.8054C20.2458 16.5341 20.1727 16.2799 20.0457 16.0613L20.0437 16.0583L20.0398 16.0515V16.0505L12.3308 2.56323C12.0716 2.10844 11.5903 1.80839 11.0398 1.80835H11.0193ZM11.0281 13.3513C11.6395 13.3513 12.1353 13.8473 12.1355 14.4587C12.1355 15.0703 11.6396 15.5662 11.0281 15.5662C10.4205 15.5655 9.92723 15.0758 9.92163 14.4695V14.4636C9.92163 14.1595 10.0445 13.8834 10.2429 13.6833C10.4425 13.4801 10.7201 13.353 11.0271 13.3513H11.0281ZM11.03 6.56226C11.5023 6.56226 11.8853 6.94547 11.8855 7.41772V11.1853C11.8855 11.6282 11.5492 11.993 11.1179 12.0369L11.03 12.0408H11.0281C10.5561 12.0407 10.1733 11.6581 10.1726 11.1863V11.1453L10.1736 11.1443V7.41772C10.1738 6.94552 10.5568 6.56235 11.0291 6.56226H11.03Z" fill={color} stroke={color} strokeWidth="0.2"/>
  </svg>
);

const BatteryIcon = ({ level }: { level: number }) => {
  const safeLevel = Math.max(0, Math.min(100, Math.round(level)));
  const fillColor =
    safeLevel <= 20 ? '#EF4444' : safeLevel <= 40 ? '#F59E0B' : '#B58BC6';
  const textColor = '#000000';

  return (
    <div className="relative h-5 w-[58px]">
      <div className="absolute right-0 top-[7px] h-2 w-1.5 rounded-r bg-[#D9C1E5]" />
      <div className="absolute left-0 top-0 h-5 w-[53px] overflow-hidden rounded-md border-2 border-[#B58BC6] bg-white">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${safeLevel}%`,
            background: `linear-gradient(90deg, ${fillColor} 0%, ${fillColor}CC 100%)`,
          }}
        />
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold"
          style={{ color: textColor }}
        >
          {safeLevel}%
        </span>
      </div>
    </div>
  );
};


// KPI Tile Card component using system colors
interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tooltip?: string;
  muted?: boolean;
}

const KpiTile = ({ icon, label, value, tooltip, muted = false }: KpiTileProps) => (
  <div className="relative group w-full @max-[505px]:w-[150px]">
    <div className={`bg-white rounded-lg border border-[#E7E1E1] shadow-sm p-2 flex items-center gap-2 w-full @max-[505px]:h-[84px] ${muted ? 'opacity-75' : ''}`}>
      <div className="bg-[#FDF4FF] rounded-lg p-1 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
        <span className={`text-[15px] font-semibold ${muted ? 'text-gray-400' : 'text-black'}`}>{value}</span>
      </div>
    </div>
    {tooltip && (
      <div className="absolute left-1/2 top-full z-50 mt-2 w-max max-w-60 -translate-x-1/2 rounded-lg border border-[#E7E1E1] bg-white px-3 py-2 text-center opacity-0 shadow-lg transition-opacity duration-200 pointer-events-none group-hover:opacity-100">
        <div className="text-xs font-semibold text-black">
          {tooltip}
        </div>
        <div className="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
      </div>
    )}
  </div>
);

/**
 * Cylinder level diagram for Quality Parameter.
 * Level is driven by latest KPI ln2_level (0–100%); falls back to battery_level if no ln2_level.
 */
export function IVFQualityParametersTable({ tankId }: IVFQualityParametersTableProps) {
  const BATTERY_DEAD_THRESHOLD_MS = 5 * 60 * 1000;
  const batteryDeadTooltip = 'Charge your device to show Internal Temperature, External Temperature, Shock Detection';

  const normalizedTankId = tankId != null ? String(tankId) : undefined;
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const latestKpiTimestampRef = useRef<Record<string, number>>({});

  const [level, setLevel] = useState<number | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryTimestampMs, setBatteryTimestampMs] = useState<number | null>(null);
  const [evaporationRate, setEvaporationRate] = useState<{ value: number; unit: string } | null>(null);
  const [tempExternal, setTempExternal] = useState<number | null>(null);
  const [tempInternal, setTempInternal] = useState<number | null>(null);
  const [lidStatus, setLidStatus] = useState<number | null>(null);
  const [shock, setShock] = useState<number | null>(null);
  const [l1, setL1] = useState<number | null>(null);
  const [l2, setL2] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());

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

  const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const clampPercent = (value: number | null): number | null =>
    value == null ? null : Math.min(100, Math.max(0, value));

  const parseTimestampToMs = (timestamp?: string): number | null => {
    if (!timestamp || typeof timestamp !== 'string') return null;
    const normalized = timestamp.trim().replace(' ', 'T');
    const parsed = new Date(normalized).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };

  const extractLn2Thresholds = (kpiLimits: unknown): { l1: number | null; l2: number | null } => {
    const ln2Level =
      kpiLimits && typeof kpiLimits === 'object'
        ? (kpiLimits as Record<string, unknown>).ln2_level
        : null;

    if (!ln2Level || typeof ln2Level !== 'object') {
      return { l1: null, l2: null };
    }

    const entries = Object.entries(ln2Level as Record<string, Record<string, unknown>>);
    const l1Entry = entries.find(([name]) => name.toLowerCase().includes('l1'))?.[1];
    const l2Entry = entries.find(([name]) => name.toLowerCase().includes('l2'))?.[1];

    // New structure: LN2 L2 (0–L2-1, critical), LN2 L1 (L2–L1, soft)
    const nextL1 = toFiniteNumber(l1Entry?.max) ?? toFiniteNumber(l2Entry?.min);
    const nextL2 = toFiniteNumber(l1Entry?.min) ?? toFiniteNumber(l2Entry?.max);

    // Legacy: single "LN2 Level" band with min/max as L2/L1
    if (nextL1 == null && nextL2 == null && entries.length > 0) {
      const legacy = entries[0][1] as Record<string, unknown>;
      return {
        l1: clampPercent(toFiniteNumber(legacy?.max)),
        l2: clampPercent(toFiniteNumber(legacy?.min)),
      };
    }

    return {
      l1: clampPercent(nextL1),
      l2: clampPercent(nextL2),
    };
  };

  const setLevelFromKpis = (
    kpis: Array<{ name: string; value: number; unit: string; timestamp?: string }> | undefined
  ) => {
    if (!kpis?.length) return;
    const latestIncomingByName = new Map<
      string,
      { name: string; value: number; unit: string; timestamp: string; tsMs: number }
    >();
    for (const kpi of kpis) {
      if (typeof kpi?.name !== 'string' || !kpi.name) continue;
      if (typeof kpi?.value !== 'number' || Number.isNaN(kpi.value)) continue;
      const tsMs = parseTimestampToMs(kpi.timestamp);
      if (tsMs == null) continue;
      const ts = (kpi.timestamp || '').trim();
      if (!ts) continue;
      const existing = latestIncomingByName.get(kpi.name);
      if (!existing || tsMs > existing.tsMs) {
        latestIncomingByName.set(kpi.name, {
          name: kpi.name,
          value: kpi.value,
          unit: kpi.unit || '',
          timestamp: ts,
          tsMs,
        });
      }
    }
    if (latestIncomingByName.size === 0) return;

    const getFresh = (name: string) => {
      const incoming = latestIncomingByName.get(name);
      if (!incoming) return null;
      const prevTs = latestKpiTimestampRef.current[name];
      if (prevTs != null && incoming.tsMs <= prevTs) return null;
      latestKpiTimestampRef.current[name] = incoming.tsMs;
      return incoming;
    };

    let hasAnyUpdate = false;
    let latestFreshTimestampMs: number | null = null;

    const trackFreshTimestamp = (tsMs: number) => {
      hasAnyUpdate = true;
      latestFreshTimestampMs = latestFreshTimestampMs == null ? tsMs : Math.max(latestFreshTimestampMs, tsMs);
    };

    const ln2 = getFresh('ln2_level');
    if (ln2) {
      setLevel(Math.min(100, Math.max(0, ln2.value)));
      trackFreshTimestamp(ln2.tsMs);
    }

    const bat = getFresh('tive_battery_percentage');
    if (bat) {
      setBatteryLevel(Math.min(100, Math.max(0, bat.value)));
      setBatteryTimestampMs(bat.tsMs);
      if (!ln2) {
        setLevel(Math.min(100, Math.max(0, bat.value)));
      }
      trackFreshTimestamp(bat.tsMs);
    }

    const evap = getFresh('ln2_evaporation_rate');
    if (evap) {
      setEvaporationRate({ value: evap.value, unit: evap.unit || 'kg/day' });
      trackFreshTimestamp(evap.tsMs);
    }

    const ext = getFresh('temp_external');
    if (ext) {
      setTempExternal(ext.value);
      trackFreshTimestamp(ext.tsMs);
    }

    const int = getFresh('temp_internal');
    if (int) {
      setTempInternal(int.value);
      trackFreshTimestamp(int.tsMs);
    }

    const lid = getFresh('ln2_lid_state');
    if (lid) {
      // Enforce binary display: 0 = Close, 1 = Open.
      setLidStatus(lid.value >= 1 ? 1 : 0);
      trackFreshTimestamp(lid.tsMs);
    }

    const sh = getFresh('shock');
    if (sh) {
      setShock(sh.value);
      trackFreshTimestamp(sh.tsMs);
    }
    // Update last sync time
    if (hasAnyUpdate && latestFreshTimestampMs != null) {
      setLastUpdateAt(latestFreshTimestampMs);
    }
  };

  const formatTimeAgo = (timestampMs: number | null): string => {
    if (timestampMs == null) return '—';
    const diffMs = Math.max(0, nowTs - timestampMs);
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes <= 0) return 'just now';
    if (diffMinutes === 1) return '1 min ago';
    return `${diffMinutes} min ago`;
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const batteryStatusTimestampMs = batteryTimestampMs ?? lastUpdateAt;
  const isBatteryLoading = batteryStatusTimestampMs == null && batteryLevel == null;
  const minutesSinceUpdate =
    batteryStatusTimestampMs == null ? null : Math.floor(Math.max(0, nowTs - batteryStatusTimestampMs) / 60000);
  const batteryDead =
    batteryStatusTimestampMs != null &&
    nowTs - batteryStatusTimestampMs >= BATTERY_DEAD_THRESHOLD_MS;
  const showBatteryDeadState = !isBatteryLoading && (batteryDead || batteryLevel == null);
  const timeAgoColorClass =
    isBatteryLoading
      ? 'text-gray-400'
      : batteryDead
      ? 'text-red-600'
      : minutesSinceUpdate == null
      ? 'text-gray-500'
      : minutesSinceUpdate <= 120
        ? 'text-green-600'
        : 'text-yellow-500';

  useEffect(() => {
    if (!normalizedTankId) {
      setL1(null);
      setL2(null);
      return;
    }
    let cancelled = false;
    ivfService
      .getTankKpiConfig(normalizedTankId)
      .then((res) => {
        if (cancelled) return;
        const thresholds = extractLn2Thresholds(res?.kpi_limits);
        setL1(thresholds.l1);
        setL2(thresholds.l2);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [normalizedTankId]);

  useEffect(() => {
    if (!normalizedTankId) return;
    latestKpiTimestampRef.current = {};
    ivfService.getKpiHistory(normalizedTankId, 50).then((res) => {
      if (!isMountedRef.current || !res?.kpi_series) return;
      const latestByKpi = new Map<string, { name: string; value: number; unit: string; timestamp: string }>();
      Object.entries(res.kpi_series).forEach(([name, points]) => {
        if (!Array.isArray(points) || points.length === 0) return;
        const latest = points[points.length - 1];
        const numericValue = typeof latest?.value === 'number' ? latest.value : Number(latest?.value);
        if (!Number.isFinite(numericValue)) return;
        if (typeof latest?.timestamp !== 'string' || !latest.timestamp.trim()) return;
        latestByKpi.set(name, {
          name,
          value: numericValue,
          unit: latest?.unit || '',
          timestamp: latest.timestamp,
        });
      });
      if (latestByKpi.size === 0) return;
      setLevelFromKpis(Array.from(latestByKpi.values()));
    }).catch(() => {});
  }, [normalizedTankId]);

  useEffect(() => {
    isMountedRef.current = true;
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
        const incomingKpis: Array<{ name: string; value: number; unit: string; timestamp?: string }> | null =
          Array.isArray(data.kpis)
            ? data.kpis.map((k: any) => ({
                name: typeof k?.name === 'string' ? k.name : '',
                value: typeof k?.value === 'number' ? k.value : Number(k?.value),
                unit: typeof k?.unit === 'string' ? k.unit : '',
                timestamp:
                  typeof k?.timestamp === 'string'
                    ? k.timestamp
                    : (typeof data?.timestamp === 'string' ? data.timestamp : undefined),
              }))
            : (typeof data.kpi_name === 'string' &&
                typeof data.kpi_value === 'number' &&
                !Number.isNaN(data.kpi_value))
              ? [{
                  name: data.kpi_name,
                  value: data.kpi_value,
                  unit: data.kpi_unit || '',
                  timestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
                }]
              : null;

        const messageMatchesTank =
          data.tank_id == null || String(data.tank_id) === normalizedTankId;

        if (messageMatchesTank && incomingKpis?.length) {
          setLevelFromKpis(incomingKpis);
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
  }, [normalizedTankId, token]);

  const levelPercent = level != null ? Math.min(100, Math.max(0, level)) : null;

  // System purple color scheme
  const fillColor = '#c9a8e0';
  const fillColorTop = '#e0ccf0';

  const formatTemp = (v: number | null) =>
    v != null ? `${v.toFixed(1)}°C` : '—';
  const lidLabel = lidStatus == null ? '—' : lidStatus === 1 ? 'Open' : 'Closed';
  const internalTemperatureValue = showBatteryDeadState ? '—' : formatTemp(tempInternal);
  const externalTemperatureValue = showBatteryDeadState ? '—' : formatTemp(tempExternal);
  const shockValue = showBatteryDeadState ? '—' : shock != null ? String(shock) : '—';
  const deadBatteryTileTooltip = showBatteryDeadState ? batteryDeadTooltip : undefined;

  const levelActualPercent = levelPercent != null ? Math.round((levelPercent/34.894)*100) : null;

  // Tank dimensions for fill calculation
  const tankBodyTop = 50;
  const tankBodyHeight = 220;
  const tankBodyBottom = tankBodyTop + tankBodyHeight;
  const fillHeight = (tankBodyHeight * (levelActualPercent ?? 0)) / 100;
  const liquidSurfaceY = tankBodyBottom - fillHeight;

  // L1/L2 level marker positions (calculate Y from percentage)
  const l1Y = l1 != null ? tankBodyBottom - (tankBodyHeight * l1) / 100 : null;
  const l2Y = l2 != null ? tankBodyBottom - (tankBodyHeight * (100-((34.894-l2)/34.894)*100)) / 100 : null;
  
  // Alert color based on level thresholds
  const alertColor = levelPercent == null
    ? '#6B1176'
    : (l2 != null && levelPercent <= l2)
      ? '#EF4444' // Red if at or below L2
      : (l1 != null && levelPercent < l1)
        ? '#F59E0B' // Yellow if between L1 and L2
        : '#22C55E'; // Green if at or above L1

  return (
    <div className="@container bg-white border border-[#E7E1E1] rounded-lg p-4 flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-black text-[16px]">Current Quality Status</h3>
        <div className="flex items-center justify-end gap-5 flex-wrap ml-auto">
          {/* Battery */}
          <div className="flex items-center gap-1.5">
          <div className="pr-2">
            {isBatteryLoading ? (
              <div className="relative overflow-hidden h-3.5 w-16 rounded-md bg-gray-200">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" style={{ width: '50%' }} />
              </div>
            ) : (
              <div className={`text-xs ${timeAgoColorClass}`}>
                {formatTimeAgo(batteryStatusTimestampMs)}
              </div>
            )}
          </div>
            {isBatteryLoading ? (
              <div className="relative overflow-hidden h-5 w-[58px] rounded-md bg-gray-200">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" style={{ width: '50%' }} />
              </div>
            ) : showBatteryDeadState ? (
              <div className="relative group flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1">
                <BatteryWarning className="h-4 w-4 text-[#DC2626]" />
                <span className="text-xs font-semibold text-[#DC2626]">Battery Dead</span>
                <div className="absolute right-0 top-full z-50 mt-2 w-max max-w-[280px] rounded-lg border border-[#E7E1E1] bg-white px-3 py-2 text-left opacity-0 shadow-lg transition-opacity duration-200 pointer-events-none group-hover:opacity-100">
                  <div className="text-xs font-semibold text-black">
                    {batteryDeadTooltip}
                  </div>
                  <div className="absolute bottom-full right-5 h-0 w-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                </div>
              </div>
            ) : (
              <BatteryIcon level={batteryLevel ?? 0} />
            )}
          </div>
          
        </div>
      </div>

      {/* Main content: Left tiles + Tank + Right tiles */}
      <div className="flex items-start justify-center gap-1 @max-[505px]:flex-col @max-[505px]:items-center @max-[505px]:gap-3">
        {/* Left KPI Tiles */}
        <div className="flex flex-col gap-3 justify-start pt-6 @max-[505px]:order-2 @max-[505px]:pt-0 @max-[505px]:w-full @max-[505px]:flex-row @max-[505px]:flex-wrap @max-[505px]:justify-center">
          <KpiTile
            icon={<LockIcon className="text-[#6B1176]" />}
            label="Lid State"
            value={lidLabel}
          />
          <KpiTile
            icon={<ThermometerIcon className="text-[#6B1176]" />}
            label="Internal Temperature"
            value={internalTemperatureValue}
            tooltip={deadBatteryTileTooltip}
            muted={showBatteryDeadState}
          />
        </div>

        {/* Tank SVG */}
        <div className="shrink-0 @max-[505px]:order-1">
          <svg
            width="220"
            height="320"
            viewBox="0 0 240 320"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Cryocan tank"
          >
            <defs>
              <linearGradient id="tank-fill-gradient" x1="0" x2="0" y1="1" y2="0">
                <stop offset="0%" stopColor={fillColor} />
                <stop offset="100%" stopColor={fillColorTop} />
              </linearGradient>
              <linearGradient id="tank-body-gradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#9580a8" />
                <stop offset="50%" stopColor="#c9b3db" />
                <stop offset="100%" stopColor="#9580a8" />
              </linearGradient>
              <clipPath id="tank-body-clip">
                <rect x="30" y={tankBodyTop} width="140" height={tankBodyHeight} rx="30" />
              </clipPath>
              {/* Wave animation keyframes */}
              <style>
                {`
                  @keyframes wave {
                    0%, 100% { d: path('M30 0 Q55 -8 80 0 T130 0 T180 0'); }
                    50% { d: path('M30 0 Q55 8 80 0 T130 0 T180 0'); }
                  }
                `}
              </style>
            </defs>

            {/* Tank lid/cap */}
            <rect x="50" y="15" width="100" height="40" rx="10" fill="#a78bba" stroke="#8B6B9E" strokeWidth="2" />
            <rect x="60" y="22" width="80" height="10" rx="5" fill="#c9b3db" />
            <rect x="70" y="35" width="60" height="8" rx="4" fill="#b8a0cc" />
            
            {/* Tank base/feet */}
            <rect x="40" y="270" width="30" height="18" rx="6" fill="#8B6B9E" />
            <rect x="130" y="270" width="30" height="18" rx="6" fill="#8B6B9E" />
            <rect x="65" y="270" width="70" height="12" rx="3" fill="#a78bba" />
            
            {/* Tank body outline */}
            <rect x="30" y={tankBodyTop} width="140" height={tankBodyHeight} rx="30" fill="url(#tank-body-gradient)" stroke="#8B6B9E" strokeWidth="3" />

            {/* LN2 fill level with wave effect */}
            <g clipPath="url(#tank-body-clip)">
              {/* Main liquid fill */}
              <rect
                x="30"
                y={liquidSurfaceY}
                width="140"
                height={fillHeight}
                fill="url(#tank-fill-gradient)"
                className="transition-all duration-700 ease-out"
              />
              
              {/* Animated wave on liquid surface */}
              {levelPercent != null && levelPercent > 0 && (
                <g transform={`translate(0, ${liquidSurfaceY})`}>
                  {/* Primary wave */}
                  <path
                    d="M30 0 Q55 -6 80 0 T130 0 T170 0"
                    fill={fillColorTop}
                    opacity="0.9"
                  >
                    <animate
                      attributeName="d"
                      values="M30 0 Q55 -6 80 0 T130 0 T170 0;M30 0 Q55 6 80 0 T130 0 T170 0;M30 0 Q55 -6 80 0 T130 0 T170 0"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </path>
                  {/* Secondary wave for depth */}
                  <path
                    d="M30 2 Q65 8 100 2 T170 2"
                    fill={fillColor}
                    opacity="0.5"
                  >
                    <animate
                      attributeName="d"
                      values="M30 2 Q65 8 100 2 T170 2;M30 2 Q65 -4 100 2 T170 2;M30 2 Q65 8 100 2 T170 2"
                      dur="2.5s"
                      repeatCount="indefinite"
                    />
                  </path>
                  {/* Highlight shimmer */}
                  <ellipse cx="100" cy="0" rx="40" ry="3" fill="white" opacity="0.3">
                    <animate
                      attributeName="opacity"
                      values="0.3;0.5;0.3"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </ellipse>
                </g>
              )}
            </g>

            {/* Tank inner shadow for depth */}
            <rect x="30" y={tankBodyTop} width="140" height={tankBodyHeight} rx="30" fill="none" stroke="#6B1176" strokeWidth="1" opacity="0.1" />

            {/* L1 Level Marker */}
            {l1Y != null && (
              <g>
                <line x1="150" y1={l1Y} x2="185" y2={l1Y} stroke="#6B1176" strokeWidth="2" strokeDasharray="4,2" />
                <g transform={`translate(192, ${l1Y - 9})`}>
                  <AlertIcon color={alertColor} />
                </g>
                <text x="212" y={l1Y + 4} fill="#6B1176" fontSize="11" fontWeight="600" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>L1</text>
              </g>
            )}
            
            {/* L2 Level Marker */}
            {l2Y != null && (
              <g>
                <line x1="150" y1={l2Y} x2="185" y2={l2Y} stroke="#6B1176" strokeWidth="2" strokeDasharray="4,2" />
                <g transform={`translate(192, ${l2Y - 9})`}>
                  <AlertIcon color={alertColor} />
                </g>
                <text x="212" y={l2Y + 4} fill="#6B1176" fontSize="11" fontWeight="600" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>L2</text>
              </g>
            )}

            {/* Level percentage display on tank */}
            <text
              x="100"
              y="175"
              textAnchor="middle"
              className="text-[24px] font-bold"
              fill="#6B1176"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {levelPercent != null ? `${Math.round((levelPercent/34.894)*100)}%` : '—'}
            </text>
            <text
              x="100"
              y="195"
              textAnchor="middle"
              className="text-[12px]"
              fill="#6B1176"
              opacity="0.7"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              LN2
            </text>
          </svg>
        </div>

        {/* Right KPI Tiles */}
        <div className="flex flex-col gap-3 pt-6 @max-[505px]:order-3 @max-[505px]:pt-0 @max-[505px]:w-full @max-[505px]:flex-row @max-[505px]:flex-wrap @max-[505px]:justify-center">
          <KpiTile
            icon={<SunIcon className="text-[#6B1176]" />}
            label="External Temperature"
            value={externalTemperatureValue}
            tooltip={deadBatteryTileTooltip}
            muted={showBatteryDeadState}
          />
          <KpiTile
            icon={<EvaporationIcon className="text-[#6B1176]" />}
            label="Evaporation Rate"
            value={evaporationRate != null ? `${evaporationRate.value.toFixed(2)} ${evaporationRate.unit}` : '—'}
          />
          <KpiTile
            icon={<ShockIcon className="text-[#6B1176]" />}
            label="Shock Detection"
            value={shockValue}
            tooltip={deadBatteryTileTooltip}
            muted={showBatteryDeadState}
          />
        </div>
      </div>
    </div>
  );
}
