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
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Bell, TrendingUp, Users, ChevronRight } from 'lucide-react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

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
    <div id="onboarding-dashboard-alerts" className="flex flex-col gap-3 w-64">
      {/* Alerts Card */}
      <div
        onClick={() => { fetchRefrigeratorAlerts(); setShowCriticalAlerts(true); }}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
      >
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <img className="w-4 h-4" alt="Critical Alerts" src={CriticalAlertsIcon} />
          </div>
          {criticalAlertsCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-full border border-white flex items-center justify-center">
              <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800">Alerts</p>
          <p className="text-[10px] text-gray-500">View all alerts</p>
        </div>
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Messages Card */}
      <div
        onClick={() => { refreshUnread(); fetchStakeholderChats(); setShowStakeholderChats(true); }}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
      >
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <img className="w-5 h-5" alt="Stakeholder Chats" src={StakeholderChatsIcon} />
          </div>
          {stakeholderChatCount > 0 && (
            <div className={`absolute -top-1 -right-1 bg-[#ff0000] rounded-full border border-white flex items-center justify-center ${stakeholderChatCount > 9 ? 'px-1 min-w-4 text-[9px]' : 'w-4 h-4 text-[10px]'}`}>
              <span className="font-semibold text-white">{formatCount(stakeholderChatCount)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800">Messages</p>
          <p className="text-[10px] text-gray-500">View messages</p>
        </div>
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Tasks Card */}
      <div
        onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
      >
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <img className="w-5 h-5" alt="My Tasks" src={MyTasksIcon} />
          </div>
          {myTasksCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-full border border-white flex items-center justify-center">
              <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800">Tasks</p>
          <p className="text-[10px] text-gray-500">View all tasks</p>
        </div>
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Insight Card */}
      <div className="relative overflow-hidden rounded-2xl h-64 shadow-md">
        <img
          src="/imag.png"
          alt="Insights"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/40" />
        <div className="relative z-10 p-4 h-full flex flex-col justify-between text-white">
          <div>
            <span className="inline-block px-2 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-semibold">
              Insights
            </span>
          </div>
          <div>
            <p className="text-4xl font-bold mb-2">98%</p>
            <p className="text-sm font-semibold leading-snug mb-2">
              Compliance rate improved by 6% compared to last week.
            </p>
            <p className="text-xs text-white/80">
              This improvement reduced alert violations by 120 and maintained optimal storage conditions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="h-screen w-full flex flex-col overflow-hidden flex-1 bg-transparent">
        {/* Main layout: Left Stats Sidebar + Map + Right floating items */}
        <div className="flex flex-1 gap-0 overflow-hidden bg-transparent">
          {/* Left - General Statistics Sidebar */}
          {!loadingMap && (
            <div className="shrink-0 h-full overflow-y-auto mt-6 ml-6 space-y-3 max-w-lg ">
                {/* General Statistics Card - Comprehensive */}
                <div className="rounded-2xl p-6 w-full">
                  <div className="mb-4">
                    <p className="text-3xl text-gray-900 font-bold mb-2 pl-4">General Statistics</p>
                    <p className="text-sm text-gray-500 pl-4">Overview of alerts, deviations and user activity</p>
                  </div>

                  {/* 3 Stat Cards */}
                  <div className="mb-4 grid grid-cols-3 gap-3 rounded-3xl bg-white/90 p-4">
                    {/* Alerts Card */}
                    <div className="rounded-2xl bg-purple-100 p-3">
                      <div className="w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center mb-3 shrink-0">
                        <Bell className="w-5 h-5 text-purple-600" />
                      </div>
                      <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2 tracking-wide">Alerts Sent</p>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-2xl font-bold text-gray-900">{refrigeratorAlerts.length}</p>
                        <span className="text-xs font-bold text-emerald-600">+8%</span>
                      </div>
                      <p className="text-[9px] text-gray-500">Compared to {Math.floor(refrigeratorAlerts.length * 0.92)} alerts last month</p>
                    </div>

                    {/* Deviations Card */}
                    <div className="rounded-2xl bg-emerald-100 p-3">
                      <div className="w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center mb-3 shrink-0">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className="text-[9px] text-gray-500 font-semibold uppercase mb-2 tracking-wide">Deviations Captured</p>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-2xl font-bold text-gray-900">2,450</p>
                        <span className="text-xs font-bold text-emerald-600">+12%</span>
                      </div>
                      <p className="text-[9px] text-gray-500">Compared to 2,187 deviations last month</p>
                    </div>

                    {/* Users Card */}
                    <div className="rounded-2xl bg-blue-100 p-3">
                      <div className="w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center mb-3 shrink-0">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2 tracking-wide">Total Users</p>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-2xl font-bold text-gray-900">45</p>
                        <span className="text-xs font-bold text-emerald-600">+10%</span>
                      </div>
                      <p className="text-[9px] text-gray-500">Compared to 42 users last month</p>
                    </div>
                  </div>

                  {/* Distribution Analytics Section */}
                  <div className=" mt-4">
                    {/* Bar Chart */}
                    <div className="mb-4 bg-white/90 rounded-lg p-4">
                      <p className="text-xs text-gray-700 font-bold mb-3 uppercase tracking-wider">Monthly Deviation Distribution</p>
                      <div className="flex gap-1">
                        {/* Y-axis labels */}
                        <div className="flex flex-col justify-between text-right pr-2 text-[9px] text-gray-500 font-medium" style={{ width: '35px' }}>
                          {[500, 400, 300, 200, 100, 0].map((v) => (
                            <span key={v}>{v}</span>
                          ))}
                        </div>

                        {/* Chart area with gridlines and bars */}
                        <div className="flex-1">
                          {/* Gridlines */}
                          <div className="relative" style={{ height: '160px' }}>
                            {[500, 400, 300, 200, 100, 0].map((v) => (
                              <div
                                key={v}
                                className="absolute w-full border-dashed border-t border-gray-300"
                                style={{
                                  bottom: `${(v / 500) * 100}%`,
                                }}
                              />
                            ))}

                            {/* Bars */}
                            <div className="absolute inset-0 flex items-end justify-around gap-3 pb-0">
                              {[
                                { month: 'Jan', value: 150, color: '#c8a2d8' },
                                { month: 'Feb', value: 250, color: '#b885cc' },
                                { month: 'Mar', value: 260, color: '#a66fc0' },
                                { month: 'Apr', value: 350, color: '#9659b4' },
                                { month: 'May', value: 320, color: '#8643a8' },
                                { month: 'Jun', value: 490, color: '#731e7d' },
                              ].map((data, i) => (
                                <div key={i} className="flex flex-col items-center flex-1 h-full justify-end">
                                  <div
                                    className="w-full rounded-t-lg transition-all cursor-pointer hover:shadow-md"
                                    style={{
                                      height: `${(data.value / 500) * 100}%`,
                                      backgroundColor: data.color,
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* X-axis labels */}
                          <div className="flex justify-around mt-2 text-[10px] font-medium text-gray-600">
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m) => (
                              <span key={m}>{m}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Summary banner */}
                      <div className="bg-purple-50/60 rounded-full px-4 py-2 text-center mt-3">
                        <p className="text-[9px] font-semibold text-primary">Deviation capture is up 12% compared to last month.</p>
                      </div>
                    </div>
                  </div>

                  {/* Site Level Deviation Distribution */}
                  <div className="rounded-2xl bg-white/90 p-5 mt-4">
                    <p className="text-xs text-gray-700 font-bold mb-3 uppercase tracking-wider">Site Level Deviation Distribution</p>

                    <Line
                      data={{
                        labels: ['Chennai', 'Hyderabad', 'Mumbai', 'Delhi', 'Kolkata', 'Bangalore'],
                        datasets: [
                          {
                            label: 'Deviations Captured',
                            data: [145, 210, 98, 280, 190, 320],
                            borderColor: '#6b1176',
                            borderWidth: 1.5,
                            backgroundColor: 'rgba(107, 17, 118, 0.2)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 3.5,
                            pointBackgroundColor: '#fff',
                            pointBorderColor: '#6b1176',
                            pointBorderWidth: 1.5,
                            pointHoverRadius: 5,
                          },
                          {
                            label: 'Active Refrigerators',
                            data: [8, 12, 5, 16, 11, 18],
                            borderColor: '#f97316',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            fill: false,
                            tension: 0.4,
                            pointRadius: 3.5,
                            pointBackgroundColor: '#fff',
                            pointBorderColor: '#f97316',
                            pointBorderWidth: 1.5,
                            pointHoverRadius: 5,
                            yAxisID: 'y1',
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: true,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                          legend: {
                            display: true,
                            position: 'bottom',
                            labels: { font: { size: 11 }, padding: 12, usePointStyle: true },
                          },
                          tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 8, titleFont: { size: 11 }, bodyFont: { size: 10 } },
                        },
                        scales: {
                          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
                          y: { type: 'linear', position: 'left', grid: { display: false }, ticks: { display: true, font: { size: 9 }, color: '#999' }, border: { display: false } },
                          y1: { type: 'linear', position: 'right', grid: { display: false }, ticks: { display: false }, border: { display: false } },
                        },
                      }}
                      height={140}
                    />
                  </div>

                </div>

              </div>
            )}

          {/* Right - 3D Map with floating items overlay */}
          <div className="flex-1 relative min-w-0 h-full bg-purple-50">
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
