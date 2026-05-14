import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { ivfService } from '../../services/ivfService';
import MockQualityTrackingChart from '../../pages/IncubatorTracking/MockQualityTrackingChart';
import MockContainerDataTable from '../../pages/IncubatorTracking/MockContainerDataTable';

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
          viewBox="0 0 360 520"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="IVF Incubator with readings"
          className="w-full max-w-[420px]"
        >
          <defs>
            <linearGradient id="inc-body-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f5f3f8" />
              <stop offset="100%" stopColor="#e8e3f0" />
            </linearGradient>
            <linearGradient id="inc-body-side" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#ccc6d8" />
              <stop offset="8%" stopColor="#f5f3f8" />
              <stop offset="92%" stopColor="#f5f3f8" />
              <stop offset="100%" stopColor="#ccc6d8" />
            </linearGradient>
            <linearGradient id="inc-glass-grad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#c8e8ff" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#90c8f0" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#5ba8e0" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="inc-glow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#60b8ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2080d0" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="inc-display-grad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#1a1430" />
              <stop offset="100%" stopColor="#0d0a20" />
            </linearGradient>
            <linearGradient id="inc-panel-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3a3050" />
              <stop offset="100%" stopColor="#2a2240" />
            </linearGradient>
            <filter id="inc-glass-blur">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="inc-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect x="92" y="482" width="40" height="14" rx="7" fill="#c0bcd0" />
          <rect x="228" y="482" width="40" height="14" rx="7" fill="#c0bcd0" />
          <rect x="88" y="486" width="184" height="6" rx="3" fill="#d0cce0" />

          <rect x="70" y="44" width="220" height="104" rx="12" fill="url(#inc-panel-grad)" stroke="#4a3870" strokeWidth="1.5" />
          <rect x="82" y="56" width="196" height="78" rx="8" fill="url(#inc-display-grad)" stroke="#6B1176" strokeWidth="1" />

          {[0, 1, 2, 3].map((index) => {
            const y = 62 + index * 18;
            const labelX = 96;
            const valueX = 264;
            const labels = ['TEMP', 'CO₂ CONC', 'pH LEVEL', 'HUMIDITY'];
            const values = [metrics.temp, metrics.co2, metrics.ph, metrics.humidity];
            const colors = ['#7ee8ff', '#7ee8ff', '#a8f0a0', '#ffd080'];
            return (
              <g key={labels[index]}>
                <rect x="90" y={y - 9} width="180" height="16" rx="4" fill="#1d1635" stroke="#3b2f5a" strokeWidth="0.6" />
                <text x={labelX} y={y + 2} textAnchor="start" fontSize="8" fill="#9b8fc0" fontFamily="monospace">
                  {labels[index]}
                </text>
                <text x={valueX} y={y + 2} textAnchor="end" fontSize="10" fontWeight="700" fill={colors[index]} fontFamily="monospace">
                  {values[index]}
                </text>
              </g>
            );
          })}

          <text x="180" y="34" textAnchor="middle" fontSize="10" fill="#8878a8" fontFamily="sans-serif" letterSpacing="2">IVF INCUBATOR</text>

          <rect x="70" y="148" width="220" height="334" rx="16" fill="url(#inc-body-side)" stroke="#b8b0cc" strokeWidth="1.5" />

          <rect x="88" y="174" width="184" height="286" rx="12" fill="#ddd8e8" stroke="#c8c0d8" strokeWidth="1" />

          <rect x="96" y="184" width="168" height="266" rx="10" fill="url(#inc-glass-grad)" stroke="#90c0e8" strokeWidth="1.4" />
          <rect x="96" y="184" width="168" height="266" rx="10" fill="url(#inc-glow)" />

          {[250, 305, 360, 415].map((y) => (
            <line key={y} x1="112" y1={y} x2="248" y2={y} stroke="#a8c8e8" strokeWidth="1.4" strokeDasharray="6,4" opacity="0.65" />
          ))}

          {[0, 1, 2].map((row) => (
            [126, 156, 186, 216, 246].map((cx) => {
              const cy = 272 + row * 52;
              return (
                <g key={`${row}-${cx}`}>
                  <ellipse cx={cx} cy={cy} rx="9" ry="4.5" fill="#e8f4ff" stroke="#90c0e8" strokeWidth="0.8" opacity="0.9" />
                  <ellipse cx={cx} cy={cy - 1.5} rx="6.5" ry="2.5" fill="#d0e8ff" opacity="0.7" />
                </g>
              );
            })
          ))}

          <rect x="104" y="190" width="152" height="5" rx="2" fill="#40a8ff" opacity="0.8" filter="url(#inc-glow-filter)" />

          <rect x="52" y="178" width="22" height="286" rx="8" fill="#f0edf6" stroke="#c8c0d8" strokeWidth="1" />
          <rect x="66" y="300" width="5" height="52" rx="2.5" fill="#c0b8d0" stroke="#a0a0b8" strokeWidth="0.8" />

          <circle cx="276" cy="462" r="5" fill="#00e676" opacity="0.9" filter="url(#inc-glow-filter)" />
          <circle cx="276" cy="462" r="3" fill="#80ffb0" />
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
