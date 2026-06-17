/**
 * @variant DashboardHospital8
 * @hospital ID: 8
 * @route /dashboard
 * @baseComponent pages/Dashboard
 *
 * Refrigerator-only Dashboard for Hospital 8.
 *
 * Hospital 8 only operates the refrigerator module (no cryotanks,
 * incubators, or embryo grading). This variant mirrors the visual
 * structure of the default IVF Dashboard (greeting header, action
 * icons, Volume/Performance KPI sections, deviation chart, site-level
 * table) but every widget is sourced from refrigerator data only.
 *
 * Registry key: DashboardHospital8 (auto from hospital-8/Dashboard.tsx)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Snowflake, Thermometer, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboardingMode } from '../../contexts/OnboardingModeContext';
import PageLayout from '../../components/PageLayout';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import QualityDeviationChart from '../../components/QualityDeviationChart';
import { shipmentService } from '../../services/shipmentService';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { chatService, type UnreadMessageResponse } from '../../services/chatService';
import { userService } from '../../services/userService';
import { useDashboardChatWebSocket } from '../../hooks/useChatWebSocket';
import DashboardIconDark from '../../assets/DashBoardIcons/DashBoardDark.svg';
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import DeviationDriverIcon from '../../assets/flag-icon.svg';
import ContainersIcon from '../../assets/DashBoardIcons/Containers.svg';
import NextIcon from '../../assets/DashBoardIcons/NextIcon.svg';

type ActiveRefrigeratorsResponse = Awaited<ReturnType<typeof shipmentService.getActiveRefrigerators>>;
type FlatRefrigerator = ActiveRefrigeratorsResponse['branches'][number]['refrigerators'][number] & {
  branch_id: number;
  branch_name: string;
};

interface StakeholderChat {
  id: string;
  sender: string;
  patientId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

const DashboardHospital8: React.FC = () => {
  const { isAuthenticated, userRole } = useAuth();
  const isOnboarding = useOnboardingMode();
  const navigate = useNavigate();

  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);

  // User profile
  const [userFirstName, setUserFirstName] = useState('');
  const [userLastName, setUserLastName] = useState('');
  const [userWorkspaceName, setUserWorkspaceName] = useState('');
  const [loadingUserProfile, setLoadingUserProfile] = useState(true);

  // Refrigerator list
  const [refrigerators, setRefrigerators] = useState<FlatRefrigerator[]>([]);
  const [loadingRefrigerators, setLoadingRefrigerators] = useState(false);
  const [refrigeratorsError, setRefrigeratorsError] = useState<string | null>(null);
  const [refrigeratorBranchCount, setRefrigeratorBranchCount] = useState(0);

  // Alerts (hospital-wide, filtered to refrigerator-scoped)
  const [refrigeratorAlerts, setRefrigeratorAlerts] = useState<IVFAlert[]>([]);
  const [loadingRefrigeratorAlerts, setLoadingRefrigeratorAlerts] = useState(false);

  // Tasks
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Stakeholder chats
  const [stakeholderChats, setStakeholderChats] = useState<StakeholderChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [apiUnreadCount, setApiUnreadCount] = useState(0);

  const { unreadCount: wsUnreadCount, unreadMessages: wsUnreadMessages, refresh: refreshUnread } = useDashboardChatWebSocket({
    enabled: !isOnboarding,
  });

  useEffect(() => {
    if (wsUnreadMessages && wsUnreadMessages.length > 0) {
      const transformedChats: StakeholderChat[] = wsUnreadMessages.map((msg) => ({
        id: msg.message_id.toString(),
        sender: msg.sender_name,
        patientId: msg.canister_number
          ? `Canister ID: ${msg.canister_number}`
          : (msg.patient_id ? `Patient ID: ${msg.patient_id}` : 'Unknown'),
        message: msg.message_content,
        timestamp: new Date(msg.created_at).toLocaleString(),
        isRead: false,
      }));
      setStakeholderChats(transformedChats);
    }
  }, [wsUnreadMessages]);

  const fetchStakeholderChats = async () => {
    setLoadingChats(true);
    try {
      const response = await chatService.getUnreadMessages();
      if (response && typeof response.total_unread === 'number') {
        setApiUnreadCount(response.total_unread);
      }
      if (response?.unread_messages?.length) {
        const transformedChats: StakeholderChat[] = response.unread_messages.map((msg: UnreadMessageResponse) => ({
          id: msg.message_id.toString(),
          sender: msg.sender_name,
          patientId: msg.tank_code
            ? `Tank: ${msg.tank_code}`
            : msg.canister_number
              ? `Canister ID: ${msg.canister_number}`
              : (msg.patient_id ? `Patient ID: ${msg.patient_id}` : 'N/A'),
          message: msg.message_content,
          timestamp: new Date(msg.created_at).toLocaleString(),
          isRead: false,
        }));
        setStakeholderChats(transformedChats);
      } else {
        setStakeholderChats([]);
        setApiUnreadCount(0);
      }
    } catch {
      setStakeholderChats((prev) => (prev.length > 0 ? prev : []));
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await tasksService.getMyTasks();
      setMyTasks([...(response.created_tasks || []), ...(response.assigned_tasks || [])]);
    } catch {
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchRefrigeratorAlerts = async () => {
    setLoadingRefrigeratorAlerts(true);
    try {
      const response = await ivfAlertsService.getHospitalAlerts();
      setRefrigeratorAlerts((response?.alerts || []).filter((a) => a.refrigerator_id != null));
    } catch {
      setRefrigeratorAlerts([]);
    } finally {
      setLoadingRefrigeratorAlerts(false);
    }
  };

  useEffect(() => {
    fetchRefrigeratorAlerts();
  }, []);

  useEffect(() => {
    fetchMyTasks();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchUnreadCount = async () => {
      try {
        const response = await chatService.getUnreadMessages();
        if (response && typeof response.total_unread === 'number') {
          setApiUnreadCount(response.total_unread);
        }
      } catch {
        // unread count is not critical
      }
    };
    fetchUnreadCount();
  }, [isAuthenticated]);

  useEffect(() => {
    if (showStakeholderChats && isAuthenticated) {
      fetchStakeholderChats();
    }
  }, [showStakeholderChats, isAuthenticated]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      setLoadingUserProfile(true);
      try {
        const profile = await userService.getProfile();
        setUserFirstName(profile.first_name?.trim?.() || '');
        setUserLastName(profile.last_name?.trim?.() || '');
        setUserWorkspaceName(profile.company_name?.trim() || '');
      } catch {
        setUserFirstName('');
        setUserLastName('');
        setUserWorkspaceName('');
      } finally {
        setLoadingUserProfile(false);
      }
    };
    if (isAuthenticated) {
      fetchUserProfile();
    } else {
      setLoadingUserProfile(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const fetchRefrigerators = async () => {
      setLoadingRefrigerators(true);
      setRefrigeratorsError(null);
      try {
        const response = await shipmentService.getActiveRefrigerators();
        if (!cancelled) {
          const flat: FlatRefrigerator[] = (response?.branches || []).flatMap((branch) =>
            (branch.refrigerators || []).map((fridge) => ({
              ...fridge,
              branch_id: branch.branch_id,
              branch_name: branch.branch_name,
            }))
          );
          setRefrigerators(flat);
          setRefrigeratorBranchCount(response?.branches?.length ?? 0);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setRefrigerators([]);
          setRefrigeratorBranchCount(0);
          setRefrigeratorsError(e instanceof Error ? e.message : 'Failed to load refrigerators');
        }
      } finally {
        if (!cancelled) setLoadingRefrigerators(false);
      }
    };
    fetchRefrigerators();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const stakeholderChatCount = Math.max(wsUnreadCount || 0, apiUnreadCount || 0);
  const refrigeratorActiveAlerts = useMemo(
    () => refrigeratorAlerts.filter((a) => a.status === 'Active'),
    [refrigeratorAlerts]
  );
  const criticalAlertsCount = refrigeratorActiveAlerts.length;
  const myTasksCount = myTasks.filter((t) => t.status === 'Not started' || t.status === 'In progress').length;

  const formatCount = (count: number) => (count > 9 ? '9+' : count.toString());

  const refrigeratorTopDeviationDriver = useMemo(() => {
    const counts = new Map<string, number>();
    refrigeratorActiveAlerts.forEach((a) => {
      counts.set(a.alert_type, (counts.get(a.alert_type) ?? 0) + 1);
    });
    let top: string | null = null;
    let max = 0;
    counts.forEach((count, name) => {
      if (count > max) { max = count; top = name; }
    });
    return top;
  }, [refrigeratorActiveAlerts]);

  const refrigeratorDeviationChart = useMemo(() => {
    if (refrigerators.length === 0) return null;
    const containers = refrigerators.map((f) => f.refrigerator_code || `#${f.refrigerator_id}`);
    const alertTypes = Array.from(new Set(refrigeratorActiveAlerts.map((a) => a.alert_type)));
    if (alertTypes.length === 0) return null;
    const colorPalette = ['#A78BFA', '#60A5FA', '#F59E0B', '#10B981', '#F97316', '#EC4899', '#94A3B8'];
    const metrics = alertTypes.map((alertName, idx) => ({
      name: alertName,
      color: colorPalette[idx % colorPalette.length],
      data: refrigerators.map((f) =>
        refrigeratorActiveAlerts.filter(
          (a) => a.alert_type === alertName && a.refrigerator_id === f.refrigerator_id
        ).length
      ),
    }));
    return { containers, metrics };
  }, [refrigerators, refrigeratorActiveAlerts]);

  const alertCountByRefrigerator = useMemo(() => {
    const map = new Map<number, number>();
    refrigeratorActiveAlerts.forEach((a) => {
      if (a.refrigerator_id == null) return;
      map.set(a.refrigerator_id, (map.get(a.refrigerator_id) ?? 0) + 1);
    });
    return map;
  }, [refrigeratorActiveAlerts]);

  const transformedTasks: MyTask[] = myTasks.map((task) => {
    try {
      return {
        id: task.id.toString(),
        patientId: task.patient_id || 'N/A',
        tankCode: task.tank_code || undefined,
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
      };
    } catch {
      return {
        id: task.id?.toString() || 'unknown',
        patientId: task.patient_id || 'N/A',
        tankCode: task.tank_code || undefined,
        taskName: task.task_name || 'Unknown Task',
        description: task.description || '',
        assigneeBy: 'Unknown',
        assignedTo: 'Unknown',
        dueDate: 'N/A',
        priority: task.priority || 'Medium',
        status: task.status || 'Not started',
      };
    }
  });

  const transformedAlerts = refrigeratorAlerts.map((alert) => {
    const severity: 'Low' | 'Medium' | 'High' | 'Critical' =
      alert.severity === 'High' ? 'High' : alert.severity === 'Medium' ? 'Medium' : 'Low';
    return {
      id: alert.alert_id,
      type: alert.alert_type,
      severity,
      patientId: alert.refrigerator_code ? alert.refrigerator_code : (alert.tank_code ?? 'N/A'),
      branchName: (alert as IVFAlert & { branch_name?: string }).branch_name,
      dedupKey: (alert as IVFAlert & { dedup_key?: string }).dedup_key,
      message: alert.message,
      timestamp: new Date(alert.occurred_at + 'Z') + '',
      status: (alert.status === 'Active' ? 'Active' : 'Acknowledged') as 'Active' | 'Acknowledged' | 'Resolved' | 'Escalated',
      acknowledgementReason: alert.acknowledgment_reason,
    };
  });

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the dashboard.</p>
      </div>
    );
  }

  const dashboardActionIconsWithId = (
    <div id="onboarding-dashboard-alerts" className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-1 cursor-pointer"
        onClick={() => { fetchRefrigeratorAlerts(); setShowCriticalAlerts(true); }}>
        <div className="relative">
          <img className="w-7 h-7" alt="Critical Alerts" src={CriticalAlertsIcon} />
          {criticalAlertsCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-full border border-white flex items-center justify-center">
              <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Alerts</span>
      </div>
      <div className="flex flex-col items-center gap-1 cursor-pointer"
        onClick={() => { refreshUnread(); fetchStakeholderChats(); setShowStakeholderChats(true); }}>
        <div className="relative">
          <img className="w-7 h-7" alt="Stakeholder Chats" src={StakeholderChatsIcon} />
          {stakeholderChatCount > 0 && (
            <div className={`absolute -top-1 -right-1 bg-[#ff0000] rounded-full border border-white flex items-center justify-center ${stakeholderChatCount > 9 ? 'px-1 min-w-4' : 'w-4 h-4'}`}>
              <span className="font-semibold text-white text-[10px]">{formatCount(stakeholderChatCount)}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Messages</span>
      </div>
      <div className="flex flex-col items-center gap-1 cursor-pointer"
        onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}>
        <div className="relative">
          <img className="w-7 h-7" alt="My Tasks" src={MyTasksIcon} />
          {myTasksCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-full border border-white flex items-center justify-center">
              <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Tasks</span>
      </div>
    </div>
  );

  return (
    <>
      <PageLayout title="Dashboard" icon={DashboardIconDark} hideHeaderOnDesktop>
        {/* Greeting row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-gray-500 font-normal min-h-5">
              {userWorkspaceName || ' '}
            </p>
            {(() => {
              const hour = new Date().getHours();
              const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
              const displayName = [userFirstName, userLastName].filter(Boolean).join(' ') || 'User';
              return (
                <p className="text-black font-semibold text-xl leading-tight flex flex-wrap items-center gap-2">
                  <span>Good {greeting},<br className="sm:hidden" /></span>
                  {loadingUserProfile ? (
                    <span className="inline-block h-7 w-[150px] max-w-full animate-pulse rounded-md bg-gray-200" />
                  ) : (
                    <span className="text-primary">{displayName}</span>
                  )}
                </p>
              );
            })()}
          </div>
          <section className="hidden md:flex justify-end">
            {dashboardActionIconsWithId}
          </section>
        </div>

        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Left Column - Volume + Performance */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <section>
              <h2 className="font-semibold text-black text-base mb-4">Volume</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col bg-white border border-line rounded-lg p-3 sm:h-[123px]">
                  <div className="flex flex-col items-start mb-2 ml-3">
                    <div className="w-8 h-8 bg-surface rounded-2xl flex items-center justify-center">
                      <Snowflake className="w-[18px] h-[18px] text-primary" strokeWidth={2} />
                    </div>
                    <div className="font-normal text-[#656565] text-[11px] mt-2">
                      Total <br className="sm:hidden" />Refrigerators
                    </div>
                    <div className="font-semibold text-black text-[28px] mt-1">
                      {loadingRefrigerators
                        ? '--'
                        : refrigeratorsError
                          ? '0'
                          : <AnimatedNumber value={refrigerators.length} />}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col bg-white border border-line rounded-lg p-3 sm:h-[123px]">
                  <div className="flex flex-col items-start mb-2 ml-3">
                    <div className="w-8 h-8 bg-surface rounded-2xl flex items-center justify-center">
                      <img className="w-[18px] h-[18px]" alt="Branches" src={ContainersIcon} />
                    </div>
                    <div className="font-normal text-[#656565] text-[11px] mt-2">
                      Active Branches<br className="sm:hidden" /> with Refrigerators
                    </div>
                    <div className="font-semibold text-black text-[28px] mt-1">
                      {loadingRefrigerators
                        ? '--'
                        : refrigeratorsError
                          ? '0'
                          : <AnimatedNumber value={refrigeratorBranchCount} />}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-semibold text-black text-base mb-4">Refrigerator Performance</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col bg-white border border-line rounded-lg p-3 sm:h-[123px]">
                  <div className="flex flex-col items-start mb-2 ml-3">
                    <div className="w-8 h-8 bg-surface rounded-2xl flex items-center justify-center">
                      <img className="w-[18px] h-[18px]" alt="Quality Deviations" src={CriticalAlertsIcon} />
                    </div>
                    <div className="font-normal text-[#656565] text-[11px] mt-2">
                      Quality Deviations<br className="sm:hidden" /> Flagged
                    </div>
                    <div className="font-semibold text-black text-[28px] mt-1">
                      {loadingRefrigeratorAlerts
                        ? '--'
                        : <AnimatedNumber value={refrigeratorActiveAlerts.length} />}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col bg-white border border-line rounded-lg p-2 md:p-3 sm:h-[123px]">
                  <div className="flex flex-col items-start md:mb-2 ml-2 md:ml-3 w-full min-w-0">
                    <div className="w-8 h-8 bg-surface rounded-2xl flex items-center justify-center">
                      <img className="w-[18px] h-[18px]" alt="Deviation Driver" src={DeviationDriverIcon} />
                    </div>
                    <div className="font-normal text-[#656565] text-[11px] mt-2">
                      Top Deviation<br className="sm:hidden" /> Driver
                    </div>
                    <div className="font-semibold text-black text-[23px] mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap" title={refrigeratorTopDeviationDriver || undefined}>
                      {loadingRefrigeratorAlerts ? '--' : refrigeratorTopDeviationDriver ?? 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick link into the full Refrigerator Tracking module */}
            <section>
              <div
                className="bg-primary rounded-lg cursor-pointer transition-all drop-shadow-[0_3px_3px_rgba(0,0,0,0.10)] h-[123px] hover:drop-shadow-[0_3px_3px_rgba(0,0,0,0.18)] relative overflow-hidden hover:bg-[#7a1a88] hover:shadow-lg hover:-translate-y-0.5"
                onClick={() => navigate('/refrigerator-tracking')}
              >
                <div className="absolute bottom-0 right-0 opacity-10 translate-x-[15%] translate-y-[15%]">
                  <Snowflake className="w-24 h-24 text-white" strokeWidth={1.5} />
                </div>
                <div className="relative h-full px-3 py-4">
                  <div className="absolute top-4 left-4">
                    <Snowflake className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                  </div>
                  <div className="font-semibold text-white text-[14px] text-left mt-8 mb-1">
                    Refrigerator <br /> Quality Tracking
                  </div>
                  <div className="absolute bottom-0 right-0">
                    <button
                      className="w-7 h-6 bg-primary-muted rounded-tl-lg flex items-center justify-center transition-colors"
                      onClick={(e) => { e.stopPropagation(); navigate('/refrigerator-tracking'); }}
                    >
                      <img className="w-3.5 h-3.5" alt="Next" src={NextIcon} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column - Deviation chart */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <section className="flex-1 h-[347px]">
              <h2 className="font-semibold text-black text-base mb-4 text-right">
                Monthly ({new Date().toLocaleString('default', { month: 'long' })})
              </h2>
              {loadingRefrigeratorAlerts ? (
                <div className="bg-white border border-line rounded-lg p-4 h-[300px] flex items-center justify-center">
                  <p className="text-gray-500">Loading quality deviation data...</p>
                </div>
              ) : refrigeratorDeviationChart ? (
                <QualityDeviationChart
                  containers={refrigeratorDeviationChart.containers}
                  metrics={refrigeratorDeviationChart.metrics}
                />
              ) : (
                <div className="bg-white border border-line rounded-lg p-4 h-[300px] flex items-center justify-center">
                  <p className="text-gray-400 text-sm">No active deviations across refrigerators.</p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Refrigerator list table */}
        <section className="w-full">
          <div className="flex flex-col border border-line rounded-2xl p-4 w-full overflow-x-auto">
            <h2 className="font-semibold text-black text-base mb-4">Site Level Information</h2>
            {loadingRefrigerators ? (
              <div className="px-4 py-8 text-center text-gray-500 text-xs">Loading refrigerators...</div>
            ) : refrigeratorsError ? (
              <div className="px-4 py-8 text-center text-red-600 text-xs">{refrigeratorsError}</div>
            ) : refrigerators.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-xs">No refrigerators found.</div>
            ) : (
              <div className="w-full">
                <table className="min-w-max w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface">
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap">Refrigerator #</th>
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap">External ID</th>
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap">Type</th>
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap">Branch</th>
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap">Last Updated</th>
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap">Active Alerts</th>
                      <th className="px-4 py-3 text-left h-14 font-semibold text-primary text-xs whitespace-nowrap" />
                    </tr>
                  </thead>
                  <tbody>
                    {refrigerators.map((fridge) => {
                      const activeAlertCount = alertCountByRefrigerator.get(fridge.refrigerator_id) ?? 0;
                      return (
                        <tr
                          key={fridge.refrigerator_id}
                          className="border-b border-[#F3E0FF] bg-white cursor-pointer hover:bg-surface/60"
                          onClick={() => navigate(`/refrigerator-tracking/${fridge.refrigerator_id}`)}
                        >
                          <td className="px-4 py-3 text-[13px] text-gray-800 font-medium flex items-center gap-2">
                            <Thermometer className="w-3.5 h-3.5 text-primary" />
                            {fridge.refrigerator_code || `#${fridge.refrigerator_id}`}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-gray-600">{fridge.external_id || '-'}</td>
                          <td className="px-4 py-3 text-[13px] text-gray-600">{fridge.type || '-'}</td>
                          <td className="px-4 py-3 text-[13px] text-gray-600">{fridge.branch_name}</td>
                          <td className="px-4 py-3 text-[13px] text-gray-600">
                            {fridge.updated_at ? new Date(fridge.updated_at).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3 text-[13px]">
                            {activeAlertCount > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold">
                                {activeAlertCount}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-semibold">
                                OK
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </PageLayout>

      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={transformedAlerts}
        loading={loadingRefrigeratorAlerts}
        patientIdLabel="Refrigerator"
        onAcknowledge={async (alertId, reason) => {
          await ivfAlertsService.acknowledgeAlert(alertId, reason);
          await fetchRefrigeratorAlerts();
        }}
        onAcknowledgeAll={async (alertIds, reason) => {
          await ivfAlertsService.acknowledgeAlerts(alertIds, reason);
          await fetchRefrigeratorAlerts();
        }}
      />

      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={transformedTasks}
        loading={loadingTasks}
        variant="refrigerator"
        userRole={userRole}
        onTaskCreated={fetchMyTasks}
      />

      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
        loading={loadingChats}
      />
    </>
  );
};

export default DashboardHospital8;
