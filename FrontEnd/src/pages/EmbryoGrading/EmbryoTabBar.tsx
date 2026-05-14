import { useLocation, useNavigate } from 'react-router-dom';

type Tab = 'logsheet' | 'grading' | 'compare' | 'reports';

interface EmbryoTabBarProps {
  his: string;
}

export default function EmbryoTabBar({ his }: EmbryoTabBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const active: Tab = pathname.endsWith('/advanced')
    ? 'grading'
    : pathname.endsWith('/compare')
    ? 'compare'
    : pathname.endsWith('/reports')
    ? 'reports'
    : 'logsheet';

  const tabs: { id: Tab; label: string; to: string }[] = [
    { id: 'logsheet', label: 'Log Sheet',             to: `/embryo-grading/${his}` },
    { id: 'grading',  label: 'Grading',               to: `/embryo-grading/${his}/advanced` },
    { id: 'compare',  label: 'Leaderboard & Compare', to: `/embryo-grading/${his}/compare` },
    { id: 'reports',  label: 'Reports',               to: `/embryo-grading/${his}/reports` },
  ];

  return (
    <div className="flex border-b border-[#E7E1E1] -mx-4 md:-mx-6 px-4 md:px-6 mb-3 bg-white shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => navigate(tab.to)}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            active === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
