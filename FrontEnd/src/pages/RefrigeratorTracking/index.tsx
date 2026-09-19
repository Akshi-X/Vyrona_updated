import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Snowflake } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import StakeholderChatBox from '../../components/StakeholderChatBox';
import { shipmentService } from '../../services/shipmentService';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { activityLogService, type ActivityLogRecord } from '../../services/activityLogService';
import { tasksService, type Task } from '../../services/tasksService';
import { userService } from '../../services/userService';
import { useRefrigeratorChatWebSocket } from '../../hooks/useChatWebSocket';
import RefrigeratorVisualisation from './sections/RefrigeratorVisualisation';
import { useRefrigeratorKpiSnapshot } from './sections/useRefrigeratorKpiSnapshot';
import { useRefrigeratorAlertKpiNames } from './commonComponent/useRefrigeratorAlertConfig';

type RefrigeratorZone = { zone_id: string; zone_name: string };

export default function RefrigeratorTrackingPage() {
  const { refrigeratorId: refrigeratorIdParam } = useParams<{ refrigeratorId: string }>();
  const refrigeratorIdNum = refrigeratorIdParam ? parseInt(refrigeratorIdParam, 10) : NaN;
  const hasRefrigeratorId = !Number.isNaN(refrigeratorIdNum);
  const navigate = useNavigate();

  const [refrigeratorCode, setRefrigeratorCode] = useState<string>('-');
  const [branchName, setBranchName] = useState<string>('-');
  const [refrigeratorType, setRefrigeratorType] = useState<'default' | 'cold_storage' | null>(null);
  const [isLoadingType, setIsLoadingType] = useState(true);
  const [zones, setZones] = useState<RefrigeratorZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState<IVFAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [systemActivity, setSystemActivity] = useState<ActivityLogRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [showMessages, setShowMessages] = useState(false);

  const { unreadCount: messagesUnreadCount } = useRefrigeratorChatWebSocket(
    hasRefrigeratorId ? refrigeratorIdNum : undefined,
    selectedZoneId ?? undefined,
  );

  const allowedKpiNames = useRefrigeratorAlertKpiNames(
    hasRefrigeratorId ? refrigeratorIdNum : undefined,
    selectedZoneId,
    hasRefrigeratorId,
  );
  const { sensorTiles, tempExternal, probeTemp } = useRefrigeratorKpiSnapshot({
    refrigeratorId: hasRefrigeratorId ? refrigeratorIdParam : undefined,
    zoneId: selectedZoneId,
    enabled: hasRefrigeratorId,
    allowedKpiNames,
  });

  useEffect(() => {
    if (!hasRefrigeratorId) {
      navigate('/refrigerator-tracking', { replace: true });
      return;
    }
  }, [hasRefrigeratorId, navigate]);

  useEffect(() => {
    userService.getProfile().then ((p) => {
      setCurrentUserName(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
      setCurrentUserId(p.user_id ?? '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasRefrigeratorId) return;
    setIsLoadingType(true);
    shipmentService.getActiveRefrigerators().then((res) => {
      for (const branch of res.branches) {
        const found = branch.refrigerators.find((r) => r.refrigerator_id === refrigeratorIdNum);
        if (found) {
          setRefrigeratorCode(found.refrigerator_code || `R${refrigeratorIdNum}`);
          setBranchName(branch.branch_name);
          if (found.type === 'cold_storage') {
            setRefrigeratorType('cold_storage');
          } else {
            setRefrigeratorType('default');
          }
          const foundZones = found.zones ?? [];
          setZones(foundZones);
          if (foundZones.length > 0 && selectedZoneId === null) {
            setSelectedZoneId(foundZones[0].zone_id);
          }
          setIsLoadingType(false);
          return;
        }
      }
      setIsLoadingType(false);
    }).catch(() => {
      setIsLoadingType(false);
    });
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
        onClick={() => setShowMessages(true)}
      >
        <img
          className="w-[25px] h-[25px]"
          alt="Messages"
          src={StakeholderChatsIcon}
        />
        {messagesUnreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-white flex items-center justify-center">
            <span className="font-semibold text-white text-[10px]">{messagesUnreadCount}</span>
          </div>
        )}
        <span className="text-[9px] font-semibold text-gray-500 mt-0.5 leading-none">Messages</span>
      </div>
    </div>
  );

  return (
    <>
    <PageLayout title="Refrigerator Tracking" description="Monitor temperature, alerts and tasks for IVF storage units" lucideIcon={Snowflake} actions={pageActions}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
        <PageBreadcrumb label="Refrigerator Quality Tracking" />
        <div className="text-sm font-semibold text-black">
          {refrigeratorCode} - {branchName}
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-3">
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
          zones={zones}
          onZoneSelect={setSelectedZoneId}
          alerts={criticalAlerts}
          alertsLoading={loadingAlerts}
          onAcknowledgeAlert={async (alertId) => {
            await ivfAlertsService.acknowledgeAlert(alertId);
            fetchCriticalAlerts();
          }}
          type={refrigeratorType || 'default'}
          isLoadingType={isLoadingType}
        />
      </div>
    </PageLayout>

    <StakeholderChatBox
      isOpen={showMessages}
      onClose={() => setShowMessages(false)}
      refrigeratorId={hasRefrigeratorId ? refrigeratorIdNum : undefined}
    />
    </>
  );
}
