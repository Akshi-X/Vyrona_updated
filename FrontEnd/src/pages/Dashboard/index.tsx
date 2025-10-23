import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { OngoingTreatments } from '../../components/OngoingTreatments';
import { Sidebar } from '../../components/Sidebar';
import { CurveBar } from '../../components/CurveBar';
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
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import RiskIcon from '../../assets/DashBoardIcons/Risk.svg';
import ComplianceIcon from '../../assets/DashBoardIcons/Compliance.svg';
import LogisticsChainIcon from '../../assets/DashBoardIcons/Logistics_Chain.svg';
import LogisticsQualityIcon from '../../assets/DashBoardIcons/Logistics_Quality.svg';

interface StakeholderChat {
  id: string;
  sender: string;
  patientId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

interface MyTask {
  id: string;
  patientId: string;
  taskName: string;
  description: string;
  assigneeBy: string;
  dueDate: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Not started' | 'In Progress' | 'Done';
}

interface CriticalAlert {
  id: string;
  type: 'Temperature Excursion' | 'Delay Alert' | 'Quality Alert' | 'System Failure' | 'Compliance Issue';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  patientId: string;
  message: string;
  timestamp: string;
  status: 'Active' | 'Acknowledged' | 'Resolved' | 'Escalated';
}
// Performance Icons
import OnTimeIcon from '../../assets/DashBoardIcons/OnTime.svg';
import AvgLeadTimeIcon from '../../assets/DashBoardIcons/AvgLeadTime.svg';
import FailureCostIcon from '../../assets/DashBoardIcons/FailureCost.svg';

interface DashboardProps {}

export default function Dashboard({}: DashboardProps) {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);

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

  // Mock tasks data
  const myTasks: MyTask[] = [
    {
      id: '1',
      patientId: 'ZQZQ812457',
      taskName: 'Improve website Copy',
      description: 'Change header text to better reflect...',
      assigneeBy: 'Dr. Sarah Johnson',
      dueDate: '02/03/2025',
      priority: 'High',
      status: 'Done'
    },
    {
      id: '2',
      patientId: 'ZQZQ812457',
      taskName: 'Update help centre & FAQ',
      description: 'Change header text to better reflect...',
      assigneeBy: 'Dr. Sarah Johnson S',
      dueDate: '02/03/2025',
      priority: 'Medium',
      status: 'In Progress'
    },
    {
      id: '3',
      patientId: 'ZQZQ812457',
      taskName: 'Update help centre & FAQ',
      description: 'Change header text to better reflect...',
      assigneeBy: 'Dr. Sarah Johnson',
      dueDate: '02/03/2025',
      priority: 'Low',
      status: 'Not started'
    },
    {
      id: '4',
      patientId: 'ZQZQ812457',
      taskName: 'Update help centre & FAQ',
      description: 'Change header text to better reflect...',
      assigneeBy: 'Dr. Sarah Johnson',
      dueDate: '02/03/2025',
      priority: 'Low',
      status: 'Not started'
    }
  ];

