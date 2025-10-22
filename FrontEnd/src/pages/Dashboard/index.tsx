import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import dashboardData from '../../data/dashboardData.json';
import { OngoingTreatments } from '../../components/OngoingTreatments';
import { Sidebar } from '../../components/Sidebar';
import { CurveBar } from '../../components/CurveBar';
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

interface DashboardProps {
  riskData?: {
    percentage: number;
    topRiskDriver: string;
  };
  complianceData?: {
    percentage: number;
    emissionsPerTreatment: number;
  };
}

export default function Dashboard({
  riskData = { percentage: 12, topRiskDriver: "Temperature" },
  complianceData = { percentage: 76, emissionsPerTreatment: 424 }
}: DashboardProps) {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

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
      <Sidebar onLogout={logout} />

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

                    {dashboardData.volumeMetrics.map((metric, index) => (
                      <div key={index} className="flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img
                              className="w-[18px] h-[18px]"
                              alt={metric.label}
                              src={getIcon(metric.icon)}
                            />
                          </div>
                          <div className="font-semibold text-black text-[28px] mr-4">
                            {metric.value}
                          </div>
                        </div>
                        <div className="font-normal text-[#868686] text-[11px] text-left">
                          {metric.label}
                        </div>
                      </div>
                    ))}
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

                    {dashboardData.logisticsMetrics.map((metric, index) => (
                      <div key={index} className="flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-8 h-8 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                            <img
                              className="w-[18px] h-[18px]"
                              alt={metric.label}
                              src={getIcon(metric.icon)}
                            />
                          </div>
                          <div className="font-semibold text-black text-[28px]">
                            {metric.value}
                          </div>
                        </div>
                        <div className="font-normal text-[#868686] text-[10px] text-left">
                          {metric.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Performance Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Performance
                </h2>
                <div className="bg-white border border-[#E7E1E1] rounded-lg p-6">
                  <div className="grid grid-cols-3 gap-12">
                    {dashboardData.performanceMetrics.map((metric, index) => (
                      <div key={index}>
                        <div className="font-normal text-[#868686] text-[11px] mb-2">
                          {metric.label}
                        </div>
                        <div className="font-semibold text-black text-[28px]">
                          {metric.value}
                        </div>
                      </div>
                    ))}
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
                      className="w-7 h-[24.86px] cursor-pointer"
                      alt="Notifications"
                      src={StakeholderChatsIcon}
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
                      className="w-[22px] h-[22px] cursor-pointer"
                      alt="Messages"
                      src={StakeholderChatsIcon}
                    />
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                      <span className="font-semibold text-white text-[10px]">
                        4
                      </span>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Messages
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
                    <div key={index} className="flex-1 bg-white border border-[#E7E1E1] rounded-lg">
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
                      percentage={riskData.percentage}
                      color="#ff6b35"
                      size="md"
                    />
                    <div className="absolute mt-[25px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                      <div className="font-semibold text-black text-[28px] whitespace-nowrap">
                        {riskData.percentage}%
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
                      {riskData.topRiskDriver}
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
                      percentage={complianceData.percentage}
                      color="#1083c5"
                      size="md"
                    />
                    <div className="absolute mt-[25px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                      <div className="font-semibold text-black text-[28px]">
                        {complianceData.percentage}%
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
                      {complianceData.emissionsPerTreatment}
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
    </div>
  );
}


