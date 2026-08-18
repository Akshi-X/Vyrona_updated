import { useEffect, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import EmbryoTabBar from './EmbryoTabBar';
import FeedbackButton from '../../components/FeedbackButton';
import { ivfService } from '../../services/ivfService';

export default function EmbryoShell() {
  const { his = '' } = useParams<{ his: string }>();
  const { pathname } = useLocation();

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
    <div className="flex flex-col md:flex-row w-full h-dvh min-h-0">
      <EmbryoTabBar his={his} />
      {/* PageLayout's <main> is h-dvh; without this it ignores the flex slot and
          pushes the bottom nav off the viewport on mobile. */}
      <div className="flex-1 min-w-0 min-h-0 [&>main]:h-full">
        <PageLayout
          title={title}
          description={description}
          actions={
            <FeedbackButton
              feedbackType="ux_workflow_improvement"
              module="embryo_grading"
              priority="high"
              title="Embryo Console Feedback"
              focusField="description"
            />
          }
        >
          <Outlet />
        </PageLayout>
      </div>
    </div>
  );
}
