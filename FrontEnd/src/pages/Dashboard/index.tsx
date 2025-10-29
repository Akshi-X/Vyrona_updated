import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { OngoingTreatments } from '../../components/OngoingTreatments';
import { Sidebar } from '../../components/Sidebar';
import { CurveBar } from '../../components/CurveBar';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import TrackShipmentModal from '../../components/TrackShipmentModal';
import { criticalAlertsService, type CriticalAlert as ServiceCriticalAlert } from '../../services/criticalAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { logisticsService, type PatientStatistics, type LogisticsMetrics } from '../../services/logisticsService';
import { performanceService, type PerformanceMetrics } from '../../services/performanceService';
import { riskService, type RiskMetrics } from '../../services/riskService';
import { complianceService, type ComplianceMetrics } from '../../services/complianceService';
// Dashboard Icons
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import TreatmentsCountIcon from '../../assets/DashBoardIcons/Treatments_Count.svg';
import PatientCountIcon from '../../assets/DashBoardIcons/Patient_Count.svg';
import TrackingShipmentIcon from '../../assets/DashBoardIcons/Tracking_Shipment.svg';
import AftercareIcon from '../../assets/DashBoardIcons/Atercare.svg';
import Header from '../../components/Header';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import RiskIcon from '../../assets/DashBoardIcons/Risk.svg';
import ComplianceIcon from '../../assets/DashBoardIcons/Compliance.svg';
import LogisticsChainIcon from '../../assets/DashBoardIcons/Logistics_Chain.svg';
import LogisticsQualityIcon from '../../assets/DashBoardIcons/Logistics_Quality.svg';

// TODO: Replace with actual user's pharma_id from authentication context
const DUMMY_PHARMA_ID = 'pharma_12345';

interface StakeholderChat {
  id: string;
  sender: string;
  patientId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}


// Performance Icons
import OnTimeIcon from '../../assets/DashBoardIcons/OnTime.svg';
import AvgLeadTimeIcon from '../../assets/DashBoardIcons/AvgLeadTime.svg';
import FailureCostIcon from '../../assets/DashBoardIcons/FailureCost.svg';

interface DashboardProps { }

