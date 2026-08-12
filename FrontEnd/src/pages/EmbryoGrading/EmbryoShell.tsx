import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Home } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import EmbryoTabBar from './EmbryoTabBar';
import { ivfService } from '../../services/ivfService';

export default function EmbryoShell() {
  const { his = '' } = useParams<{ his: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [patientName, setPatientName] = useState('');

  useEffect(() => {
    if (!his) return;
    ivfService.listCycles({ his_id: his.toUpperCase() }).then(cycles => {
      const matched = cycles.find(c => c.his_id.toUpperCase() === his.toUpperCase());
      if (matched?.patient_name) setPatientName(matched.patient_name);
    }).catch(() => {});
  }, [his]);

  const hisPart = `HIS: ${his.toUpperCase()}${patientName ? ` (${patientName})` : ''}`;

  const isAdvanced = pathname.endsWith('/ai-grading');
  const isCompare  = pathname.endsWith('/compare');
  const isReports  = pathname.endsWith('/reports');

  const title = isAdvanced
    ? `AI Grading | ${hisPart}`
    : isCompare
    ? `Compare | ${hisPart}`
    : isReports
    ? `Embryo Reports | ${hisPart}`
    : `Development Tracker | ${hisPart}`;

  const description = isAdvanced
    ? 'AI-powered embryo image analysis and morphology grading'
    : isCompare
    ? 'Side-by-side comparison of embryo quality and morphology scores'
    : isReports
    ? 'Generate and export comprehensive cycle reports for clinical records'
    : 'Track day-by-day embryo development from fertilization to fate';

  return (
    <PageLayout title={title} description={description}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/embryo-console')}
          className="inline-flex items-center gap-1.5 px-3.5 py-3 rounded-lg text-xs font-semibold text-[#6b1176]/60 hover:text-[#6b1176]/90 hover:bg-white hover:shadow-sm transition-all shrink-0"
          style={{ background: '#ede5f4' }}
        >
          <Home size={12} />
          Embryo Dashboard
        </button>
        <EmbryoTabBar his={his} />
      </div>
      <Outlet />
    </PageLayout>
  );
}
