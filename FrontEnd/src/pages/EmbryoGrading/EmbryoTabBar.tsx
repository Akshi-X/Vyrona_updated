import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Star, ArrowLeftRight, BarChart2, Home } from 'lucide-react';

type Tab = 'logsheet' | 'grading' | 'compare' | 'reports';

interface EmbryoTabBarProps {
  his: string;
}

export default function EmbryoTabBar({ his }: EmbryoTabBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onDashboard = !his;
  const active: Tab | null = onDashboard
    ? null
    : pathname.endsWith('/ai-grading')
    ? 'grading'
    : pathname.endsWith('/compare')
    ? 'compare'
    : pathname.endsWith('/reports')
    ? 'reports'
    : 'logsheet';

  const tabs: { id: Tab; label: string; to: string; Icon: typeof Star }[] = [
    { id: 'logsheet', label: 'Development Tracker', to: `/embryo-console/${his}`,           Icon: ClipboardList },
    { id: 'grading',  label: 'AI Grading',          to: `/embryo-console/${his}/ai-grading`, Icon: Star },
    { id: 'compare',  label: 'Compare & Select',    to: `/embryo-console/${his}/compare`,    Icon: ArrowLeftRight },
    { id: 'reports',  label: 'Client Report',       to: `/embryo-console/${his}/reports`,    Icon: BarChart2 },
  ];

  return (
    <div className="relative z-30 h-full flex items-center shrink-0">
    <nav
      className="w-[68px] flex flex-col items-center gap-2 py-6 rounded-r-3xl shadow-lg shadow-primary/20"
      style={{ background: 'var(--gradient-primary)' }}
    >
      <button
        type="button"
        onClick={() => navigate('/embryo-console')}
        className={`group relative w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
          onDashboard
            ? 'bg-white/20 border-white/45 text-white shadow-inner'
            : 'border-white/20 text-white/80 hover:bg-white/15 hover:text-white hover:border-white/40'
        }`}
      >
        <Home size={18} />
        <Tip label="Embryo Dashboard" />
      </button>

      <span className="w-8 h-px bg-white/20 my-1" />

      {tabs.map(({ id, label, to, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            disabled={onDashboard}
            onClick={() => navigate(to)}
            className={`group relative w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
              isActive
                ? 'bg-white/20 border-white/45 text-white shadow-inner'
                : 'border-white/20 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/40'
            } ${onDashboard ? 'opacity-40 cursor-not-allowed hover:bg-transparent hover:border-white/20' : ''}`}
          >
            <Icon size={18} />
            <Tip label={onDashboard ? `${label} — open a cycle first` : label} />
          </button>
        );
      })}
    </nav>
    </div>
  );
}

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 text-white text-[11px] font-semibold px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50">
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </span>
  );
}