export default function Dashboard({ }: DashboardProps) {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);

  // Real data from APIs
  const [criticalAlerts, setCriticalAlerts] = useState<ServiceCriticalAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showTrackShipment, setShowTrackShipment] = useState(false);



  // Mock stakeholder chats data
  const stakeholderChats: StakeholderChat[] = [
    {
      id: '1',
      sender: 'Dr. Sarah Johnson',
      patientId: 'Patient ID : ZQ812457',
      message: 'Need update on patient transport status',
      timestamp: '2024-05-28 14:20',
      isRead: false
    },
    {
      id: '2',
      sender: 'Dr. Sarah Johnson',
      patientId: 'Patient ID : ZQ812457',
      message: 'Need update on patient transport status',
      timestamp: '2024-05-28 14:20',
      isRead: true
    },
    {
      id: '3',
      sender: 'Dr. Sarah Johnson',
      patientId: 'Patient ID : ZQ812457',
      message: 'Need update on patient transport status',
      timestamp: '2024-05-28 14:20',
      isRead: false
    }
  ];

  // Calculate dynamic notification counts
  const stakeholderChatCount = stakeholderChats.length; // Show total chats count
  const criticalAlertsCount = criticalAlerts.length; // Show total alerts count
  const myTasksCount = myTasks.length; // Show total tasks count


  // Fetch critical alerts from API
  const fetchCriticalAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const response = await criticalAlertsService.getCriticalAlerts(DUMMY_PHARMA_ID);
      setCriticalAlerts(response.alerts || []);
    } catch (error) {
      setCriticalAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Fetch critical alerts on component mount
  useEffect(() => {
    fetchCriticalAlerts();
  }, []);

  // Fetch my tasks from API
  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await tasksService.getMyTasks();
      setMyTasks(response.tasks || []);
    } catch (error) {
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Fetch my tasks on component mount
  useEffect(() => {
    fetchMyTasks();
  }, []);

  // Transform API data to match component interface
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

  const transformedAlerts = criticalAlerts.map(alert => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    patientId: alert.patient_id,
    message: alert.message,
    timestamp: alert.timestamp,
    status: alert.status
  }));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // State for patient statistics
  const [patientStats, setPatientStats] = useState<PatientStatistics | null>(null);
  const [logisticsMetrics, setLogisticsMetrics] = useState<LogisticsMetrics | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [complianceMetrics, setComplianceMetrics] = useState<ComplianceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  // Static pharma ID - in future this will come from verify OTP
  const PHARMA_ID = 1;

  // Fetch patient statistics and logistics metrics on component mount
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch patient statistics, logistics metrics, performance metrics, risk metrics, and compliance metrics in parallel
        const [stats, logistics, performance, risk, compliance] = await Promise.all([
          logisticsService.getPatientStatistics(), // Call without pharma_id
          logisticsService.getLogisticsMetrics(PHARMA_ID.toString()),
          performanceService.getPerformanceMetrics(PHARMA_ID.toString()),
          riskService.getRiskMetrics(PHARMA_ID.toString()),
          complianceService.getComplianceMetrics(PHARMA_ID.toString())
        ]);

        setPatientStats(stats);
        setLogisticsMetrics(logistics);
        setPerformanceMetrics(performance);
        setRiskMetrics(risk);
        setComplianceMetrics(compliance);
      } catch (err) {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchDashboardData();
    }
  }, [isAuthenticated]);

  // Icon mapping function
  const getIcon = (iconName: string) => {
    const iconMap: { [key: string]: string } = {
      'Treatments_Count': TreatmentsCountIcon,
      'Patient_Count': PatientCountIcon,
      'Risk': RiskIcon,
      'Compliance': ComplianceIcon,
      'Logistics_Chain': LogisticsChainIcon,
      'Logistics_Quality': LogisticsQualityIcon,
    };
    return iconMap[iconName] || '';
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the dashboard.</p>
      </div>
    );
  }

  const volumeCards = [
    {
      label: "Tracking Shipment",
      icon: TrackingShipmentIcon,
      alt: "Tracking Shipment",
    },
    {
      label: "Aftercare",
      icon: AftercareIcon,
      alt: "Aftercare",
    },
    {
      label: "Failures",
      icon: MyTasksIcon,
      alt: "My Tasks",
    },
  ];


  return (
    <div className="bg-[#fcfaff] flex w-full" style={{ height: '100vh' }}>
      {/* Left Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        <Header
          title=""
          showBackButton={false}
          className=""
          offsetLeft="15rem"
          rightContent={(
            <div 
              className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
              onClick={() => navigate('/user-profile')}
              title="Go to User Profile"
            >
              <span className="text-white text-xs font-semibold">MV</span>
            </div>
          )}
        />

        {/* Dashboard Content */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0" style={{ paddingTop: 'calc(63px + 1rem)' }}>


          <div className="flex gap-6 flex-1 flex-col lg:flex-row">
            {/* Left Column */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
              <h1 className="font-semibold text-black text-lg">
                Monthly Summary
              </h1>

              {/* Volume Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Volume
                </h2>
                <div className="p-0">
                  <div className="grid grid-cols-2 gap-6 relative">

                    {/* Patient Count */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] mr-6">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Patient Count"
                            src={getIcon('Patient_Count')}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[12px] mt-2">
                          Patient Count:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : patientStats?.current_month_patient_count || '0'}
                        </div>
                      </div>
                    </div>

                    {/* Treatment Count */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] mr-6">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Treatments Count"
                            src={getIcon('Treatments_Count')}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[12px] mt-2">
                          Treatments Count:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : patientStats?.current_month_treatment_count || '0'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Logistics Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Logistics
                </h2>
                <div className="p-0">
                  <div className="grid grid-cols-2 gap-6 relative">

                    {/* Cold Chain Packaging Failure */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] mr-6">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 mr-4 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Cold Chain Packaging Failure"
                            src={getIcon('Logistics_Chain')}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[10px] mt-2">
                          Cold Chain Packaging Failure
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : logisticsMetrics?.cold_chain_packaging_failure_percentage?.toFixed(1) + '%' || '0%'}
                        </div>
                      </div>
                    </div>

                    {/* Average Quality Lost per Patient */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] mr-6">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Average Quality Lost per Patient"
                            src={getIcon('Logistics_Quality')}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[10px] mt-2">
                          Avg Quality Lost/Patient
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : logisticsMetrics?.avg_quality_lost_per_patient_percentage + '%' || '0%'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Performance Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Performance
                </h2>
                <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] mr-6">
                  <div className="grid grid-cols-3 gap-12 relative">

                    {/* On Time Percentage */}
                    <div className="flex flex-col">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="On Time Performance"
                            src={OnTimeIcon}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[12px] mt-2">
                          On Time:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : performanceMetrics?.on_time_percentage + '%' || '0%'}
                        </div>
                      </div>
                    </div>

                    {/* Average Lead Time */}
                    <div className="flex flex-col">
                      <div className="flex flex-col items-start mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Average Lead Time"
                            src={AvgLeadTimeIcon}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[12px] mt-2">
                          Avg Lead time:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : performanceMetrics?.avg_lead_time_days + 'd' || '0d'}
                        </div>
                      </div>
                    </div>

                    {/* Failure Cost */}
                    <div className="flex flex-col">
                      <div className="flex flex-col items-start mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Failure Cost"
                            src={FailureCostIcon}
                          />
                        </div>
                        <div className="font-normal text-[#868686] text-[12px] mt-2">
                          Failure Cost:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : '$' + performanceMetrics?.failure_cost_million + 'M' || '$0M'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
              {/* Notifications Section */}
              <section className="w-full">
                <div className="flex justify-end gap-8 mb-4">
                  {/* Critical Alerts */}
                  <div className="relative group">
                    <img
                      className="w-[22px] h-[22px] cursor-pointer"
                      alt="Critical Alerts"
                      src={CriticalAlertsIcon}
                      onClick={() => {
                        fetchCriticalAlerts();
                        setShowCriticalAlerts(true);
                      }}
                    />
                    {criticalAlertsCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                        <span className="font-semibold text-white text-[10px]">
                          {criticalAlertsCount}
                        </span>
                      </div>
                    )}
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Critical Alerts
                      </div>
                      <div className="absolute bottom-full left-8 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
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
                        <span className="font-semibold text-white text-[10px]">
                          {stakeholderChatCount}
                        </span>
                      </div>
                    )}
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Stakeholder Chats
                      </div>
                      <div className="absolute bottom-full left-8 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>

                  {/* My Tasks */}
                  <div className="relative group">
                    <img
                      className="w-[22px] h-[22px] cursor-pointer"
                      alt="My Tasks"
                      src={MyTasksIcon}
                      onClick={() => {
                        fetchMyTasks();
                        setShowMyTasks(true);
                      }}
                    />
                    {myTasksCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                        <span className="font-semibold text-white text-[10px]">
                          {myTasksCount}
                        </span>
                      </div>
                    )}
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        My Tasks
                      </div>
                      <div className="absolute bottom-full left-8 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Volume Section (Top Row) */}
              <section className="w-full">
                <div className="flex gap-6 mt-7">
                  {volumeCards.map((card, index) => (
                    <div
                      key={index}
                      className={`flex-1 bg-white border border-[#E7E1E1] rounded-lg ${(card.alt === 'My Tasks' || card.alt === 'Tracking Shipment') ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                      onClick={() => {
                        if (card.alt === 'My Tasks') {
                          fetchMyTasks();
                          setShowMyTasks(true);
                        } else if (card.alt === 'Tracking Shipment') {
                          setShowTrackShipment(true);
                        }
                      }}
                    >
                      <div className="flex flex-col items-center justify-center pt-7 pb-6 px-4">
                        <img
                          className="w-[34px] h-[34px] mb-3 "
                          alt={card.alt}
                          src={card.icon}
                        />
                        <div className="h-4 flex items-center justify-center font-semibold text-black text-xs">
                          {card.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Risk and Compliance Section */}
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Risk Section */}
                <div className="flex-1 bg-[#fff3ee] rounded-lg border border-[#E7E1E1] p-5 h-[358px] flex flex-col items-center">
                  <div className="w-full mb-12">
                    <h3 className="font-semibold text-black text-base">
                      Risk
                    </h3>
                  </div>

                  <div className="relative w-[185px] h-[92px] mb-12 flex items-center justify-center">
                    <CurveBar
                      percentage={loading ? 0 : riskMetrics?.deviation_percentage || 0}
                      color="#ff6b35"
                      size="md"
                    />
                    <div className="absolute mt-[25px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                      <div className="font-semibold text-black text-[28px] whitespace-nowrap">
                        {loading ? '...' : riskMetrics?.deviation_percentage || 0}%
                      </div>
                      <div className="font-normal text-black text-[12px] whitespace-nowrap">
                        Deviation
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-[7px] mb-3 mt-4">
                    <img
                      className="w-[18px] h-[18px]"
                      alt="Risk"
                      src={RiskIcon}
                    />
                    <div className="font-normal text-black text-[12px] whitespace-nowrap">
                      Top Risk Driver
                    </div>
                  </div>

                  <div className="h-[30px] bg-[#ffffff] rounded-[10px] border border-solid border-[#E7E1E1] px-4">
                    <span className="font-semibold text-orange-600 text-xs whitespace-nowrap mt-2 py-1">
                      {loading ? '...' : riskMetrics?.top_risk_driver?.name || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Compliance Section */}
                <div className="flex-1 bg-[#e4f5ff] rounded-lg border border-[#E7E1E1] p-5 flex flex-col items-center ">
                  <h2 className="self-start font-semibold text-black text-base">
                    Compliance
                  </h2>

                  <div className="relative flex items-center justify-center w-[185px] h-[92px] mt-12 mb-6">
                    <CurveBar
                      percentage={loading ? 0 : complianceMetrics?.audit_coverage_percentage || 0}
                      color="#1083c5"
                      size="md"
                    />
                    <div className="absolute mt-[25px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                      <div className="font-semibold text-black text-[28px]">
                        {loading ? '...' : complianceMetrics?.audit_coverage_percentage || 0}%
                      </div>
                      <div className="font-normal text-black text-[12px]">
                        Audit Coverage
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2 mt-12">
                    <img
                      className="w-[18px] h-[18px]"
                      alt="Compliance icon"
                      src={ComplianceIcon}
                    />
                    <span className="font-normal text-black text-[12px] whitespace-nowrap">
                      Emissions per Treatment
                    </span>
                  </div>

                  <div className="bg-[#ffffff] border-[#E7E1E1] px-4 h-[30px] rounded mt-0 gap-1 flex items-center justify-center">
                    <span className="font-bold text-[#1083c5] text-sm">
                      {loading ? '...' : complianceMetrics?.emissions_per_treatment_tco2e || 0}
                    </span>
                    <span className="ml-0.5 font-normal text-black text-[10px] mt-1">
                      tCO2e
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Ongoing Treatments Section */}
          <section>
            <h2 className="font-semibold text-black text-sm mb-4">
              Ongoing Treatments
            </h2>
            <OngoingTreatments />
          </section>
        </div>
      </main>

      {/* Critical Alerts Modal */}
      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={transformedAlerts}
        loading={loadingAlerts}
      />

      {/* My Tasks Modal */}
      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={transformedTasks}
        loading={loadingTasks}
      />

      {/* Stakeholder Chats Modal */}
      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
      />

      {/* Track Shipment Modal */}
      <TrackShipmentModal
        isOpen={showTrackShipment}
        onClose={() => setShowTrackShipment(false)}
        onTrack={(pid) => navigate(`/track/${encodeURIComponent(pid)}`)}
      />
    </div>
  );
}


