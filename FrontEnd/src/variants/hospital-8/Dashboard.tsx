/**
 * @variant DashboardHospital8
 * @hospital ID: 8
 * @route /dashboard
 * @baseComponent pages/Dashboard
 *
 * Refrigerator-only Dashboard for Hospital 8.
 *
 * Hospital 8 only operates the refrigerator module (no cryotanks,
 * incubators, or embryo grading). This variant features a 3D geographic
 * visualization of branch locations with refrigerator metrics, alert status,
 * and route connections. Left panel shows branch-level statistics,
 * right panel displays hospital-wide KPIs.
 *
 * Registry key: DashboardHospital8 (auto from hospital-8/Dashboard.tsx)
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboardingMode } from '../../contexts/OnboardingModeContext';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import { shipmentService } from '../../services/shipmentService';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { chatService, type UnreadMessageResponse } from '../../services/chatService';
import { userService } from '../../services/userService';
import { useDashboardChatWebSocket } from '../../hooks/useChatWebSocket';
import Map3DContainer from './components/Map3DContainer';
import { mapService } from './services/mapService';
import type { BranchMetrics } from './types/map';
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';

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

  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);

  const [refrigerators, setRefrigerators] = useState<FlatRefrigerator[]>([]);
  const [refrigeratorAlerts, setRefrigeratorAlerts] = useState<IVFAlert[]>([]);
  const [loadingRefrigeratorAlerts, setLoadingRefrigeratorAlerts] = useState(false);

  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [stakeholderChats, setStakeholderChats] = useState<StakeholderChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [apiUnreadCount, setApiUnreadCount] = useState(0);

  const [branches, setBranches] = useState<BranchMetrics[]>([]);
  const [hoveredBranch, setHoveredBranch] = useState<number | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);

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

  const fallbackBranches: BranchMetrics[] = [
    { branch_id: 1, branch_name: 'Chennai', refrigerator_count: 5, active_alerts: 0, latitude: 13.0827, longitude: 80.2707 },
    { branch_id: 3, branch_name: 'Hyderabad', refrigerator_count: 6, active_alerts: 2, latitude: 17.3850, longitude: 78.4867 },
    { branch_id: 4, branch_name: 'Mumbai', refrigerator_count: 12, active_alerts: 1, latitude: 19.0760, longitude: 72.8777 },
    { branch_id: 5, branch_name: 'Delhi', refrigerator_count: 9, active_alerts: 0, latitude: 28.7041, longitude: 77.1025 },
    { branch_id: 6, branch_name: 'Kolkata', refrigerator_count: 7, active_alerts: 0, latitude: 22.5726, longitude: 88.3639 },
  ];

  const fetchMapData = async () => {
    setLoadingMap(true);
    try {
      const data = await mapService.getBranchesWithMetrics();
      setBranches(data?.length ? data : fallbackBranches);
    } catch (e) {
      console.error('Failed to fetch map data:', e);
      setBranches(fallbackBranches);
    } finally {
      setLoadingMap(false);
    }
  };

  useEffect(() => {
    fetchRefrigeratorAlerts();
    fetchMapData();
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
      try {
        await userService.getProfile();
      } catch {
        // profile fetch failed
      }
    };
    if (isAuthenticated) {
      fetchUserProfile();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const fetchRefrigerators = async () => {
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
        }
      } catch {
        if (!cancelled) {
          setRefrigerators([]);
        }
      }
    };
    fetchRefrigerators();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const routes = useMemo(() => mapService.generateRoutesFromBranches(branches), [branches]);

  const refrigeratorActiveAlerts = useMemo(
    () => refrigeratorAlerts.filter((a) => a.status === 'Active'),
    [refrigeratorAlerts]
  );

  const stakeholderChatCount = Math.max(wsUnreadCount || 0, apiUnreadCount || 0);
  const criticalAlertsCount = refrigeratorActiveAlerts.length;
  const myTasksCount = myTasks.filter((t) => t.status === 'Not started' || t.status === 'In progress').length;

  const formatCount = (count: number) => (count > 9 ? '9+' : count.toString());

  const transformedAlerts = refrigeratorAlerts.map((alert) => {
    const severity: 'Low' | 'Medium' | 'High' | 'Critical' =
      alert.severity === 'Critical' ? 'Critical' : alert.severity === 'High' ? 'High' : alert.severity === 'Medium' ? 'Medium' : 'Low';
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

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the dashboard.</p>
      </div>
    );
  }

  const dashboardActionIconsWithId = (
    <div id="onboarding-dashboard-alerts" className="flex flex-col items-center gap-4">
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
      <div className="h-screen w-full flex flex-col overflow-hidden flex-1">
        {/* Main layout: Map + Right sidebar with floating items */}
        <div className="flex flex-1 gap-0 overflow-hidden">
          {/* Center - 3D Map with floating items overlay */}
          <div className="flex-1 relative min-w-0 h-full">
            {loadingMap ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 z-40">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-gray-500 text-sm">Loading 3D map...</p>
                </div>
              </div>
            ) : (
              <Map3DContainer
                branches={branches}
                routes={routes}
                hoveredBranch={hoveredBranch}
                onBranchHover={setHoveredBranch}
                onBranchClick={() => {}}
              />
            )}

            {/* Floating Dashboard Icons - Bottom Right */}
            {!loadingMap && (
              <div className="absolute bottom-6 right-6 z-20">
                {dashboardActionIconsWithId}
              </div>
            )}


            {/* Floating Items - Left Side Overlay */}
            {!loadingMap && (
              <div className="absolute top-6 left-6 z-20 space-y-3 max-w-sm overflow-y-auto" style={{ maxHeight: 'calc(100% - 24px)' }}>
                {/* General Statistics Card - Comprehensive */}
                <div className="rounded-2xl p-6 w-80">
                  <p className="text-lg text-gray-600 font-bold mb-4">General statistics</p>
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 font-semibold mb-1">total alerts sent</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-gray-900">{refrigeratorAlerts.length}</p>
                      <span className="text-xs font-bold text-emerald-600">+8%</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Compared to {Math.floor(refrigeratorAlerts.length * 0.92)} alerts last month</p>
                  </div>

                  <div className="pt-4 mb-4">
                    <p className="text-xs text-gray-500 font-semibold mb-1">total deviation captured</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-gray-900">2,450</p>
                      <span className="text-xs font-bold text-emerald-600">+12%</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Compared to 2,187 deviations last month</p>
                  </div>

                  {/* Distribution Analytics Section */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <p className="text-xs text-gray-500 font-semibold mb-3 uppercase tracking-wide">Monthly Deviation Distribution</p>

                    {/* Line Chart with Monthly Data */}
                    <div className="mb-4">
                      <div className="h-32 flex items-end justify-around px-1 py-4 gap-2">
                        {[
                          { month: 'Jan', deviation: 245, alerts: 12, height: 30, color: '#b485bb' },
                          { month: 'Feb', deviation: 420, alerts: 18, height: 50, color: '#9959a1' },
                          { month: 'Mar', deviation: 310, alerts: 14, height: 40, color: '#a770ae' },
                          { month: 'Apr', deviation: 580, alerts: 24, height: 65, color: '#81358b' },
                          { month: 'May', deviation: 465, alerts: 20, height: 55, color: '#904d99' },
                          { month: 'Jun', deviation: 720, alerts: 32, height: 85, color: '#731e7d' },
                        ].map((data, i) => (
                          <div key={i} className="flex-1 relative group h-full flex flex-col justify-end">
                            <div className="w-full rounded-sm transition-all cursor-pointer hover:shadow-lg relative" style={{ height: `${data.height}%`, minHeight: '6px', backgroundColor: data.color }}>
                              {/* Hover Tooltip - Inside bar for correct positioning */}
                              <div className="group-hover:visible invisible absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none" style={{ zIndex: 50 }}>
                                <div className="font-semibold">{data.month}</div>
                                <div>Deviation: {data.deviation}</div>
                                <div>Alerts: {data.alerts}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monthly Deviation Distribution Summary */}
                    <div className="bg-purple-50/50 rounded-lg p-3 border border-purple-100/50">
                      <p className="text-xs text-gray-600 font-semibold mb-2">Site Level Deviation Distribution</p>
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-gray-900">{refrigerators.length}</p>
                          <span className="text-xs font-bold text-emerald-600">+10%</span>
                        </div>
                        <p className="text-[10px] text-gray-500">Active refrigerators across all sites</p>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Summary List */}
                  <div className="space-y-1 text-xs border-t border-gray-200 pt-3">
                    {[
                      { month: 'January', deviation: 145, alerts: 8 },
                      { month: 'February', deviation: 210, alerts: 12 },
                      { month: 'March', deviation: 98, alerts: 5 },
                      { month: 'April', deviation: 280, alerts: 16 },
                      { month: 'May', deviation: 190, alerts: 11 },
                      { month: 'June', deviation: 320, alerts: 18 },
                    ].map((data, i) => (
                      <div key={i} className="flex justify-between items-center py-0.5 px-1 hover:bg-purple-50/30 rounded transition-colors">
                        <span className="text-gray-600 font-medium flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          {data.month}
                        </span>
                        <div className="flex gap-3 text-gray-700 font-semibold">
                          <span className="text-primary">{data.deviation}</span>
                          <span className="text-orange-600">{data.alerts}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total Users & Earning Card */}
                  <div className="mt-4 rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
                    <div className="space-y-4">
                    
                      <div className="">
                        <p className="text-xs text-gray-400 font-medium mb-2">Total users</p>
                        <div className="flex items-baseline gap-2 mb-1">
                          <p className="text-2xl font-bold text-gray-900">97,540</p>
                          <span className="text-xs font-semibold text-emerald-600">+10%</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Compared to 91,540 users last month</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>

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