  // Mock critical alerts data
  const criticalAlerts: CriticalAlert[] = [
    {
      id: '1',
      type: 'Temperature Excursion',
      severity: 'High',
      patientId: 'ZQZQ812457',
      message: 'Temperature exceeded 8°C for 15 minutes during transport',
      timestamp: '2024-05-28 (14:30)',
      status: 'Active'
    },
    {
      id: '2',
      type: 'Delay Alert',
      severity: 'Medium',
      patientId: 'ZQZQ812457',
      message: 'Manufacturing delay of 2 hours detected',
      timestamp: '2024-05-28 (14:30)',
      status: 'Acknowledged'
    },
    {
      id: '3',
      type: 'Quality Alert',
      severity: 'High',
      patientId: 'ZQZQ812457',
      message: 'Cell viability below threshold at 85%',
      timestamp: '2024-05-28 (14:30)',
      status: 'Acknowledged'
    },
    {
      id: '4',
      type: 'Delay Alert',
      severity: 'Medium',
      patientId: 'ZQZQ812457',
      message: 'Manufacturing delay of 3 hours detected',
      timestamp: '2024-05-28 (14:30)',
      status: 'Acknowledged'
    }
  ];

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
  const [error, setError] = useState<string | null>(null);

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
        {/* Header */}
        <header className="h-[63px] bg-black flex items-center justify-end px-6 gap-6 flex-shrink-0">
          <div 
            className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
            onClick={() => navigate('/user-profile')}
            title="Go to User Profile"
          >
            <span className="text-white text-xs font-semibold">
              MV
            </span>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Error loading data
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}


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
                <div className="bg-white border border-[#E7E1E1] rounded-lg p-6">
                  <div className="grid grid-cols-2 gap-12 relative">
                    {/* Vertical separator */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#E7E1E1] transform -translate-x-1/2"></div>

                    {/* Patient Count */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Patient Count"
                            src={getIcon('Patient_Count')}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px] mr-4">
                          {loading ? '...' : patientStats?.current_month_patient_count || '0'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[11px] text-left">
                        Patient Count:
                      </div>
                    </div>

                    {/* Treatment Count */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Treatments Count"
                            src={getIcon('Treatments_Count')}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px] mr-4">
                          {loading ? '...' : patientStats?.current_month_treatment_count || '0'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[11px] text-left">
                        Treatments Count:
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
                <div className="bg-white border border-[#E7E1E1] rounded-lg p-6">
                  <div className="grid grid-cols-2 gap-12 relative">
                    {/* Vertical separator */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#E7E1E1] transform -translate-x-1/2"></div>

                    {/* Cold Chain Packaging Failure */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Cold Chain Packaging Failure"
                            src={getIcon('Logistics_Chain')}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px]">
                          {loading ? '...' : logisticsMetrics?.cold_chain_packaging_failure_percentage?.toFixed(1) + '%' || '0%'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[10px] text-left">
                        Cold Chain Packaging Failure
                      </div>
                    </div>

                    {/* Average Quality Lost per Patient */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Average Quality Lost per Patient"
                            src={getIcon('Logistics_Quality')}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px]">
                          {loading ? '...' : logisticsMetrics?.avg_quality_lost_per_patient_percentage + '%' || '0%'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[10px] text-left">
                        Avg Quality Lost/Patient
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
                <div className="bg-white border border-[#E7E1E1] rounded-lg p-6">
                  <div className="grid grid-cols-3 gap-12 relative">
                    {/* Vertical separators */}
                    <div className="absolute left-1/3 top-0 bottom-0 w-px bg-[#E7E1E1] transform -translate-x-1/2"></div>
                    <div className="absolute left-2/3 top-0 bottom-0 w-px bg-[#E7E1E1] transform -translate-x-1/2"></div>

                    {/* On Time Percentage */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="On Time Performance"
                            src={OnTimeIcon}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px]">
                          {loading ? '...' : performanceMetrics?.on_time_percentage + '%' || '0%'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[11px] text-left">
                        On Time:
                      </div>
                    </div>
                    
                    {/* Average Lead Time */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Average Lead Time"
                            src={AvgLeadTimeIcon}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px]">
                          {loading ? '...' : performanceMetrics?.avg_lead_time_days + 'd' || '0d'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[11px] text-left">
                        Avg Lead time:
                      </div>
                    </div>
                    
                    {/* Failure Cost */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Failure Cost"
                            src={FailureCostIcon}
                          />
                        </div>
                        <div className="font-semibold text-black text-[28px]">
                          {loading ? '...' : '$' + performanceMetrics?.failure_cost_million + 'M' || '$0M'}
                        </div>
                      </div>
                      <div className="font-normal text-[#868686] text-[11px] text-left">
                        Failure Cost:
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
                <div className="relative group">
                    <img
                      className="w-[22px] h-[22px] cursor-pointer"
                      alt="Alerts"
                      src={CriticalAlertsIcon}
                    />
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                      <span className="font-semibold text-white text-[10px]">
                        5
                      </span>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Critical Alerts
                      </div>
                      <div className="absolute bottom-full left-8 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>
                  
                  <div className="relative group">
                    <img
                      className="w-7 h-[24.86px] cursor-pointer"
                      alt="Notifications"
                      src={StakeholderChatsIcon}
                      onClick={() => setShowStakeholderChats(true)}
                    />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                      <span className="font-semibold text-white text-[10px]">
                        1
                      </span>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Stakeholder Chats
                      </div>
                      <div className="absolute bottom-full left-8 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>

                  <div className="relative group">
                    <img
                      className="w-[22px] h-[22px] cursor-pointer"
                      alt="Messages"
                      src={MyTasksIcon}
                      onClick={() => setShowMyTasks(true)}
                    />
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                      <span className="font-semibold text-white text-[10px]">
                        4
                      </span>
                    </div>
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
                      className={`flex-1 bg-white border border-[#E7E1E1] rounded-lg ${card.alt === 'My Tasks' ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                      onClick={card.alt === 'My Tasks' ? () => setShowMyTasks(true) : undefined}
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
                <div className="flex-1 bg-white rounded-lg border border-[#E7E1E1] p-5 flex flex-col items-center">
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
                      <div className="font-normal text-black text-[11px] whitespace-nowrap">
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
                    <div className="font-normal text-black text-[11px] whitespace-nowrap">
                      Top Risk Driver
                    </div>
                  </div>

                  <div className="h-[30px] bg-[#fff3ee] rounded-[10px] border border-solid border-[#E7E1E1] px-4">
                    <span className="font-semibold text-orange-600 text-xs whitespace-nowrap mt-2 py-1">
                      {loading ? '...' : riskMetrics?.top_risk_driver?.name || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Compliance Section */}
                <div className="flex-1 bg-white rounded-lg border border-[#E7E1E1] p-5 flex flex-col items-center ">
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
                      <div className="font-normal text-black text-[11px]">
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
                    <span className="font-normal text-black text-[11px] whitespace-nowrap">
                      Emissions per Treatment
                    </span>
                  </div>

                  <div className="bg-[#e4f5ff] border-[#E7E1E1] px-4 h-[30px] rounded mt-0 gap-1 flex items-center justify-center">
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
      {showCriticalAlerts && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 overflow-hidden h-full w-full z-50"
          onClick={() => setShowCriticalAlerts(false)}
        >
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="relative mx-auto border w-11/12 md:w-4/5 lg:w-3/4 xl:w-2/3 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg mr-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Critical Alerts</h3>
                    <p className="text-sm text-gray-500">Review critical alerts that require immediate attention</p>
                  </div>
                </div>
                {/* Close Icon */}
                <button
                  onClick={() => setShowCriticalAlerts(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Alerts Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-purple-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[150px]">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[100px]">Severity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[120px]">Patient ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[300px]">Message</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[150px]">Timestamp</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[120px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {criticalAlerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap min-w-[150px]">
                          <div className="text-sm font-medium text-gray-900">{alert.type}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap min-w-[100px]">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            alert.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                            alert.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                            alert.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {alert.severity}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-mono min-w-[120px]">
                          {alert.patientId}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 min-w-[300px]">
                          <div className="break-words max-w-[300px]">{alert.message}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 min-w-[150px]">
                          {alert.timestamp}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap min-w-[120px]">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            alert.status === 'Active' ? 'bg-red-100 text-red-800' :
                            alert.status === 'Acknowledged' ? 'bg-yellow-100 text-yellow-800' :
                            alert.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {alert.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer - Close button removed */}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* My Tasks Modal */}
      {showMyTasks && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 overflow-hidden h-full w-full z-50"
          onClick={() => setShowMyTasks(false)}
        >
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="relative mx-auto border w-11/12 md:w-4/5 lg:w-3/4 xl:w-2/3 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  {/* Icon and Title */}
                  <div className="p-2 bg-purple-100 rounded-lg mr-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">My Tasks</h3>
                    <p className="text-sm text-gray-500">Manage and track your assigned tasks</p>
                  </div>
                </div>
                {/* Close Icon */}
                <button
                  onClick={() => setShowMyTasks(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Tasks Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-purple-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[100px]">Patient ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[150px]">Task Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[200px]">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[120px]">Assignee by</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[100px]">Due date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[80px]">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider min-w-[100px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {myTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-mono min-w-[100px]">
                          {task.patientId}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap min-w-[150px]">
                          <div className="text-sm font-medium text-gray-900">{task.taskName}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 min-w-[200px]">
                          <div className="break-words">{task.description}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[120px]">
                          {task.assigneeBy}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 min-w-[100px]">
                          {task.dueDate}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap min-w-[80px]">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            task.priority === 'High' ? 'bg-red-100 text-red-800' :
                            task.priority === 'Medium' ? 'bg-orange-100 text-orange-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap min-w-[100px]">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            task.status === 'Done' ? 'bg-green-100 text-green-800' :
                            task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer - Close button removed */}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Stakeholder Chats Modal */}
      {showStakeholderChats && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 overflow-hidden h-full w-full z-50"
          onClick={() => setShowStakeholderChats(false)}
        >
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="relative mx-auto border w-11/12 md:w-4/5 lg:w-3/4 xl:w-2/3 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  {/* Icon and Title */}
                  <div className="p-2 bg-purple-100 rounded-lg mr-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Stakeholder Chats</h3>
                    <p className="text-sm text-gray-500">Recent message from stakeholders and team members</p>
                  </div>
                </div>
                {/* Close Icon */}
                <button
                  onClick={() => setShowStakeholderChats(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages List */}
              <div className="space-y-4">
                {stakeholderChats.map((chat) => (
                  <div 
                    key={chat.id} 
                    className={`p-4 rounded-lg border ${
                      chat.isRead 
                        ? 'bg-gray-50 border-gray-200' 
                        : 'bg-purple-50 border-purple-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="mb-1">
                          <span className={`font-semibold ${
                            chat.isRead ? 'text-gray-700' : 'text-purple-700'
                          }`}>
                            {chat.sender}
                          </span>
                        </div>
                        <div className={`text-sm mb-2 ${
                          chat.isRead ? 'text-gray-500' : 'text-purple-600'
                        }`}>
                          {chat.patientId}
                        </div>
                        <p className={`text-sm ${
                          chat.isRead ? 'text-gray-700' : 'text-gray-800'
                        }`}>
                          {chat.message}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${
                        chat.isRead ? 'text-gray-500' : 'text-purple-600'
                      }`}>
                        {chat.timestamp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer - Close button removed */}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


