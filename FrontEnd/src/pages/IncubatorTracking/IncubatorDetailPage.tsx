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
      <div className="flex-1 max-w-[760px] w-full">
        <div className="bg-white border border-[#E7E1E1] rounded-xl p-4">
          <svg
        width="100%"
        viewBox="0 0 680 520"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M2 1L8 5L2 9"
              fill="none"
              stroke="context-stroke"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>
 
        {/* ===== MAIN BODY ===== */}
        <rect
          x="80" y="260" width="520" height="200" rx="22"
          fill="#f2f0ed" stroke="#c8c5be" strokeWidth="1.5"
        />
        <rect
          x="88" y="220" width="504" height="60" rx="12"
          fill="#2a2a28" stroke="#1a1a18" strokeWidth="1"
        />
        <rect
          x="88" y="220" width="504" height="8" rx="6"
          fill="#3d3d3a" opacity="0.5"
        />
 
        {/* ===== LEFT LID ===== */}
        <rect
          x="90" y="30" width="228" height="200" rx="10"
          fill="#1a1a18" transform="rotate(-8 204 130)" opacity="0.3"
        />
        <rect
          x="95" y="22" width="228" height="204" rx="10"
          fill="#2c2c2a" stroke="#444441" strokeWidth="1"
        />
        <rect
          x="105" y="32" width="208" height="186" rx="7"
          fill="#1e1e1c" stroke="#333331" strokeWidth="0.5"
        />
        <rect
          x="105" y="32" width="208" height="6" rx="3"
          fill="#3a3a38" opacity="0.6"
        />
        <rect
          x="115" y="125" width="188" height="34" rx="5"
          fill="#161614" stroke="#2a2a28" strokeWidth="0.5"
        />
        <rect
          x="115" y="170" width="188" height="34" rx="5"
          fill="#161614" stroke="#2a2a28" strokeWidth="0.5"
        />
        <rect
          x="115" y="45" width="188" height="68" rx="5"
          fill="#161614" stroke="#2a2a28" strokeWidth="0.5"
        />
        <ellipse
          cx="209" cy="20" rx="12" ry="8"
          fill="#3d3d3a" stroke="#555553" strokeWidth="1"
        />
        <ellipse cx="209" cy="20" rx="6" ry="4" fill="#555553" />
 
        {/* ===== RIGHT LID ===== */}
        <rect
          x="362" y="30" width="228" height="200" rx="10"
          fill="#1a1a18" transform="rotate(8 476 130)" opacity="0.3"
        />
        <rect
          x="357" y="22" width="228" height="204" rx="10"
          fill="#2c2c2a" stroke="#444441" strokeWidth="1"
        />
        <rect
          x="367" y="32" width="208" height="186" rx="7"
          fill="#1e1e1c" stroke="#333331" strokeWidth="0.5"
        />
        <rect
          x="367" y="32" width="208" height="6" rx="3"
          fill="#3a3a38" opacity="0.6"
        />
        <rect
          x="377" y="125" width="188" height="34" rx="5"
          fill="#161614" stroke="#2a2a28" strokeWidth="0.5"
        />
        <rect
          x="377" y="170" width="188" height="34" rx="5"
          fill="#161614" stroke="#2a2a28" strokeWidth="0.5"
        />
        <rect
          x="377" y="45" width="188" height="68" rx="5"
          fill="#161614" stroke="#2a2a28" strokeWidth="0.5"
        />
        <ellipse
          cx="471" cy="20" rx="12" ry="8"
          fill="#3d3d3a" stroke="#555553" strokeWidth="1"
        />
        <ellipse cx="471" cy="20" rx="6" ry="4" fill="#555553" />
 
        {/* ===== TRAY TOP - LEFT SAMPLE WELLS ===== */}
        <rect
          x="108" y="228" width="62" height="44" rx="6"
          fill="#1a1a18" stroke="#333331" strokeWidth="0.5"
        />
        <rect
          x="180" y="228" width="62" height="44" rx="6"
          fill="#1a1a18" stroke="#333331" strokeWidth="0.5"
        />
        {[114, 144].map((x) =>
          [234, 252].map((y) => (
            <rect
              key={`lw-${x}-${y}`}
              x={x} y={y} width="26" height="14" rx="3"
              fill="#111110" stroke="#2a2a28" strokeWidth="0.5"
            />
          ))
        )}
        <path d="M148 228 Q152 220 158 228" fill="none" stroke="#555553" strokeWidth="1.5" />
        {[186, 216].map((x) =>
          [234, 252].map((y) => (
            <rect
              key={`lw2-${x}-${y}`}
              x={x} y={y} width="26" height="14" rx="3"
              fill="#111110" stroke="#2a2a28" strokeWidth="0.5"
            />
          ))
        )}
        <path d="M210 228 Q214 220 220 228" fill="none" stroke="#555553" strokeWidth="1.5" />
 
        {/* ===== CENTER CONTROL BOX (BT37) ===== */}
        <rect
          x="292" y="218" width="96" height="60" rx="8"
          fill="#222220" stroke="#444441" strokeWidth="1"
        />
        <rect
          x="298" y="224" width="84" height="32" rx="5"
          fill="#111110" stroke="#333331" strokeWidth="0.5"
        />
        <text
          x="340" y="245"
          textAnchor="middle"
          fontFamily="sans-serif"
          fontSize="11"
          fontWeight="600"
          fill="#888780"
          letterSpacing="1"
        >
          BT37
        </text>
        <circle cx="310" cy="264" r="4" fill="#1D9E75" opacity="0.9" />
        <circle cx="310" cy="264" r="2" fill="#5DCAA5" />
 
        {/* ===== TRAY TOP - RIGHT SAMPLE WELLS ===== */}
        <rect
          x="430" y="228" width="62" height="44" rx="6"
          fill="#1a1a18" stroke="#333331" strokeWidth="0.5"
        />
        <rect
          x="502" y="228" width="62" height="44" rx="6"
          fill="#1a1a18" stroke="#333331" strokeWidth="0.5"
        />
        {[436, 466].map((x) =>
          [234, 252].map((y) => (
            <rect
              key={`rw-${x}-${y}`}
              x={x} y={y} width="26" height="14" rx="3"
              fill="#111110" stroke="#2a2a28" strokeWidth="0.5"
            />
          ))
        )}
        <path d="M460 228 Q464 220 470 228" fill="none" stroke="#555553" strokeWidth="1.5" />
        {[508, 538].map((x) =>
          [234, 252].map((y) => (
            <rect
              key={`rw2-${x}-${y}`}
              x={x} y={y} width="26" height="14" rx="3"
              fill="#111110" stroke="#2a2a28" strokeWidth="0.5"
            />
          ))
        )}
        <path d="M532 228 Q536 220 542 228" fill="none" stroke="#555553" strokeWidth="1.5" />
 
        {/* ===== FRONT PANEL ===== */}
        <rect
          x="100" y="340" width="480" height="108" rx="10"
          fill="#e8e6e1" stroke="#c0bdb6" strokeWidth="0.5"
        />
 
        {/* Touchscreen */}
        <rect
          x="272" y="352" width="136" height="76" rx="8"
          fill="#1a1a28" stroke="#444441" strokeWidth="1"
        />
        <rect x="278" y="358" width="124" height="64" rx="5" fill="#0d1117" />
        <rect x="284" y="364" width="50" height="8" rx="2" fill="#185FA5" opacity="0.7" />
        <rect x="284" y="376" width="35" height="6" rx="2" fill="#0F6E56" opacity="0.6" />
        <rect x="284" y="386" width="60" height="6" rx="2" fill="#333331" opacity="0.5" />
        <rect x="284" y="396" width="40" height="6" rx="2" fill="#333331" opacity="0.4" />
        <rect x="344" y="366" width="30" height="30" rx="4" fill="#185FA5" opacity="0.3" />
        <rect x="350" y="372" width="18" height="18" rx="3" fill="#378ADD" opacity="0.5" />
 
        {/* Side dots */}
        <circle cx="130" cy="390" r="5" fill="#c8c5be" stroke="#b0aead" strokeWidth="0.5" />
        <circle cx="550" cy="390" r="5" fill="#c8c5be" stroke="#b0aead" strokeWidth="0.5" />
 
        {/* Front handle */}
        <rect
          x="310" y="440" width="60" height="10" rx="5"
          fill="#d0cec9" stroke="#b8b6b0" strokeWidth="0.5"
        />
        <rect x="315" y="445" width="50" height="3" rx="2" fill="#c0bdb6" />
 
        {/* ===== PLANER LOGO ===== */}
        {/* <text
          x="200" y="415"
          textAnchor="middle"
          fontFamily="sans-serif"
          fontSize="22"
          fontWeight="700"
          fill="#2C2C2A"
          letterSpacing="3"
        >
          PLANER
        </text> */}
 
        {/* Side vents */}
        <line x1="95" y1="370" x2="95" y2="410" stroke="#d8d5cf" strokeWidth="1" strokeLinecap="round" />
        <line x1="588" y1="370" x2="588" y2="410" stroke="#d8d5cf" strokeWidth="1" strokeLinecap="round" />
 
        {/* Base shadow */}
        {/* <ellipse cx="340" cy="468" rx="240" ry="14" fill="#888780" opacity="0.13" /> */}
      </svg>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border border-[#E7E1E1] bg-[#FAF7FC] px-3 py-2">
              <div className="text-[11px] text-gray-500">Temp</div>
              <div className="text-sm font-semibold text-[#6B1176]">{metrics.temp}</div>
            </div>
            <div className="rounded-lg border border-[#E7E1E1] bg-[#FAF7FC] px-3 py-2">
              <div className="text-[11px] text-gray-500">CO₂</div>
              <div className="text-sm font-semibold text-[#6B1176]">{metrics.co2}</div>
            </div>
            <div className="rounded-lg border border-[#E7E1E1] bg-[#FAF7FC] px-3 py-2">
              <div className="text-[11px] text-gray-500">pH</div>
              <div className="text-sm font-semibold text-[#6B1176]">{metrics.ph}</div>
            </div>
            <div className="rounded-lg border border-[#E7E1E1] bg-[#FAF7FC] px-3 py-2">
              <div className="text-[11px] text-gray-500">Humidity</div>
              <div className="text-sm font-semibold text-[#6B1176]">{metrics.humidity}</div>
            </div>
          </div>
        </div>
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
