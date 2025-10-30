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
import ApheresisIcon from '../../assets/TrackAndTraceIcons/Apheresis.svg';
import DarkCryopreservationIcon from '../../assets/TrackAndTraceIcons/DarkCryopreservation.svg';
import DarkTransportationIcon from '../../assets/TrackAndTraceIcons/DarkTransportation.svg';
import PreReIcon from '../../assets/TrackAndTraceIcons/Pre-Reengineering.svg';
import PostReIcon from '../../assets/TrackAndTraceIcons/Post-Reengineering.svg';
import LightCryopreservationIcon from '../../assets/TrackAndTraceIcons/LightCryopreservation.svg';
import LightTransportationIcon from '../../assets/TrackAndTraceIcons/LightTransportation.svg';
import ReinfusionIcon from '../../assets/TrackAndTraceIcons/Reinfusion.svg';

// Header icons & modals (reuse from Dashboard)
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import { criticalAlertsService, type CriticalAlert as ServiceCriticalAlert } from '../../services/criticalAlertsService';
import { tasksService, type Task } from '../../services/tasksService';

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

  return (
    <div className="bg-[#fcfaff] flex w-full" style={{ height: '100vh' }}>
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        {/* Top Black Bar */}
        <header className="h-[63px] bg-black flex items-center justify-end px-6 gap-6 flex-shrink-0">
          {/* Avatar only on the black bar */}
          <div className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">MV</span>
          </div>
        </header>

        {/* Subheader with patient summary and icons */}
        <div className="bg-[#ffffff] border-b border-[#E7E1E1] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center text-black text-sm font-semibold">
            <Link to="/dashboard" className="mr-3 text-black">←</Link>
            <span>Patient ID: {patientId} - Condition Unknown</span>
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
          {/* Top progress rail with icons */}
          <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
            <div className="flex items-center justify-between">
              {/* Left segment with dark icons and solid connector */}
              <div className="flex items-center gap-0 flex-1">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={ApheresisIcon} alt="Apheresis" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Apheresis</div>
                </div>
                <div className="h-[3px] bg-[#8d2b8f] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={DarkCryopreservationIcon} alt="Cryopreservation" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Cryopreservation</div>
                </div>
                <div className="h-[3px] bg-[#8d2b8f] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={DarkTransportationIcon} alt="Transportation" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Transportation</div>
                </div>
                <div className="h-[3px] bg-[#8d2b8f] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#8d2b8f] flex items-center justify-center">
                    <img src={PreReIcon} alt="Pre-Reengineering" className="w-4 h-4" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-700">Pre-Reengineering</div>
                </div>
                {/* dotted connector to light phase */}
                <div className="flex-1 ">
                  <div className="w-full h-[3px] bg-[repeating-linear-gradient(90deg,_#8d2b8f,_#8d2b8f_6px,_transparent_6px,_transparent_12px)] rounded-full opacity-70" />
                </div>
              </div>

              {/* Right segment with light icons */}
              <div className="flex items-center gap-0 flex-1">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={PostReIcon} alt="Post-Reengineering" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Post-Reengineering</div>
                </div>
                <div className="h-[3px] bg-[#f1dff5] rounded-full flex-1" />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={LightCryopreservationIcon} alt="Cryopreservation" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Cryopreservation</div>
                </div>
                <div className="h-[3px] bg-[#f1dff5] rounded-full flex-1 " />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={LightTransportationIcon} alt="Transportation" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Transportation</div>
                </div>
                <div className="h-[3px] bg-[#f1dff5] rounded-full flex-1 -ml-3 -mr-3" />
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-[#f6e9f8] flex items-center justify-center">
                    <img src={ReinfusionIcon} alt="Reinfusion" className="w-4 h-4 opacity-80" />
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Reinfusion</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quality Tracking + Track and Trace */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
              <h3 className="font-semibold text-black text-sm mb-2">Quality Tracking</h3>
              <QualityTrackingChart />
            </div>
            <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
              <h3 className="font-semibold text-black text-sm mb-2">Track and Trace <span className="text-green-600 ml-2 text-xs">On time</span></h3>
              <TrackAndTraceMap />
            </div>
          </div>

          {/* Quality Parameter + 3PL */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-black text-sm">Quality Parameter</h3>
                <span className="text-[10px] bg-yellow-50 text-yellow-700 px-2 py-1 rounded">Quality Loss: 11.5%</span>
              </div>
              <QualityParametersTable />
            </div>
            <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
              <h3 className="font-semibold text-black text-sm mb-2">3PL</h3>
              <ThreePLTable />
            </div>
          </div>

          {/* Compliance / Non-Compliance / Transport Time Comparison */}
          <div className="grid grid-cols-[5fr_1fr_6fr] gap-6">
            <ComplianceCard />
            <NonComplianceCard />
            <TransportTimeComparison />
          </div>

          {/* Audit Trail / Frequently Missed Docs / Risk */}
          <div className="grid grid-cols-[5fr_1fr_6fr] gap-6">
            <AuditTrailTable />
            <FrequentlyMissedDocs />
            <RiskPanel />
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



