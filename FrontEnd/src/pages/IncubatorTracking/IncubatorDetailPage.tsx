import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Thermometer } from 'lucide-react';
import { ivfService } from '../../services/ivfService';
import MockQualityTrackingChart from './MockQualityTrackingChart';
import MockContainerDataTable from './MockContainerDataTable';
import PageLayout from '../../components/PageLayout';
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { userService, type UserProfileDto } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';

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

        {/* Side vents */}
        <line x1="95" y1="370" x2="95" y2="410" stroke="#d8d5cf" strokeWidth="1" strokeLinecap="round" />
        <line x1="588" y1="370" x2="588" y2="410" stroke="#d8d5cf" strokeWidth="1" strokeLinecap="round" />
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
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [incubatorCode, setIncubatorCode] = useState<string>('-');
  const [branchName, setBranchName] = useState<string>('-');
  const illustrationMetrics = getMockIllustrationMetrics(hasIncubatorId);

  // Actions state
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState<IVFAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);

  const criticalAlertsCount = criticalAlerts.filter((a) => a.acknowledged_at == null).length;
  const myTasksCount = myTasks.filter((t) => t.status === 'Not started' || t.status === 'In progress').length;
  const resolvedTankCode = incubatorCode !== '-' ? incubatorCode : '';

  const fetchCriticalAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const response = id
        ? await ivfAlertsService.getCanisterAlerts(id)
        : await ivfAlertsService.getHospitalAlerts();
      setCriticalAlerts(response.alerts || []);
    } catch {
      setCriticalAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      let allTasks: Task[] = [];
      if (id) {
        const res = await tasksService.getCanisterTasks(id);
        allTasks = Array.isArray(res.tasks) ? res.tasks : [];
      } else {
        const res = await tasksService.getMyTasks();
        allTasks = [
          ...(Array.isArray(res.created_tasks) ? res.created_tasks : []),
          ...(Array.isArray(res.assigned_tasks) ? res.assigned_tasks : []),
        ];
      }
      setMyTasks(Array.isArray(allTasks) ? allTasks : []);
    } catch {
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchCriticalAlerts();
    fetchMyTasks();
    userService.getProfile().then(setCurrentUser).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.getTankKpiConfig = async (tankId: string | number): Promise<any> => {
      const tankKey = getTankKey(tankId);
      return { tank_id: getTankNumber(tankId), tank_code: `T${tankKey}`, branch_name: branchMap[tankKey] || 'Unknown', kpi_limits: {} };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.getKpiHistory = async (tankId: string | number): Promise<any> => {
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
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.getCanisterTrackingDetails = async (canisterNumber: string | number): Promise<any> => {
      const tankKey = getTankKey(canisterNumber);
      return {
        data: [{ hisNumber: 'HIS001', cryolockNum: 'CL001', canisterNum: 1, tankCode: `T${tankKey}`, caneCode: 'CANE-1', gobletColor: 'Blue', cryolockColor: 'Red', dateOfVitrification: '2024-03-01', siteName: branchMap[tankKey] || 'Unknown', status: 'Stored', embryoGrading: '4AA', description: null }],
        total: 1,
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.updateGobletColor = async (): Promise<any> => ({ success: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.updateCryolockColor = async (): Promise<any> => ({ success: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.markEmbryoTransfer = async (): Promise<any> => ({ success: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ivfService.markInTransitWithShipment = async (): Promise<any> => ({ success: true });

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

  const pageActions = (
    <div className="flex items-center gap-6">
      {/* Critical Alerts */}
      <div className="relative group">
        <img
          className="w-[25px] h-[25px] cursor-pointer"
          alt="Critical Alerts"
          src={CriticalAlertsIcon}
          onClick={() => { fetchCriticalAlerts(); setShowCriticalAlerts(true); }}
        />
        {criticalAlertsCount > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-white flex items-center justify-center">
            <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
          </div>
        )}
        <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="font-semibold text-black text-xs whitespace-nowrap">Critical Alerts</div>
          <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]" />
        </div>
      </div>
      {/* Stakeholder Chats */}
      <div className="relative group">
        <img
          className="w-[25px] h-[25px] cursor-pointer"
          alt="Stakeholder Chats"
          src={StakeholderChatsIcon}
          onClick={() => setShowStakeholderChats(true)}
        />
        <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="font-semibold text-black text-xs whitespace-nowrap">Stakeholder Chats</div>
          <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]" />
        </div>
      </div>
      {/* My Tasks */}
      <div className="relative group">
        <img
          className="w-[25px] h-[25px] cursor-pointer"
          alt="My Tasks"
          src={MyTasksIcon}
          onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}
        />
        {myTasksCount > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-white flex items-center justify-center">
            <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
          </div>
        )}
        <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="font-semibold text-black text-xs whitespace-nowrap">My Tasks</div>
          <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageLayout title="Incubator Tracking" lucideIcon={Thermometer} actions={pageActions}>
        {/* Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-gray-500 font-semibold hover:text-gray-700 transition-colors"
            >
              Dashboard
            </button>
            <span className="text-gray-500">/</span>
            <button
              type="button"
              onClick={() => navigate('/incubator-tracking')}
              className="text-gray-500 font-semibold hover:text-gray-700 transition-colors"
            >
              Incubator Tracking
            </button>
            <span className="text-gray-500">/</span>
            <span className="text-black font-semibold">Incubator Quality Tracking</span>
          </div>
          <div className="text-sm font-semibold text-black">
            {incubatorCode} - {branchName}
          </div>
        </div>

        {/* Row 1: Live graph on KPIs (left) | Visual representation of incubator (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-full min-h-80 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {hasIncubatorId ? (
              <MockQualityTrackingChart />
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">Select an incubator</div>
            )}
          </div>
          <div className="min-h-80 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="font-semibold text-black text-[16px] mb-3 w-full">Current Quality Status</h2>
            <div className="w-full rounded-lg bg-linear-to-br from-[#FDFAFF] to-[#f3e8f7] p-3">
              <IncubatorIllustrationPanel metrics={illustrationMetrics} />
            </div>
          </div>
        </div>

        {/* Row 2: Contents of the incubator */}
        {hasIncubatorId ? (
          <MockContainerDataTable />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="py-8 text-center text-gray-400">No incubator selected.</div>
          </div>
        )}
      </PageLayout>

      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={criticalAlerts.map((a) => ({
          id: a.alert_id,
          type: a.alert_type,
          severity: a.severity === 'High' ? 'High' : a.severity === 'Medium' ? 'Medium' : 'Low',
          patientId: a.tank_code ?? a.canister_number ?? `Canister ${a.canister_id}`,
          branchName: (a as typeof a & { branch_name?: string }).branch_name,
          dedupKey: (a as typeof a & { dedup_key?: string }).dedup_key,
          message: a.message,
          timestamp: new Date(a.occurred_at + 'Z').toLocaleString(),
          status: a.status === 'Active' ? 'Active' : 'Acknowledged',
        }))}
        loading={loadingAlerts}
        patientIdLabel=""
        onAcknowledge={async (alertId) => {
          await ivfAlertsService.acknowledgeAlert(alertId);
          fetchCriticalAlerts();
        }}
        onAcknowledgeAll={async (alertIds) => {
          await ivfAlertsService.acknowledgeAlerts(alertIds);
          fetchCriticalAlerts();
        }}
      />
      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={myTasks.map((task) => ({
          id: task.id.toString(),
          patientId: task.patient_id || 'N/A',
          tankCode: (task.tank_code && String(task.tank_code).trim()) || resolvedTankCode || undefined,
          tankId: task.tank_id ?? undefined,
          canisterNumber: task.canister_number || resolvedTankCode || 'N/A',
          taskName: task.task_name,
          description: task.description || '',
          assigneeBy: task.created_by
            ? `${task.created_by.first_name || ''} ${task.created_by.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          assignedTo: task.assignee
            ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A',
          priority: task.priority,
          status: task.status,
        }))}
        loading={loadingTasks}
        variant="ivf"
        currentUserName={currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : ''}
        currentUserId={currentUser?.user_id ?? ''}
        userRole={userRole || currentUser?.role || ''}
        defaultCanisterNumber={resolvedTankCode}
        onTaskCreated={fetchMyTasks}
        onAdd={() => {}}
        onEdit={async (task: MyTask) => {
          try {
            const taskId = parseInt(task.id);
            if (isNaN(taskId)) return;
            if (task.assigneeBy?.trim().toLowerCase() === (currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim().toLowerCase() : '')) {
              await tasksService.updateTask(taskId, {
                task_name: task.taskName,
                description: task.description,
                due_date: task.dueDate && task.dueDate !== 'N/A' ? new Date(task.dueDate).toISOString() : undefined,
                priority: task.priority,
                status: task.status,
              });
            } else if (task.status) {
              await tasksService.updateTaskStatus(taskId, task.status as import('../../services/tasksService').TaskStatus);
            }
            fetchMyTasks();
          } catch (error) {
            console.error('Error updating task:', error);
          }
        }}
        onDelete={() => {}}
      />
      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={[]}
      />
    </>
  );
}
