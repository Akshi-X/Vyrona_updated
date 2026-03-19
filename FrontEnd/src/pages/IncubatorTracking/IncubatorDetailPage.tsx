import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { ivfService } from '../../services/ivfService';
import MockQualityTrackingChart from './MockQualityTrackingChart';
import MockContainerDataTable from './MockContainerDataTable';

type IllustrationMetrics = {
  temp: string;
  co2: string;
  ph: string;
  humidity: string;
};

function normalizeTankId(rawId?: string): string | null {
  if (!rawId) return null;
  const match = rawId.match(/\d+/);
  return match?.[0] ?? null;
}

function getMockIllustrationMetrics(hasIncubator: boolean): IllustrationMetrics {
  if (!hasIncubator) {
    return { temp: '—', co2: '—', ph: '—', humidity: '—' };
  }

  return { temp: '37.1°C', co2: '6.0%', ph: '7.35', humidity: '95%' };
}

function IncubatorIllustrationPanel({ metrics }: { metrics: IllustrationMetrics }) {
  return (
    <div className="flex items-center justify-center w-full">
      <div className="flex-1 flex items-center justify-center">
        <svg
          viewBox="0 0 360 420"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="IVF Incubator with readings"
          className="w-full max-w-[420px]"
        >
          <defs>
            <linearGradient id="inc-body-front" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#dbe1e8" />
              <stop offset="100%" stopColor="#cdd6df" />
            </linearGradient>
            <linearGradient id="inc-body-side" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d4dbe4" />
              <stop offset="100%" stopColor="#c8d0da" />
            </linearGradient>
            <linearGradient id="inc-top-plate" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#253244" />
              <stop offset="100%" stopColor="#111b28" />
            </linearGradient>
            <linearGradient id="inc-mast" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#2a3748" />
              <stop offset="100%" stopColor="#121c29" />
            </linearGradient>
            <linearGradient id="inc-lid" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#2b3a4d" />
              <stop offset="100%" stopColor="#121d2b" />
            </linearGradient>
            <linearGradient id="inc-display-bezel" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f6fafc" />
              <stop offset="100%" stopColor="#dbe4eb" />
            </linearGradient>
            <linearGradient id="inc-display-screen" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f5661" />
              <stop offset="100%" stopColor="#2d3239" />
            </linearGradient>
            <linearGradient id="inc-teal" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#7ff6e7" stopOpacity="0" />
              <stop offset="50%" stopColor="#95fff0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#7ff6e7" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="inc-led" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#8DFF95" />
              <stop offset="100%" stopColor="#21D84B" />
            </linearGradient>
            <filter id="inc-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.6" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect x="3" y="3" width="354" height="414" rx="6" fill="#ECE8F0" />
          <ellipse cx="180" cy="360" rx="112" ry="17" fill="#D4CEDA" />

          <path d="M91 253 L228 228 L281 254 L141 280 Z" fill="url(#inc-top-plate)" />
          <path d="M86 256 L141 280 L138 305 L89 286 Z" fill="#1C2836" />

          <path d="M103 112 L132 103 L132 266 L103 283 Z" fill="url(#inc-mast)" />
          <path d="M109 117 H123" stroke="#ED8F93" strokeWidth="5" strokeLinecap="round" />

          <path d="M165 124 L243 110 L270 162 L191 176 Z" fill="url(#inc-lid)" />
          <path d="M175 132 L236 121 L255 157 L194 168 Z" fill="#0E1724" opacity="0.86" />
          <circle cx="253" cy="114" r="5" stroke="#7D8D9D" strokeWidth="2" fill="none" />

          <path d="M171 184 L232 173 L247 202 L185 212 Z" fill="#152233" />
          {[0, 1].flatMap((row) =>
            [0, 1, 2].map((col) => {
              const cx = 185 + col * 14 + (row === 1 ? 6 : 0);
              const cy = 188 + row * 11;
              return <circle key={`${row}-${col}`} cx={cx} cy={cy} r="4" fill="none" stroke="#63788E" strokeWidth="1" />;
            })
          )}

          <path d="M84 283 L138 282 L138 343 L84 339 Z" fill="url(#inc-body-side)" stroke="#BCC7D2" />
          <path d="M138 282 L281 254 L281 337 L138 343 Z" fill="url(#inc-body-front)" stroke="#BBC6D2" />
          <path d="M143 332 L270 314" stroke="#C0CBD6" strokeWidth="1" />

          <circle cx="154" cy="281" r="8" fill="#2A3646" stroke="#506176" strokeWidth="1.5" />
          <circle cx="154" cy="281" r="4.5" fill="#3B4A5E" />

          <path d="M170 272 L246 259 L240 301 L164 312 Z" fill="url(#inc-display-bezel)" />
          <path d="M176 276 L239 265 L234 297 L171 308 Z" fill="url(#inc-display-screen)" />

          <text x="182" y="283" transform="rotate(-10 182 283)" fontSize="9" fill="#EFE6AE" fontFamily="monospace" fontWeight="700">
            {metrics.temp}
          </text>
          <text x="216" y="277" transform="rotate(-10 216 277)" fontSize="9" fill="#EFE6AE" fontFamily="monospace" fontWeight="700">
            {metrics.co2}
          </text>
          <text x="183" y="295" transform="rotate(-10 183 295)" fontSize="9" fill="#EFE6AE" fontFamily="monospace" fontWeight="700">
            {metrics.ph}
          </text>
          <text x="217" y="290" transform="rotate(-10 217 290)" fontSize="9" fill="#EFE6AE" fontFamily="monospace" fontWeight="700">
            {metrics.humidity}
          </text>

          <path d="M154 310 L230 297" stroke="url(#inc-teal)" strokeWidth="4" strokeLinecap="round" filter="url(#inc-glow)" />
          <path d="M206 314 L222 312 L222 342 L216 343 L216 317 L206 319 Z" fill="url(#inc-led)" filter="url(#inc-glow)" />

          <text x="103" y="334" fontSize="22" fill="#1F2A38" fontFamily="sans-serif" letterSpacing="2">PLANER</text>
        </svg>
      </div>
    </div>
  );
}

