import { useParams, Link, useNavigate } from 'react-router-dom';
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

export default function TrackPage() {
  const { patientId } = useParams();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="bg-[#fcfaff] flex w-full" style={{ height: '100vh' }}>
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        <header className="h-[63px] bg-black flex items-center justify-between px-6 gap-6 flex-shrink-0">
          <div className="flex items-center text-white text-sm">
            <Link to="/dashboard" className="mr-3 hover:underline">←</Link>
            <span className="font-medium">Patient ID: {patientId} - Condition Unknown</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-semibold">MV</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* Top progress rail (mock static for now) */}
          <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
            <div className="grid grid-cols-8 gap-4 text-xs text-gray-700">
              {['Apheresis','Cryopreservation','Transportation','Pre-Reengineering','Post-Reengineering','Cryopreservation','Transportation','Reinfusion'].map((label, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-300 flex items-center justify-center text-purple-600">{idx+1}</div>
                  <div className="mt-2 text-center leading-tight">{label}</div>
                </div>
              ))}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ComplianceCard />
            <NonComplianceCard />
            <TransportTimeComparison />
          </div>

          {/* Audit Trail / Frequently Missed Docs / Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
    </div>
  );
}


