import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import { ivfService } from '../../../services/ivfService';

interface IVFQualityParametersTableProps {
  canisterNumber?: string;
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

const BatteryIcon = ({ level }: { level: number }) => (
  <svg width="32" height="16" viewBox="0 0 32 16" fill="none">
    <rect x="1" y="2" width="26" height="12" rx="2" stroke="#6B1176" strokeWidth="2" />
    <rect x="27" y="5" width="3" height="6" rx="1" fill="#6B1176" />
    <rect x="3" y="4" width={Math.max(0, (level / 100) * 22)} height="8" rx="1" fill="#6B1176" />
  </svg>
);

const SignalIcon = ({ strength }: { strength: 'weak' | 'medium' | 'strong' }) => {
  const bars = strength === 'strong' ? 4 : strength === 'medium' ? 3 : 2;
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 5}
          y={12 - i * 3}
          width="3"
          height={4 + i * 3}
          rx="1"
          fill={i < bars ? '#6B1176' : '#E7E1E1'}
        />
      ))}
    </svg>
  );
};

// KPI Tile Card component using system colors
interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const KpiTile = ({ icon, label, value }: KpiTileProps) => (
  <div className="bg-white rounded-lg border border-[#E7E1E1] shadow-sm px-4 py-3 flex items-center gap-3 min-w-44">
    <div className="bg-[#FDF4FF] rounded-lg p-2.5 flex items-center justify-center">
      {icon}
    </div>
    <div className="flex flex-col">
      <span className="text-[11px] text-gray-500 font-medium">{label}</span>
      <span className="text-[15px] font-semibold text-black">{value}</span>
    </div>
  </div>
);

/**
 * Cylinder level diagram for Quality Parameter.
 * Level is driven by latest KPI ln2_level (0–100%); falls back to battery_level if no ln2_level.
 */
