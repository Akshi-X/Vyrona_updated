import { useParams, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import QualityTrackingChart from './sections/QualityTrackingChart.tsx';
import TrackAndTraceMap from './sections/TrackAndTraceMap.tsx';
import QualityParametersTable from './sections/QualityParametersTable.tsx';
import ThreePLTable from './sections/ThreePLTable.tsx';
import ComplianceCard from './sections/ComplianceCard.tsx';
import NonComplianceCard from './sections/NonComplianceCard.tsx';
import TransportTimeComparison from './sections/TransportTimeComparison.tsx';
import AuditTrailTable from './sections/AuditTrailTable.tsx';
import RiskPanel from './sections/RiskPanel.tsx';
import HistoricLaneRiskAssessment from './sections/HistoricLaneRiskAssessment.tsx';
import PatientSummaryIcon from '../../assets/TrackAndTraceIcons/PatientSummary.svg';
import DarkApheresisIcon from '../../assets/TrackAndTraceIcons/DarkApheresis.svg';
import LightApheresisIcon from '../../assets/TrackAndTraceIcons/LightApheresis.svg';
import DarkCryopreservationIcon from '../../assets/TrackAndTraceIcons/DarkCryopreservation.svg';
import DarkTransportationIcon from '../../assets/TrackAndTraceIcons/DarkTransportation.svg';
import PostReIcon from '../../assets/TrackAndTraceIcons/Post-Reengineering.svg';
import DarkPostReIcon from '../../assets/TrackAndTraceIcons/DarkPost-Reengineering.svg';
import LightCryopreservationIcon from '../../assets/TrackAndTraceIcons/LightCryopreservation.svg';
import LightTransportationIcon from '../../assets/TrackAndTraceIcons/LightTransportation.svg';
import ReinfusionIcon from '../../assets/TrackAndTraceIcons/Reinfusion.svg';
import DarkReinfusionIcon from '../../assets/TrackAndTraceIcons/DarkReinfusion.svg';
import { patientService, type PatientResponse } from '../../services/patientService';
import { shipmentService } from '../../services/shipmentService';

// Header icons & modals (reuse from Dashboard)
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import PatientSummaryAlertModal from '../../components/PatientSummaryAlertModal';
import { criticalAlertsService, type CriticalAlert as ServiceCriticalAlert } from '../../services/criticalAlertsService';
import { tasksService, type Task } from '../../services/tasksService';

import { userService, type UserProfileDto } from '../../services/userService';
import StakeholderChatBox from '../../components/StakeholderChatBox';
import { useDashboardChatWebSocket } from '../../hooks/useChatWebSocket';
const steps = [
  { key: 'Apheresis', dark: DarkApheresisIcon, light: LightApheresisIcon },
  { key: 'Cryopreservation', dark: DarkCryopreservationIcon, light: LightCryopreservationIcon },
  { key: 'Transportation', dark: DarkTransportationIcon, light: LightTransportationIcon },
  { key: 'Reengineering', dark: DarkPostReIcon, light: PostReIcon },
  { key: 'Cryopreservation', dark: DarkCryopreservationIcon, light: LightCryopreservationIcon },
  { key: 'Transportation', dark: DarkTransportationIcon, light: LightTransportationIcon },
  { key: 'Reinfusion', dark: DarkReinfusionIcon, light: ReinfusionIcon },
];

export default function TrackPage() {
  const { patientId } = useParams();
  const { logout, userRole } = useAuth();
  const navigate = useNavigate();

  // Header interactions state (mirrors Dashboard behavior)
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);
  const [showStakeholderChatScreen, setShowStakeholderChatScreen] = useState(false);
  const [showPatientSummaryAlert, setShowPatientSummaryAlert] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState<ServiceCriticalAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [userInitials, setUserInitials] = useState<string>('');
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [reengineeringStatus, setReengineeringStatus] = useState<boolean>(false);
  const [patientData, setPatientData] = useState<PatientResponse | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [checklistData, setChecklistData] = useState<{
    items: Array<{
      stage: string;
      actual: number;
      needed: number;
      missed: number;
      missing_documents?: string[];
    }>;
    non_compliance_percentage?: number;
  } | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [stakeholderChats, setStakeholderChats] = useState<Array<{ id: string; sender: string; patientId: string; message: string; timestamp: string; isRead: boolean }>>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);

  // WebSocket for unread count (tagged messages only) - Dashboard hook for general unread
  const { unreadMessages: wsUnreadMessages } = useDashboardChatWebSocket();

  // Calculate stakeholder chat count: only show count if patient has tagged unread messages
  const stakeholderChatCount = React.useMemo(() => {
    if (!patientId || !wsUnreadMessages) return 0;
    // Count only tagged unread messages for this specific patient
    return wsUnreadMessages.filter(msg => msg.patient_id === patientId).length;
  }, [patientId, wsUnreadMessages]);
  const criticalAlertsCount = criticalAlerts.length;
  const myTasksCount = myTasks.length;

  const fetchCriticalAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const response = await criticalAlertsService.getCriticalAlerts('pharma_12345');
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
      
      // If patientId is available, use patient-specific endpoint
      if (patientId) {
        const patientResponse = await tasksService.getPatientTasks(patientId);
        // Patient tasks endpoint returns { tasks: Task[], total, page, page_size, has_next, message, patient_id }
        allTasks = Array.isArray(patientResponse.tasks) ? patientResponse.tasks : [];
      } else {
        // Fallback to general tasks endpoint
        const response = await tasksService.getMyTasks();
        // Combine created_tasks and assigned_tasks into a single array
        allTasks = [
          ...(Array.isArray(response.created_tasks) ? response.created_tasks : []),
          ...(Array.isArray(response.assigned_tasks) ? response.assigned_tasks : [])
        ];
      }
      
      // Ensure we always set an array
      setMyTasks(Array.isArray(allTasks) ? allTasks : []);
    } catch (e) {
      console.error('Error fetching tasks:', e);
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchCurrentUser = async () => {
      try {
        const profile = await userService.getProfile();
      setCurrentUser(profile);
      setCurrentUserId(profile.user_id);
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
    } catch {
      // Error handled silently
    }
  };

  useEffect(() => {
    fetchCriticalAlerts();
    fetchMyTasks();
    fetchCurrentUser();
  }, [patientId]); // Re-fetch tasks when patientId changes

  // Update stakeholder chats from WebSocket data
  useEffect(() => {
    if (wsUnreadMessages && wsUnreadMessages.length > 0) {
      const transformedChats = wsUnreadMessages.map((msg) => ({
        id: msg.patient_id,
        sender: msg.sender_name,
        patientId: `Patient ID : ${msg.patient_id}`,
        message: msg.message_content,
        timestamp: new Date(msg.created_at).toLocaleString(),
        isRead: false
      }));
      setStakeholderChats(transformedChats);
    } else {
      setStakeholderChats([]);
    }
  }, [wsUnreadMessages]);

  // user initials are set in fetchCurrentUser
  // Calculate currentIndex based on stage and reengineering_status
  const currentIndex = (() => {
    if (!currentStage) return -1; // No stage means not started yet
    
    const stage = currentStage;
    
    switch (stage) {
      // Special case: "Completed" - all stages are completed
      case 'Completed':
        return steps.length; // This makes all stages appear as completed (idx < steps.length for all)
      
      // Special case: "Scheduled" - nothing has started yet
      case 'Scheduled':
        return -1; // This makes all stages appear as not started (idx >= -1 is always true, but we'll handle it differently)
      
      // For Cryopreservation, use reengineering_status to determine which occurrence
      case 'Cryopreservation':
        // If reengineering_status is true, use the second occurrence (index 4)
        // If false, use the first occurrence (index 1)
        return reengineeringStatus ? 4 : 1;
      
      // For Transportation, use reengineering_status to determine which occurrence
      case 'Transportation':
        // If reengineering_status is true, use the second occurrence (index 5)
        // If false, use the first occurrence (index 2)
        return reengineeringStatus ? 5 : 2;
      
      // For other stages, find the first matching index
      default: {
        const foundIndex = steps.findIndex(s => s.key === stage);
        return foundIndex >= 0 ? foundIndex : -1;
      }
    }
  })();

  const transformedTasks: MyTask[] = (Array.isArray(myTasks) ? myTasks : []).map(task => {
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
        status: task.status
      };
    } catch (error) {
      console.error('Error transforming task:', task, error);
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
        status: task.status || 'Not started'
      };
    }
  });

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!patientId) return;
      setLoadingPatient(true);
      try {
        const [stageData, patientDataResp] = await Promise.all([
          patientService.getPatientStage(patientId),
          patientService.getPatientById(patientId),
        ]);
        if (isMounted) {
          setCurrentStage(stageData?.stage ?? null);
          setReengineeringStatus(stageData?.reengineering_status ?? false);
          setPatientData(patientDataResp);
        }
      } catch {
        if (isMounted) {
          setCurrentStage(null);
          setPatientData(null);
        }
      } finally {
        if (isMounted) setLoadingPatient(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [patientId]);

  useEffect(() => {
    let isMounted = true;
    const loadChecklist = async () => {
      if (!patientId) return;
      setLoadingChecklist(true);
      setChecklistError(null);
      try {
        const res = await shipmentService.getDocumentChecklist(patientId);
        if (isMounted) {
          setChecklistData({
            items: res.items || [],
            non_compliance_percentage: res.non_compliance_percentage,
          });
        }
      } catch (e) {
        if (isMounted) {
          setChecklistData(null);
          const errorMessage = e instanceof Error ? e.message : 'Failed to load document checklist';
          setChecklistError(errorMessage);
        }
      } finally {
        if (isMounted) setLoadingChecklist(false);
      }
    };
    loadChecklist();
    return () => { isMounted = false; };
  }, [patientId]);

  return (
    <div className="bg-[#FDFAFF] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-[63px]">
        {/* Top Nav Bar (fixed like Control Tower) */}
        <header className="fixed top-0 left-60 right-0 h-[63px] bg-white border-b border-gray-200 shadow-sm flex items-center justify-end px-6 gap-6 z-40">
          {/* Avatar only on the black bar */}
          <div 
            className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
            onClick={() => navigate('/user-profile')}
            title="Go to User Profile"
          >
            <span className="text-white text-xs font-semibold">{userInitials}</span>
          </div>
        </header>

        {/* Subheader with patient summary and icons */}
        <div className="bg-[#ffffff] border-b border-[#E7E1E1] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center text-black text-sm font-semibold">
            <span>
              Patient ID: {patientId} - {loadingPatient ? 'Loading...' : (patientData?.condition || 'Condition Unknown')}
            </span>
          </div>
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
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
                </div>
              )}
              {/* Tooltip */}
              <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="font-semibold text-black text-xs whitespace-nowrap">
                  Critical Alerts
                </div>
                <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
              </div>
            </div>
            {/* Stakeholder Chats */}
            <div className="relative group">
              <img
                className="w-[25px] h-[25px] cursor-pointer"
                alt="Stakeholder Chats"
                src={StakeholderChatsIcon}
                onClick={() => setShowStakeholderChatScreen(true)}
              />
              {stakeholderChatCount > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{stakeholderChatCount}</span>
                </div>
              )}
              {/* Tooltip */}
              <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="font-semibold text-black text-xs whitespace-nowrap">
                  Stakeholder Chats
                </div>
                <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
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
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
                </div>
              )}
              {/* Tooltip */}
              <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="font-semibold text-black text-xs whitespace-nowrap">
                  My Tasks
                </div>
                <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
              </div>
            </div>
             {/* Patient Summary */}
             <div className="relative group">
              <img
                className="w-[25px] h-[25px] cursor-pointer"
                alt="Patient Summary"
                src={PatientSummaryIcon}
                onClick={() => {
                  if (patientId) {
                    setShowPatientSummaryAlert(true);
                  }
                }}
              />
              {/* Tooltip */}
              <div className="absolute top-full -left-20 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                <div className="font-semibold text-black text-xs whitespace-nowrap">
                  Patient Summary
                </div>
                <div className="absolute bottom-full left-[95px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Stakeholder Chat Box */}
        <StakeholderChatBox
          isOpen={showStakeholderChatScreen}
          onClose={() => setShowStakeholderChatScreen(false)}
          patientId={patientId}
          onMessagesUpdated={() => {
            // WebSocket will automatically update unread count
            // No need to manually refresh
          }}
        />

        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* Top progress rail with icons (dynamic) */}
          <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 pb-8 px-[40px]">
            {(() => {
              return (
            <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0 w-full">
                    {steps.map((s, idx) => {
                      // Handle special cases: Completed and Scheduled
                      const isCompleted = currentIndex === steps.length 
                        ? true // All completed when currentIndex === steps.length
                        : (currentIndex > -1 && idx < currentIndex);
                      const isActive = currentIndex > -1 && currentIndex < steps.length && idx === currentIndex;
                      const isCurrentOrUpcoming = currentIndex === -1 
                        ? false // Scheduled: nothing is current or upcoming
                        : (idx >= currentIndex);
                      const circleBg = (isCompleted || isActive) ? '#8d2b8f' : '#f6e9f8';
                      const labelColor = (isCompleted || isActive) ? 'text-gray-700' : 'text-gray-500';
                      const icon = (isCompleted || isActive) ? s.dark : s.light;
                      const connector = (() => {
                        if (idx === steps.length - 1) return null;
                        // Completed: all connectors are solid purple
                        if (currentIndex === steps.length) {
                          return <div className="h-[2px] bg-[#8d2b8f] rounded-full flex-1" />;
                        }
                        // Scheduled: all connectors are light gray
                        if (currentIndex === -1) {
                          return <div className="h-[2px] bg-[#f1dff5] rounded-full flex-1" />;
                        }
                        // Normal flow
                        if (idx < currentIndex - 1) return <div className="h-[2px] bg-[#8d2b8f] rounded-full flex-1" />;
                        if (idx === currentIndex - 1) return (
                          <div className="flex-1">
                            <div className="w-full h-[2px] bg-[repeating-linear-gradient(90deg,_#8d2b8f,_#8d2b8f_6px,_transparent_6px,_transparent_12px)] rounded-full opacity-70" />
                  </div>
                        );
                        return <div className="h-[2px] bg-[#f1dff5] rounded-full flex-1" />;
                      })();

                      const containerClass = idx === steps.length - 1
                        ? 'flex items-center gap-0'
                        : 'flex items-center gap-0 flex-1';

                      return (
                        <div className={containerClass} key={`${s.key}-${idx}`}>
                          <div className="relative flex flex-col items-center w-9 my-2 shrink-0">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: circleBg }}>
                              <img src={icon} alt={s.key} className={`w-4 h-4 ${isCurrentOrUpcoming ? 'opacity-80' : ''}`} />
                  </div>
                            <div className={`absolute top-full font-semibold mt-2 text-[12px] ${labelColor} text-center whitespace-nowrap`}>{s.key}</div>
                </div>
                          {connector}
                  </div>
                      );
                    })}
                </div>
              </div>
              );
            })()}
          </div>

          {/* Quality Tracking + Track and Trace */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QualityTrackingChart />
              <TrackAndTraceMap />
          </div>

          {/* Quality Parameter + 3PL */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QualityParametersTable />
              <ThreePLTable />
          </div>

          {/* Compliance / Non-Compliance / Transport Time Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-[6fr_6fr] gap-6 items-stretch">
            <div className="min-w-0 h-full">
              <ComplianceCard 
                items={checklistData?.items || []}
                loading={loadingChecklist}
                error={checklistError}
              />
            </div>
           
            <div className="min-w-0 h-full">
            <TransportTimeComparison />
            </div>
          </div>

          {/* Audit Trail / Frequently Missed Docs / Risk */}
          <div className="grid grid-cols-1 md:grid-cols-[4fr_3fr_5fr] lg:grid-cols-[4fr_2fr_6fr] gap-6 items-stretch">
            <div className="min-w-0 h-full"><AuditTrailTable /></div>
            <div className="h-full">
              <NonComplianceCard 
                percentage={checklistData?.non_compliance_percentage ?? 0}
              missedDocsCount={
                (checklistData?.items || []).reduce(
                  (sum, item) => sum + (item.missing_documents?.length ?? 0),
                  0
                )
              }
                loading={loadingChecklist}
                error={checklistError}
              />
            </div>
            <div className="min-w-0 h-full"><RiskPanel /></div>
          </div>

          {/* Historic Lane Risk Assessment */}
          <div>
            <HistoricLaneRiskAssessment />
          </div>
        </div>
      </main>
      
      {/* Modals */}
      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={criticalAlerts.map((a) => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
          patientId: a.patient_id,
          message: a.message,
          timestamp: a.timestamp,
          status: a.status,
        }))}
        loading={loadingAlerts}
      />
      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={transformedTasks}
        loading={loadingTasks}
        variant="track"
        currentUserName={currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : ''}
        currentUserId={currentUserId}
        userRole={userRole || currentUser?.role || ''}
        defaultPatientId={patientId || ''}
        onTaskCreated={() => {
          // Refresh tasks after creation
          fetchMyTasks();
        }}
        onAdd={() => {
          // Task creation handled by onTaskCreated callback
        }}
        onEdit={async (task: MyTask) => {
          try {
            const taskId = parseInt(task.id);
            if (isNaN(taskId)) {
              console.error('Invalid task ID:', task.id);
              return;
            }

            // Get assigneeId from the task (it should be stored when user selects from dropdown)
            const assigneeId = task.assigneeId;
            
            // Prepare update data
            const updateData: {
              task_name?: string;
              description?: string;
              assignee_id?: string;
              patient_id?: string;
              due_date?: string;
              priority?: 'Low' | 'Medium' | 'High';
              status?: 'Not started' | 'In progress' | 'Done';
            } = {};

            // Check if task was created by current user - they can edit all fields
            const isCreatedByMe = task.assigneeBy?.trim().toLowerCase() === 
              (currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim().toLowerCase() : '');

            if (isCreatedByMe) {
              // Creator can update all fields
              updateData.task_name = task.taskName;
              updateData.description = task.description;
              if (assigneeId) {
                // assignee_id should be a string (user_id)
                updateData.assignee_id = String(assigneeId);
              }
              updateData.patient_id = task.patientId && task.patientId !== 'N/A' ? task.patientId : undefined;
              // Parse date - handle both ISO format and locale date string
              if (task.dueDate && task.dueDate !== 'N/A') {
                try {
                  const date = new Date(task.dueDate);
                  if (!isNaN(date.getTime())) {
                    updateData.due_date = date.toISOString();
                  }
                } catch (e) {
                  console.error('Error parsing date:', task.dueDate, e);
                }
              }
              updateData.priority = task.priority;
              updateData.status = task.status;
            } else {
              // Assignee can only update status - use dedicated status update endpoint
              if (task.status) {
                await tasksService.updateTaskStatus(taskId, task.status);
                // Refresh tasks after update
                fetchMyTasks();
                return; // Early return since we've handled the update
              }
              return;
            }

            // Call update API for full task updates (when creator edits)
            if (Object.keys(updateData).length > 0) {
              await tasksService.updateTask(taskId, updateData);
            }

            // Refresh tasks after update
            fetchMyTasks();
          } catch (error) {
            console.error('Error updating task:', error);
          }
        }}
        onDelete={() => {
          // TODO: Implement delete task functionality
        }}
      />
      {/* Legacy modal retained but not used by icon click */}
      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
      />

      {/* Patient Summary Alert Modal */}
      {patientId && (
        <PatientSummaryAlertModal
          isOpen={showPatientSummaryAlert}
          onClose={() => setShowPatientSummaryAlert(false)}
          patientId={patientId}
          onViewSummary={() => {
            // Already on track page, could scroll or highlight if needed
          }}
        />
      )}
    </div>
  );
}
