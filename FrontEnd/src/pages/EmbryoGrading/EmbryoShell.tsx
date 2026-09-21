import { Outlet, useLocation, useParams } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import EmbryoTabBar from './EmbryoTabBar';
import FeedbackButton from '../../components/FeedbackButton';

export default function EmbryoShell() {
  const { his = '' } = useParams<{ his: string }>();
  const { pathname } = useLocation();

  const hisPart = `HIS: ${his.toUpperCase()}`;

  const isCompare  = pathname.endsWith('/compare');
  const isReports  = pathname.endsWith('/reports');

  const titleLabel = isCompare
    ? 'Compare'
    : isReports
    ? 'Embryo Reports'
    : 'Development Tracker';

  const titleSuffix = hisPart;

  const description = isCompare
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
          title={titleLabel}
          titleSuffix={titleSuffix}
          description={description}
          titleBadge="Beta"
          actions={
            <FeedbackButton
              feedbackType="ux_workflow_improvement"
              module="embryo_grading"
              priority="high"
              title="Embryo Console Feedback"
              focusField="description"
              variant='auto'
            />
          }
        >
          <Outlet />
        </PageLayout>
      </div>
    </div>
  );
}