export default function IncubatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const normalizedTankId = normalizeTankId(id);
  const hasIncubatorId = Boolean(normalizedTankId);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [incubatorCode, setIncubatorCode] = useState<string>('-');
  const [branchName, setBranchName] = useState<string>('-');
  const illustrationMetrics = getMockIllustrationMetrics(hasIncubatorId);

  useEffect(() => {
    if (!normalizedTankId) return;
    const code = `T${normalizedTankId}`;
    setIncubatorCode(code);
    const branchMap: Record<string, string> = {
      '34': 'Egmore',
      '10': 'Tambaram',
      '20': 'Tambaram',
      '30': 'Tambaram',
      '50': 'Tambaram',
    };
    setBranchName(branchMap[normalizedTankId] || 'Unknown');

    const getTankKey = (tankId: string | number) => String(tankId).match(/\d+/)?.[0] || String(tankId);
    const getTankNumber = (tankId: string | number) => Number(getTankKey(tankId)) || 0;

    const origGetTankKpiConfig = ivfService.getTankKpiConfig.bind(ivfService);
    const origGetKpiHistory = ivfService.getKpiHistory.bind(ivfService);
    const origGetCanisterTrackingDetails = ivfService.getCanisterTrackingDetails?.bind(ivfService);
    const origUpdateGobletColor = ivfService.updateGobletColor?.bind(ivfService);
    const origUpdateCryolockColor = ivfService.updateCryolockColor?.bind(ivfService);
    const origMarkEmbryoTransfer = ivfService.markEmbryoTransfer?.bind(ivfService);
    const origMarkInTransitWithShipment = ivfService.markInTransitWithShipment?.bind(ivfService);

    ivfService.getTankKpiConfig = async (tankId: string | number) => {
      const tankKey = getTankKey(tankId);
      return {
        tank_id: getTankNumber(tankId),
        tank_code: `T${tankKey}`,
        branch_name: branchMap[tankKey] || 'Unknown',
        kpi_limits: {},
      } as any;
    };
    ivfService.getKpiHistory = async (tankId: string | number, _durationMinutes?: number) => {
      const tankKey = getTankKey(tankId);
      return {
        tank_code: `T${tankKey}`,
        tank_id: getTankNumber(tankId),
        kpi_series: {
          ln2_level: [
            { timestamp: new Date().toISOString(), value: 78, unit: '%' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 77.9, unit: '%' },
          ],
          temp_internal: [
            { timestamp: new Date().toISOString(), value: 37, unit: '°C' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 36.8, unit: '°C' },
          ],
          temp_external: [
            { timestamp: new Date().toISOString(), value: 5, unit: '°C' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 5.2, unit: '°C' },
          ],
          ln2_evaporation_rate: [
            { timestamp: new Date().toISOString(), value: 1.2, unit: 'kg/h' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 1.19, unit: 'kg/h' },
          ],
          shock: [
            { timestamp: new Date().toISOString(), value: 0, unit: '' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 0, unit: '' },
          ],
          tive_battery_percentage: [
            { timestamp: new Date().toISOString(), value: 92, unit: '%' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 92, unit: '%' },
          ],
          ln2_lid_state: [
            { timestamp: new Date().toISOString(), value: 1, unit: '' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 1, unit: '' },
          ],
        },
      } as any;
    };

    ivfService.getCanisterTrackingDetails = async (canisterNumber: string | number) => {
      const tankKey = getTankKey(canisterNumber);
      return {
        data: [
          {
            hisNumber: 'HIS001',
            cryolockNum: 'CL001',
            canisterNum: 1,
            tankCode: `T${tankKey}`,
            caneCode: 'CANE-1',
            gobletColor: 'Blue',
            cryolockColor: 'Red',
            dateOfVitrification: '2024-03-01',
            siteName: branchMap[tankKey] || 'Unknown',
            status: 'Stored',
            embryoGrading: '4AA',
            description: null,
          },
        ],
        total: 1,
      } as any;
    };
    ivfService.updateGobletColor = async () => ({ success: true } as any);
    ivfService.updateCryolockColor = async () => ({ success: true } as any);
    ivfService.markEmbryoTransfer = async () => ({ success: true } as any);
    ivfService.markInTransitWithShipment = async () => ({ success: true } as any);

    return () => {
      ivfService.getTankKpiConfig = origGetTankKpiConfig;
      ivfService.getKpiHistory = origGetKpiHistory;
      if (origGetCanisterTrackingDetails) ivfService.getCanisterTrackingDetails = origGetCanisterTrackingDetails;
      if (origUpdateGobletColor) ivfService.updateGobletColor = origUpdateGobletColor;
      if (origUpdateCryolockColor) ivfService.updateCryolockColor = origUpdateCryolockColor;
      if (origMarkEmbryoTransfer) ivfService.markEmbryoTransfer = origMarkEmbryoTransfer;
      if (origMarkInTransitWithShipment) ivfService.markInTransitWithShipment = origMarkInTransitWithShipment;
    };
  }, [normalizedTankId]);

  return (
    <div className="bg-[#FDFAFF] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-10">
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="text-gray-500 text-[12px] mt-[2.5px] hover:text-gray-700 transition-colors"
              >
                Dashboard
              </button>
              <span className="text-gray-500">/</span>
              <button
                type="button"
                onClick={() => navigate('/incubator-tracking')}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                Incubator Tracking
              </button>
              <span className="text-gray-500">/</span>
              <span className="text-black font-semibold">Incubator: {incubatorCode} - {branchName}</span>
            </div>
          </div>

          {/* Row 1: Live graph on KPIs (left) | Visual representation of incubator (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-full min-h-[320px] bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              {hasIncubatorId ? (
                <MockQualityTrackingChart />
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">Select an incubator</div>
              )}
            </div>
            <div className="min-h-[320px] bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="font-semibold text-black text-[16px] mb-3 w-full">Current Quality Status</h2>
              <div className="w-full rounded-lg bg-gradient-to-br from-[#FDFAFF] to-[#f3e8f7] p-3">
                <IncubatorIllustrationPanel metrics={illustrationMetrics} />
              </div>
            </div>
          </div>

          {/* Row 3: Contents of the incubator and its information */}
          {hasIncubatorId ? (
            <MockContainerDataTable />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="py-8 text-center text-gray-400">No incubator selected.</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