export function IVFQualityParametersTable({ canisterNumber }: IVFQualityParametersTableProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const [level, setLevel] = useState<number | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(82);
  const [evaporationRate, setEvaporationRate] = useState<{ value: number; unit: string } | null>(null);
  const [tempExternal, setTempExternal] = useState<number | null>(null);
  const [tempInternal, setTempInternal] = useState<number | null>(null);
  const [lidStatus, setLidStatus] = useState<number | null>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

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

  const setLevelFromKpis = (kpis: Array<{ name: string; value: number; unit: string }> | undefined) => {
    if (!kpis?.length) return;
    const ln2 = kpis.find((k) => k.name === 'ln2_level');
    const bat = kpis.find((k) => k.name === 'battery_level');
    const value = ln2?.value ?? bat?.value;
    if (value !== undefined && typeof value === 'number' && !Number.isNaN(value)) {
      setLevel(Math.min(100, Math.max(0, value)));
    }
    if (bat?.value !== undefined && typeof bat.value === 'number' && !Number.isNaN(bat.value)) {
      setBatteryLevel(Math.min(100, Math.max(0, bat.value)));
    }
    const evap = kpis.find((k) => k.name === 'evaporation_rate');
    if (evap?.value !== undefined && typeof evap.value === 'number' && !Number.isNaN(evap.value)) {
      setEvaporationRate({ value: evap.value, unit: evap.unit || 'kg/day' });
    }
    const ext = kpis.find((k) => k.name === 'temp_external');
    if (ext?.value !== undefined && typeof ext.value === 'number' && !Number.isNaN(ext.value)) {
      setTempExternal(ext.value);
    }
    const int = kpis.find((k) => k.name === 'temp_internal');
    if (int?.value !== undefined && typeof int.value === 'number' && !Number.isNaN(int.value)) {
      setTempInternal(int.value);
    }
    const lid = kpis.find((k) => k.name === 'lid_status');
    if (lid?.value !== undefined && typeof lid.value === 'number' && !Number.isNaN(lid.value)) {
      setLidStatus(lid.value);
    }
    // Update last sync time
    setLastSyncTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC');
  };

  useEffect(() => {
    if (!canisterNumber) return;
    ivfService.getKpiHistory(canisterNumber, 1).then((res) => {
      if (!isMountedRef.current || !res?.history?.length) return;
      const last = res.history[res.history.length - 1];
      setLevelFromKpis(last?.kpis);
    }).catch(() => {});
  }, [canisterNumber]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!canisterNumber) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) return;

    const params = new URLSearchParams({ token: authToken });
    const branchOverride = getManagerBranchOverride();
    if (branchOverride) params.set('branch_id_override', branchOverride);
    const ws = new WebSocket(`${getWebSocketUrl()}?${params.toString()}`);

    ws.onopen = () => {
      setIsConnected(true);
      if (canisterNumber) ws.send(JSON.stringify({ tank_code: canisterNumber }));
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const data: any = JSON.parse(event.data);
        if (data.type === 'subscription_confirmed') return;
        if (data.type === 'error') return;
        if (data.tank_code === canisterNumber && Array.isArray(data.kpis)) setLevelFromKpis(data.kpis);
      } catch {}
    };

    ws.onerror = () => setIsConnected(false);
    ws.onclose = () => setIsConnected(false);
    wsRef.current = ws;

    return () => {
      isMountedRef.current = false;
      try {
        wsRef.current?.close(1000, 'unmount');
      } catch {}
      wsRef.current = null;
    };
  }, [canisterNumber, token]);

  const levelPercent = level != null ? Math.min(100, Math.max(0, level)) : null;

  // System purple color scheme
  const fillColor = '#c9a8e0';
  const fillColorTop = '#e0ccf0';

  const formatTemp = (v: number | null) =>
    v != null ? `${v.toFixed(1)}°C` : '—';
  const lidLabel = lidStatus === 1 ? 'Open' : 'Closed';

  // Tank dimensions for fill calculation
  const tankBodyTop = 50;
  const tankBodyHeight = 220;
  const tankBodyBottom = tankBodyTop + tankBodyHeight;
  const fillHeight = (tankBodyHeight * (levelPercent ?? 0)) / 100;
  const liquidSurfaceY = tankBodyBottom - fillHeight;

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-black text-[16px]">Current Quality Status</h3>
        <div className="flex items-center gap-5 flex-wrap">
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm font-medium text-[#6B1176]">LIVE</span>
          </div>
          {/* Battery */}
          <div className="flex items-center gap-1.5">
            <BatteryIcon level={batteryLevel} />
            <span className="text-sm font-medium text-black">{batteryLevel}%</span>
          </div>
          {/* Signal */}
          <div className="flex items-center gap-1.5">
            <SignalIcon strength="strong" />
            <span className="text-sm font-medium text-black">Strong</span>
          </div>
          {/* Last Sync */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Last Sync:</span>
            <span className="font-medium text-black">{lastSyncTime || '—'}</span>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`} />
          </div>
        </div>
      </div>

      {/* Main content: Left tiles + Tank + Right tiles */}
      <div className="flex items-center justify-center gap-3 py-2 mx-6">
        {/* Left KPI Tiles */}
        <div className="flex flex-col gap-3">
          <KpiTile
            icon={<LockIcon className="text-[#6B1176]" />}
            label="Lid Status"
            value={lidLabel}
          />
          <KpiTile
            icon={<ThermometerIcon className="text-[#6B1176]" />}
            label="Internal Temp"
            value={formatTemp(tempInternal)}
          />
        </div>

        {/* Tank SVG */}
        <div className="shrink-0">
          <svg
            width="180"
            height="320"
            viewBox="0 0 200 320"
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

            {/* Tank base/feet */}
            <rect x="40" y="270" width="30" height="35" rx="6" fill="#8B6B9E" />
            <rect x="130" y="270" width="30" height="35" rx="6" fill="#8B6B9E" />
            <rect x="65" y="280" width="70" height="12" rx="3" fill="#a78bba" />

            {/* Level percentage display on tank */}
            <text
              x="100"
              y="175"
              textAnchor="middle"
              className="text-[24px] font-bold"
              fill="#6B1176"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {levelPercent != null ? `${Math.round(levelPercent)}%` : '—'}
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
              LN2 Level
            </text>
          </svg>
        </div>

        {/* Right KPI Tiles */}
        <div className="flex flex-col gap-3">
          <KpiTile
            icon={<SunIcon className="text-[#6B1176]" />}
            label="External Temp"
            value={formatTemp(tempExternal)}
          />
          <KpiTile
            icon={<EvaporationIcon className="text-[#6B1176]" />}
            label="LN2 Evaporation Rate"
            value={evaporationRate != null ? `${evaporationRate.value.toFixed(2)} ${evaporationRate.unit}` : '—'}
          />
        </div>
      </div>
    </div>
  );
}
