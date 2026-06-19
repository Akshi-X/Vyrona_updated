import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Snowflake } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import { shipmentService } from '../../services/shipmentService';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { activityLogService, type ActivityLogRecord } from '../../services/activityLogService';
import { tasksService, type Task } from '../../services/tasksService';
import { userService } from '../../services/userService';
import RefrigeratorVisualisation from './sections/RefrigeratorVisualisation';
import { useRefrigeratorKpiSnapshot } from './sections/useRefrigeratorKpiSnapshot';

type RefrigeratorZone = { zone_id: string; zone_name: string };

type RefrigeratorListItem = {
  refrigerator_id: number;
  refrigerator_code: string | null;
  branch_id: number;
  branch_name: string;
};

export default function RefrigeratorTrackingPage() {
  const { refrigeratorId: refrigeratorIdParam } = useParams<{ refrigeratorId: string }>();
  const refrigeratorIdNum = refrigeratorIdParam ? parseInt(refrigeratorIdParam, 10) : NaN;
  const hasRefrigeratorId = !Number.isNaN(refrigeratorIdNum);
  const navigate = useNavigate();

  const [refrigeratorCode, setRefrigeratorCode] = useState<string>('-');
  const [branchName, setBranchName] = useState<string>('-');
  const [zones, setZones] = useState<RefrigeratorZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState<IVFAlert[]>([]);
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [systemActivity, setSystemActivity] = useState<ActivityLogRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  const [refrigeratorList, setRefrigeratorList] = useState<RefrigeratorListItem[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const { sensorTiles, tempExternal, probeTemp } = useRefrigeratorKpiSnapshot({
    refrigeratorId: hasRefrigeratorId ? refrigeratorIdParam : undefined,
    zoneId: selectedZoneId,
    enabled: hasRefrigeratorId,
  });

  useEffect(() => {
    userService.getProfile().then((p) => {
      setCurrentUserName(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
      setCurrentUserId(p.user_id ?? '');
    }).catch(() => {});
  }, []);

  // When no refrigerator id is in the URL, load the list. If there's exactly
  // one, redirect into it; otherwise show the picker grid.
  useEffect(() => {
    if (hasRefrigeratorId) return;
    setListLoading(true);
    setListError(null);
    shipmentService.getActiveRefrigerators()
      .then((res) => {
        const flat: RefrigeratorListItem[] = res.branches.flatMap((b) =>
          b.refrigerators.map((r) => ({
            refrigerator_id: r.refrigerator_id,
            refrigerator_code: r.refrigerator_code,
            branch_id: b.branch_id,
            branch_name: b.branch_name,
          })),
        );
        if (flat.length === 1) {
          navigate(`/refrigerator-tracking/${flat[0].refrigerator_id}`, { replace: true });
          return;
        }
        setRefrigeratorList(flat);
      })
      .catch((e: any) => setListError(e?.message || 'Failed to load refrigerators'))
      .finally(() => setListLoading(false));
  }, [hasRefrigeratorId, navigate]);

  useEffect(() => {
    if (!hasRefrigeratorId) return;
    shipmentService.getActiveRefrigerators().then((res) => {
      for (const branch of res.branches) {
        const found = branch.refrigerators.find((r) => r.refrigerator_id === refrigeratorIdNum);
        if (found) {
          setRefrigeratorCode(found.refrigerator_code || `R${refrigeratorIdNum}`);
          setBranchName(branch.branch_name);
          const foundZones = found.zones ?? [];
          setZones(foundZones);
          if (foundZones.length > 0 && selectedZoneId === null) {
            setSelectedZoneId(foundZones[0].zone_id);
          }
          return;
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  const fetchCriticalAlerts = async () => {
    if (!hasRefrigeratorId) return;
    setLoadingAlerts(true);
    try {
      const res = await ivfAlertsService.getRefrigeratorAlerts(refrigeratorIdNum);
      setCriticalAlerts(res.alerts || []);
    } catch {
      setCriticalAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  useEffect(() => {
    fetchCriticalAlerts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  useEffect(() => {
    if (!hasRefrigeratorId) return;
    activityLogService
      .getActivityLogs({
        target_type: 'refrigerator',
        target_id: String(refrigeratorIdNum),
        page: 1,
        page_size: 20,
      })
      .then((res) => setSystemActivity(res.logs || []))
      .catch(() => setSystemActivity([]));
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  useEffect(() => {
    fetchTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  const fetchTasks = () => {
    if (!hasRefrigeratorId) return;
    tasksService
      .getRefrigeratorTasks(refrigeratorIdNum)
      .then((res) => setTasks(res.tasks || []))
      .catch(() => setTasks([]));
  };

  const criticalAlertsCount = criticalAlerts.filter((a) => a.acknowledged_at == null).length;
  const hasAlert = criticalAlertsCount > 0;

  const pageActions = (
    <div className="flex items-center gap-6">
      <div
        className="relative group flex flex-col items-center cursor-pointer"
        onClick={() => { fetchCriticalAlerts(); setShowCriticalAlerts(true); }}
      >
        <img
          className="w-[25px] h-[25px]"
          alt="Critical Alerts"
          src={CriticalAlertsIcon}
        />
        {criticalAlertsCount > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-white flex items-center justify-center">
            <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
          </div>
        )}
        <span className="text-[9px] font-semibold text-gray-500 mt-0.5 leading-none">Critical Alerts</span>
      </div>
    </div>
  );

  // ── No id in URL: show the picker (or wait while we redirect to the only one) ──
  if (!hasRefrigeratorId) {
    return (
      <PageLayout title="Refrigerator Tracking" description="Monitor temperature, alerts and tasks for Refridgerator storage units" lucideIcon={Snowflake} actions={pageActions}>
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
            <span className="text-black font-semibold">Refrigerator Tracking</span>
          </div>
        </div>

        <div className="mt-4">
          {listLoading && (
            <div className="text-sm text-gray-500">Loading refrigerators…</div>
          )}
          {listError && (
            <div className="text-sm text-red-600">{listError}</div>
          )}
          {!listLoading && !listError && refrigeratorList && refrigeratorList.length === 0 && (
            <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-gray-500">
              No active refrigerators found for your hospital.
            </div>
          )}
          {!listLoading && refrigeratorList && refrigeratorList.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {refrigeratorList.map((r) => (
                <button
                  key={r.refrigerator_id}
                  type="button"
                  onClick={() => navigate(`/refrigerator-tracking/${r.refrigerator_id}`)}
                  className="text-left rounded-xl border border-line bg-white px-4 py-3 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                    {r.branch_name}
                  </div>
                  <div className="mt-1 text-lg font-bold text-gray-900">
                    {r.refrigerator_code || `Refrigerator ${r.refrigerator_id}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PageLayout>
    );
  }

  return (
    <>
    <PageLayout title="Refrigerator Tracking" description="Monitor temperature, alerts and tasks for IVF storage units" lucideIcon={Snowflake} actions={pageActions}>
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
            onClick={() => navigate('/refrigerator-tracking')}
            className="text-gray-500 font-semibold hover:text-gray-700 transition-colors"
          >
            Refrigerator Tracking
          </button>
          <span className="text-gray-500">/</span>
          <span className="text-black font-semibold">{refrigeratorCode}</span>
        </div>
        <div className="text-sm font-semibold text-black">
          {refrigeratorCode} - {branchName}
        </div>
      </div>

      {zones.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Zone</span>
          {zones.map((z) => {
            const isActive = selectedZoneId === z.zone_id;
            return (
              <button
                key={z.zone_id}
                type="button"
                onClick={() => setSelectedZoneId(z.zone_id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  isActive
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
                }`}
              >
                {z.zone_name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <RefrigeratorVisualisation
          sensorTiles={sensorTiles}
          selectedSensorId={selectedSensorId}
          onSensorSelect={setSelectedSensorId}
          tempExternal={tempExternal}
          probeTemp={probeTemp}
          hasAlert={hasAlert}
          systemActivity={systemActivity}
          tasks={tasks}
          onTaskCreated={fetchTasks}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          refrigeratorCode={refrigeratorCode !== '-' ? refrigeratorCode : undefined}
          refrigeratorId={hasRefrigeratorId ? refrigeratorIdNum : undefined}
          branchName={branchName !== '-' ? branchName : undefined}
          zoneId={selectedZoneId}
        />
      </div>
    </PageLayout>

    <CriticalAlertsModal
      isOpen={showCriticalAlerts}
      onClose={() => setShowCriticalAlerts(false)}
      alerts={criticalAlerts.map((a) => ({
        id: a.alert_id,
        type: a.alert_type,
        severity: a.severity === 'High' ? 'High' : a.severity === 'Medium' ? 'Medium' : 'Low',
        patientId: a.refrigerator_code ?? `Refrigerator ${a.refrigerator_id}`,
        branchName: (a as typeof a & { branch_name?: string }).branch_name,
        dedupKey: (a as typeof a & { dedup_key?: string }).dedup_key,
        message: a.message,
        timestamp: new Date(a.occurred_at + 'Z').toLocaleString(),
        status: a.status === 'Active' ? 'Active' : 'Acknowledged',
        acknowledgementReason: a.acknowledgment_reason,
      }))}
      loading={loadingAlerts}
      patientIdLabel=""
      onAcknowledge={async (alertId, reason) => {
        await ivfAlertsService.acknowledgeAlert(alertId, reason);
        fetchCriticalAlerts();
      }}
      onAcknowledgeAll={async (alertIds, reason) => {
        await ivfAlertsService.acknowledgeAlerts(alertIds, reason);
        fetchCriticalAlerts();
      }}
    />
    </>
  );
}
