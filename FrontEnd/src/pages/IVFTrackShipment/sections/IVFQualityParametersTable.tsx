import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import { ivfService } from '../../../services/ivfService';

interface IVFQualityParametersTableProps {
  canisterNumber?: string;
}

/**
 * Cylinder level diagram for Quality Parameter.
 * Level is driven by latest KPI ln2_level (0–100%); falls back to battery_level if no ln2_level.
 */
export function IVFQualityParametersTable({ canisterNumber }: IVFQualityParametersTableProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const [level, setLevel] = useState<number | null>(null);
  const [evaporationRate, setEvaporationRate] = useState<{ value: number; unit: string } | null>(null);
  const [tempExternal, setTempExternal] = useState<number | null>(null);
  const [tempInternal, setTempInternal] = useState<number | null>(null);
  const [lidStatus, setLidStatus] = useState<number | null>(0);
  const [shock, setShock] = useState<number | null>(0);
  /** L1/L2 from endpoint: level % (L1=100 top, L2=30 bottom). Used for reference lines. */
  const [l1, setL1] = useState<number>(100);
  const [l2, setL2] = useState<number>(30);
  const [isConnected, setIsConnected] = useState(false);
  const [hasData, setHasData] = useState(false);

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
      setHasData(true);
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
    const sh = kpis.find((k) => k.name === 'shock');
    if (sh?.value !== undefined && typeof sh.value === 'number' && !Number.isNaN(sh.value)) {
      setShock(sh.value);
    }
    const l1Kpi = kpis.find((k) => k.name === 'l1');
    if (l1Kpi?.value !== undefined && typeof l1Kpi.value === 'number' && !Number.isNaN(l1Kpi.value)) {
      setL1(Math.min(100, Math.max(0, l1Kpi.value)));
    }
    const l2Kpi = kpis.find((k) => k.name === 'l2');
    if (l2Kpi?.value !== undefined && typeof l2Kpi.value === 'number' && !Number.isNaN(l2Kpi.value)) {
      setL2(Math.min(100, Math.max(0, l2Kpi.value)));
    }
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
  const displayValue =
    levelPercent != null ? `${Math.round(levelPercent)}%` : hasData ? '—' : null;

  const fillColor = '#e6cbff';
  const fillColorTop = '#f2e4ff';

  // Cryocan SVG: body path runs y 105.9 (top) to 355.9 (bottom). Fill from bottom up to LN2 level.
  const bodyTop = 105.9;
  const bodyBottom = 355.9;
  const bodyHeight = bodyBottom - bodyTop;
  const ln2SurfaceY = bodyBottom - bodyHeight * ((levelPercent ?? 0) / 100);
  // L1/L2 reference lines from endpoint (percent 0–100): L1=100 → top, L2=30 → 30% from bottom
  const l1Y = bodyBottom - bodyHeight * (l1 / 100);
  const l2Y = bodyBottom - bodyHeight * (l2 / 100);

  const formatTemp = (v: number | null) =>
    v != null ? `${v.toFixed(1)}°C` : (hasData ? '—' : '—');
  const lidLabel = lidStatus === 1 ? 'Open' : 'Closed';

  return (
    <div className="rounded-[5px] border border-gray-200 h-[460px] bg-white p-4 flex flex-col">
      <h3 className="text-base font-semibold text-gray-900 text-[16px] mb-2">Current Quality Status</h3>
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-auto">
        <div className="flex flex-col items-center gap-2 w-full max-w-[520px]">
          <svg
            width="520"
            height="420"
            viewBox="0 0 520 420"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0 w-full max-h-[400px] text-[#2E2A4F]"
            aria-label="Cryocan quality status"
          >
            <defs>
              <linearGradient id="cryocan-fill" x1="0" x2="0" y1="1" y2="0">
                <stop offset="0%" stopColor={fillColor} />
                <stop offset="100%" stopColor={fillColorTop} />
              </linearGradient>
              <clipPath id="cryocan-body-clip">
                <path d="M86.6,105.9h88c19.9,0,36,16.1,36,36v178c0,19.9-16.1,36-36,36h-88c-19.9,0-36-16.1-36-36v-178 C50.6,122.1,66.7,105.9,86.6,105.9z" />
              </clipPath>
            </defs>
            <g>
              <g id="cryocan" transform="translate(130,0)">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M81.6,85.9h98c3.3,0,6,2.7,6,6v8c0,3.3-2.7,6-6,6h-98c-3.3,0-6-2.7-6-6v-8C75.6,88.6,78.3,85.9,81.6,85.9z"
                />
                <g clipPath="url(#cryocan-body-clip)">
                  <rect
                    x="50.6"
                    y={bodyBottom - bodyHeight * ((levelPercent ?? 0) / 100)}
                    width="160"
                    height={(bodyHeight * (levelPercent ?? 0)) / 100}
                    fill="url(#cryocan-fill)"
                    className="transition-all duration-500 ease-out"
                  />
                </g>
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M86.6,105.9h88c19.9,0,36,16.1,36,36v178c0,19.9-16.1,36-36,36h-88c-19.9,0-36-16.1-36-36v-178 C50.6,122.1,66.7,105.9,86.6,105.9z"
                />
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M75.6,355.9v20h20v-10h70v10h20v-20"
                />
              </g>
              {/* External Temperature — left section */}
              <text x="62.38" y="288.58" className="font-semibold text-[18px] fill-current" fontFamily="Inter, system-ui, sans-serif">
                {formatTemp(tempExternal)}
              </text>
              <text x="72.63" y="302.18" className="text-[12px] fill-[#666] opacity-60" fontFamily="Inter, system-ui, sans-serif">External</text>
              <text x="46.01" y="316.62" className="text-[12px] fill-[#666] opacity-60" fontFamily="Inter, system-ui, sans-serif">Temperature</text>
              {/* Internal Temperature — left section */}
              <text x="44.72" y="202.24" className="font-semibold text-[18px] fill-current" fontFamily="Inter, system-ui, sans-serif">
                {formatTemp(tempInternal)}
              </text>
              <text x="76.98" y="215.64" className="text-[12px] fill-[#666] opacity-60" fontFamily="Inter, system-ui, sans-serif">Internal</text>
              <text x="45.01" y="230.09" className="text-[12px] fill-[#666] opacity-60" fontFamily="Inter, system-ui, sans-serif">Temperature</text>
              {/* Lid Status — left section */}
              <text x="68" y="81.14" className="font-semibold text-[18px] fill-current" fontFamily="Inter, system-ui, sans-serif">
                {lidLabel}
              </text>
              <text x="65.02" y="94.74" className="text-[12px] fill-[#666] opacity-60" fontFamily="Inter, system-ui, sans-serif">Lid Status</text>
              {/* Shock — left section */}
              <text x="111" y="133.2" className="font-semibold text-[18px] fill-current" fontFamily="Inter, system-ui, sans-serif">
                {String(shock ?? 0)}
              </text>
              <text x="87.87" y="146.8" className="text-[12px] fill-[#666] opacity-60" fontFamily="Inter, system-ui, sans-serif">Shock</text>
              {/* Lid Status connector: line from lid to label + arrow head + outline */}
              <line x1="208" y1="105.9" x2="164.7" y2="105.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="140.5,88.2 133.4,81.1 140.5,73.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="140.5,140.3 133.4,133.2 140.5,126.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="133.4,81.1 164.3,81.1 164.3,133.2 133.9,133.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {/* Evaporation rate arrow + value */}
              <line x1="313.6" y1="104.9" x2="387.8" y2="104.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="380.7,97.8 387.8,104.9 380.7,112.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <text x="398" y="109.4" className="font-semibold text-[18px] fill-current" fontFamily="Inter, system-ui, sans-serif">
                {evaporationRate != null ? `${evaporationRate.value.toFixed(2)} ${evaporationRate.unit}` : (hasData ? '—' : '—')}
              </text>
              <text x="399" y="125.9" className="text-[12px] fill-[#666] opacity-80" fontFamily="Inter, system-ui, sans-serif">
                Evaporation Rate
              </text>
              {/* Arrows to external temp */}
              <line x1="184.3" y1="199.8" x2="133.4" y2="199.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="140.5,206.9 133.4,199.8 140.5,192.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="171.6" y1="288.6" x2="133.4" y2="288.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="140.5,295.7 133.4,288.6 140.5,281.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {/* L1 (from endpoint, default 100% = top) */}
              <line x1="334.5" y1={l1Y} x2="347.2" y2={l1Y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <text x="349.3" y={l1Y + 4} className="text-[10px] fill-[#666] opacity-80" fontFamily="Inter, system-ui, sans-serif">L1</text>
              {/* L2 (from endpoint, default 30% from bottom) */}
              <line x1="334.4" y1={l2Y} x2="347" y2={l2Y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <text x="350.2" y={l2Y + 4} className="text-[10px] fill-[#666] opacity-80" fontFamily="Inter, system-ui, sans-serif">L2</text>
              {/* LN2 level: responsive line + arrow at liquid surface */}
              <line x1="341" y1={ln2SurfaceY} x2="363.1" y2={ln2SurfaceY} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={`356.7,${ln2SurfaceY - 7.2} 363.9,${ln2SurfaceY} 356.7,${ln2SurfaceY + 7.1}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <text x="369.8" y={ln2SurfaceY + 0.5} className="font-semibold text-[20px] fill-current" fontFamily="Inter, system-ui, sans-serif">
                {displayValue ?? (isConnected && !hasData ? 'No data' : '—')}
              </text>
              <text x="370.6" y={ln2SurfaceY + 14.3} className="text-[12px] fill-[#666] opacity-80" fontFamily="Inter, system-ui, sans-serif">
                LN2 level
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
