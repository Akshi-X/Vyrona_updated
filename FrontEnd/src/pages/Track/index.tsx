import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import FrequentlyMissedDocs from './sections/FrequentlyMissedDocs.tsx';
import RiskPanel from './sections/RiskPanel.tsx';
import HistoricLaneRiskAssessment from './sections/HistoricLaneRiskAssessment.tsx';
import PatientSummaryIcon from '../../assets/TrackAndTraceIcons/PatientSummary.svg';
import DarkApheresisIcon from '../../assets/TrackAndTraceIcons/DarkApheresis.svg';
import LightApheresisIcon from '../../assets/TrackAndTraceIcons/LightApheresis.svg';
import DarkCryopreservationIcon from '../../assets/TrackAndTraceIcons/DarkCryopreservation.svg';
import DarkTransportationIcon from '../../assets/TrackAndTraceIcons/DarkTransportation.svg';
import PreReIcon from '../../assets/TrackAndTraceIcons/Pre-Reengineering.svg';
import LightPreReIcon from '../../assets/TrackAndTraceIcons/LightPre-Reengineering.svg';
import PostReIcon from '../../assets/TrackAndTraceIcons/Post-Reengineering.svg';
import DarkPostReIcon from '../../assets/TrackAndTraceIcons/DarkPost-Reengineering.svg';
import LightCryopreservationIcon from '../../assets/TrackAndTraceIcons/LightCryopreservation.svg';
import LightTransportationIcon from '../../assets/TrackAndTraceIcons/LightTransportation.svg';
import ReinfusionIcon from '../../assets/TrackAndTraceIcons/Reinfusion.svg';
import DarkReinfusionIcon from '../../assets/TrackAndTraceIcons/DarkReinfusion.svg';
import { patientService, type PatientResponse } from '../../services/patientService';

// Header icons & modals (reuse from Dashboard)
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import { criticalAlertsService, type CriticalAlert as ServiceCriticalAlert } from '../../services/criticalAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { userService } from '../../services/userService';

