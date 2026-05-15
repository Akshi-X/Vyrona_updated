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

  const isAdvanced = pathname.endsWith('/advanced');
  const isCompare  = pathname.endsWith('/compare');
  const isReports  = pathname.endsWith('/reports');

  const title = isAdvanced
    ? `Advanced Embryo Grading | ${hisPart}`
    : isCompare
    ? `Leaderboard & Compare | ${hisPart}`
    : isReports
    ? `Embryo Reports | ${hisPart}`
    : `Embryology Log Sheet | ${hisPart}`;

  const homeBtn = (
    <button
      type="button"
      onClick={() => navigate('/embryo-grading')}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-line bg-white text-sm text-gray-700 hover:bg-gray-50 hover:text-primary transition-colors"
    >
      <Home size={15} />
      Embryo Dashboard
    </button>
  );

  const pageActions = isAdvanced ? (
    <div className="flex items-center gap-2">
      {homeBtn}
    </div>
  ) : isCompare ? (
    <div className="flex items-center gap-2">
      {homeBtn}
    </div>
  ) : isReports ? (
    <div className="flex items-center gap-2">
      {homeBtn}
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {homeBtn}
    </div>
  );

  return (
    <PageLayout title={title} actions={pageActions}>
      <EmbryoTabBar his={his} />
      <Outlet />
    </PageLayout>
  );
}
