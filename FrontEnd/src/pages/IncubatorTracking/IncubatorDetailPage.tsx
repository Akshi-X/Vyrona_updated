import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { userService } from '../../services/userService';
import { ivfService } from '../../services/ivfService';
import MockQualityTrackingChart from './MockQualityTrackingChart';
import MockQualityParametersTable from './MockQualityParametersTable';
import MockContainerDataTable from './MockContainerDataTable';
import IncubatorQualityTrackingIcon from '../../assets/DashBoardIcons/IncubatorQualityTracking.svg';

export default function IncubatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [userInitials, setUserInitials] = useState<string>('U');
  const [incubatorCode, setIncubatorCode] = useState<string>('-');
  const [branchName, setBranchName] = useState<string>('-');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        setUserInitials(`${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U');
      } catch {
        // ignore
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!id) return;
    // Since this page uses mock data, just compute incubator code & branch locally.
    const code = `T${id}`;
    setIncubatorCode(code);
    // pick a branch based on id for variety
    const branchMap: Record<string, string> = {
      '34': 'Egmore',
      '10': 'Tambaram',
      '20': 'Tambaram',
      '30': 'Tambaram',
      '50': 'Tambaram',
    };
    setBranchName(branchMap[id] || 'Unknown');

    // also patch ivfService methods for children components to avoid network
    const origGetTankKpiConfig = ivfService.getTankKpiConfig.bind(ivfService);
    const origGetKpiHistory = ivfService.getKpiHistory.bind(ivfService);
    const origGetCanisterTrackingDetails = ivfService.getCanisterTrackingDetails?.bind(ivfService);
    const origUpdateGobletColor = ivfService.updateGobletColor?.bind(ivfService);
    const origUpdateCryolockColor = ivfService.updateCryolockColor?.bind(ivfService);
    const origMarkEmbryoTransfer = ivfService.markEmbryoTransfer?.bind(ivfService);
    const origMarkInTransitWithShipment = ivfService.markInTransitWithShipment?.bind(ivfService);

    // override with simple mocks
    ivfService.getTankKpiConfig = async (tankId: string | number) => {
      return {
        tank_id: Number(tankId) || 0,
        tank_code: `T${tankId}`,
        branch_name: branchMap[String(tankId)] || 'Unknown',
        kpi_limits: {},
      } as any;
    };
    ivfService.getKpiHistory = async (tankId: string | number, _durationMinutes?: number) => {
      // return minimal series with two points
      return {
        tank_code: `T${tankId}`,
        tank_id: Number(tankId) || 0,
        kpi_series: {
          temp_internal: [
            { timestamp: new Date().toISOString(), value: 37, unit: '°C' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 36.8, unit: '°C' },
          ],
          temp_external: [
            { timestamp: new Date().toISOString(), value: 5, unit: '°C' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), value: 5.2, unit: '°C' },
          ],
        },
      } as any;
    };

    ivfService.getCanisterTrackingDetails = async (canisterNumber: string | number) => {
      return {
        data: [
          {
            hisNumber: 'HIS001',
            cryolockNum: 'CL001',
            canisterNum: 1,
            tankCode: `T${canisterNumber}`,
            caneCode: 'CANE-1',
            gobletColor: 'Blue',
            cryolockColor: 'Red',
            dateOfVitrification: '2024-03-01',
            siteName: branchMap[String(canisterNumber)] || 'Unknown',
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
      // restore originals when component unmounts
      ivfService.getTankKpiConfig = origGetTankKpiConfig;
      ivfService.getKpiHistory = origGetKpiHistory;
      if (origGetCanisterTrackingDetails) ivfService.getCanisterTrackingDetails = origGetCanisterTrackingDetails;
      if (origUpdateGobletColor) ivfService.updateGobletColor = origUpdateGobletColor;
      if (origUpdateCryolockColor) ivfService.updateCryolockColor = origUpdateCryolockColor;
      if (origMarkEmbryoTransfer) ivfService.markEmbryoTransfer = origMarkEmbryoTransfer;
      if (origMarkInTransitWithShipment) ivfService.markInTransitWithShipment = origMarkInTransitWithShipment;
    };
  }, [id]);

  return (
    <div className="bg-[#FDFAFF] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-[63px]">
        <header className="fixed top-0 left-60 right-0 h-[63px] bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-6 z-40">
          <div />
          <div
            className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
            onClick={() => navigate('/user-profile')}
            title="Go to User Profile"
          >
            <span className="text-white text-xs font-semibold">{userInitials}</span>
          </div>
        </header>

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
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Live graph on the KPIs</h2>
              {id ? (
                <MockQualityTrackingChart />
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">Select an incubator</div>
              )}
            </div>
            <div className="min-h-[320px] bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col items-center justify-center">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 w-full">Visual representation of the Incubator and its contents</h2>
              <div className="flex-1 w-full flex items-center justify-center bg-gradient-to-br from-[#FDFAFF] to-[#f3e8f7] rounded-lg">
                <img src={IncubatorQualityTrackingIcon} alt="Incubator" className="w-24 h-24 opacity-70" />
              </div>
            </div>
          </div>

          {/* Row 2: Quality parameters table (optional, same as IVF track shipment) */}
          {id && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Quality parameters</h2>
              <MockQualityParametersTable />
            </div>
          )}

          {/* Row 3: Contents of the incubator and its information */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Contents of the incubator and its information</h2>
            {id ? (
              <MockContainerDataTable />
            ) : (
              <div className="py-8 text-center text-gray-400">No incubator selected.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