export default function TrackPage() {
  const { patientId } = useParams();
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Header interactions state (mirrors Dashboard behavior)
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState<ServiceCriticalAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [userInitials, setUserInitials] = useState<string>('');
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [patientData, setPatientData] = useState<PatientResponse | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);

  const stakeholderChats = [
    { id: '1', sender: 'Dr. Sarah Johnson', patientId: `Patient ID : ${patientId}`, message: 'Need update on patient transport status', timestamp: '2024-05-28 14:20', isRead: false },
    { id: '2', sender: 'Dr. Sarah Johnson', patientId: `Patient ID : ${patientId}`, message: 'Need update on patient transport status', timestamp: '2024-05-28 14:20', isRead: true },
  ];

  const stakeholderChatCount = stakeholderChats.length;
  const criticalAlertsCount = criticalAlerts.length;
  const myTasksCount = myTasks.length;

  const fetchCriticalAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const response = await criticalAlertsService.getCriticalAlerts('pharma_12345');
      setCriticalAlerts(response.alerts || []);
    } catch (e) {
      setCriticalAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await tasksService.getMyTasks();
      setMyTasks(response.tasks || []);
    } catch (e) {
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchCriticalAlerts();
    fetchMyTasks();
  }, []);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
      } catch {
        setUserInitials('U');
      }
    };
    fetchUserProfile();
  }, []);

  const transformedTasks: MyTask[] = myTasks.map(task => ({
    id: task.id.toString(),
    patientId: task.patient_id || 'N/A',
    taskName: task.task_name,
    description: task.description || '',
    assigneeBy: `${task.created_by.first_name} ${task.created_by.last_name}`,
    dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A',
    priority: task.priority,
    status: task.status
  }));

  useEffect(() => {
    let isMounted = true;
    const loadStage = async () => {
      if (!patientId) return;
      try {
        const data = await patientService.getPatientStage(patientId);
        if (isMounted) setCurrentStage(data?.stage ?? null);
      } catch {
        if (isMounted) setCurrentStage(null);
      }
    };
    loadStage();
    return () => { isMounted = false; };
  }, [patientId]);

  useEffect(() => {
    let isMounted = true;
    const loadPatient = async () => {
      if (!patientId) return;
      setLoadingPatient(true);
      try {
        const data = await patientService.getPatientById(patientId);
        if (isMounted) setPatientData(data);
      } catch {
        if (isMounted) setPatientData(null);
      } finally {
        if (isMounted) setLoadingPatient(false);
      }
    };
    loadPatient();
    return () => { isMounted = false; };
  }, [patientId]);

  return (
    <div className="bg-[#fcfaff] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        {/* Top Black Bar */}
        <header className="h-[63px] bg-black flex items-center justify-end px-6 gap-6 flex-shrink-0">
          {/* Avatar only on the black bar */}
          <div className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center">
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
                className="w-[22px] h-[22px] cursor-pointer"
                alt="Critical Alerts"
                src={CriticalAlertsIcon}
                onClick={() => { fetchCriticalAlerts(); setShowCriticalAlerts(true); }}
              />
              {criticalAlertsCount > 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
                </div>
              )}
            </div>
            {/* Stakeholder Chats */}
            <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="Stakeholder Chats"
                src={StakeholderChatsIcon}
                onClick={() => setShowStakeholderChats(true)}
              />
              {stakeholderChatCount > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{stakeholderChatCount}</span>
                </div>
              )}
            </div>
            {/* My Tasks */}
            <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="My Tasks"
                src={MyTasksIcon}
                onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}
              />
              {myTasksCount > 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                  <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
                </div>
              )}
            </div>
             {/* Patient Summary */}
             <div className="relative group">
              <img
                className="w-[22px] h-[22px] cursor-pointer"
                alt="Patient Summary"
                src={PatientSummaryIcon}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* Top progress rail with icons (dynamic) */}
          <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 pb-8 px-[40px]">
            {(() => {
              const steps = [
                { key: 'Apheresis', dark: DarkApheresisIcon, light: LightApheresisIcon },
                { key: 'Cryopreservation', dark: DarkCryopreservationIcon, light: LightCryopreservationIcon },
                { key: 'Transportation', dark: DarkTransportationIcon, light: LightTransportationIcon },
                { key: 'Pre-Reengineering', dark: PreReIcon, light: LightPreReIcon },
                { key: 'Post-Reengineering', dark: DarkPostReIcon, light: PostReIcon },
                { key: 'Cryopreservation', dark: DarkCryopreservationIcon, light: LightCryopreservationIcon },
                { key: 'Transportation', dark: DarkTransportationIcon, light: LightTransportationIcon },
                { key: 'Reinfusion', dark: DarkReinfusionIcon, light: ReinfusionIcon },
              ];

              const currentIndex = Math.max(
                0,
                steps.findIndex(s => s.key === (currentStage ?? ''))
              );

              return (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0 w-full">
                    {steps.map((s, idx) => {
                      const isCompleted = idx < currentIndex;
                      const isCurrentOrUpcoming = idx >= currentIndex;
                      const circleBg = isCompleted ? '#8d2b8f' : '#f6e9f8';
                      const labelColor = isCompleted ? 'text-gray-700' : 'text-gray-500';
                      const icon = isCompleted ? s.dark : s.light;
                      const connector = (() => {
                        if (idx === steps.length - 1) return null;
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
                          <div className="relative flex flex-col items-center w-9 shrink-0">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: circleBg }}>
                              <img src={icon} alt={s.key} className={`w-4 h-4 ${isCurrentOrUpcoming ? 'opacity-80' : ''}`} />
                            </div>
                            <div className={`absolute top-full mt-2 text-[10px] ${labelColor} text-center whitespace-nowrap`}>{s.key}</div>
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
          <div className="grid grid-cols-1 md:grid-cols-[4fr_2fr_6fr] gap-6 items-stretch">
            <div className="min-w-0 h-full">
              <ComplianceCard />
            </div>
            <div className="h-full">
              <NonComplianceCard />
            </div>
            <div className="min-w-0 h-full">
              <TransportTimeComparison />
            </div>
          </div>

          {/* Audit Trail / Frequently Missed Docs / Risk */}
          <div className="grid grid-cols-1 md:grid-cols-[4fr_3fr_5fr] lg:grid-cols-[4fr_2fr_6fr] gap-6 items-stretch">
            <div className="min-w-0 h-full"><AuditTrailTable /></div>
            <div className="h-full"><FrequentlyMissedDocs /></div>
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
        tasks={myTasks.map((task) => ({
          id: task.id.toString(),
          patientId: task.patient_id || 'N/A',
          taskName: task.task_name,
          description: task.description || '',
          assigneeBy: `${task.created_by.first_name} ${task.created_by.last_name}`,
          dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A',
          priority: task.priority,
          status: task.status
        }))}
        loading={loadingTasks}
      />
      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
      />
    </div>
  );
}



