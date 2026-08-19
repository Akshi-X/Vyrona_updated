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

  const tabs: { id: Tab; label: string; short: string; to: string; Icon: typeof Star }[] = [
    { id: 'logsheet', label: 'Development Tracker', short: 'Tracker', to: `/embryo-console/${his}`,           Icon: ClipboardList },
    { id: 'grading',  label: 'AI Grading',          short: 'Grading', to: `/embryo-console/${his}/ai-grading`, Icon: Star },
    { id: 'compare',  label: 'Compare & Select',    short: 'Compare', to: `/embryo-console/${his}/compare`,    Icon: ArrowLeftRight },
    { id: 'reports',  label: 'Client Report',       short: 'Report',  to: `/embryo-console/${his}/reports`,    Icon: BarChart2 },
  ];

  // Below md the app sidebar goes off-canvas, so this rail becomes a bottom
  // navigation bar: full width, evenly spread, labelled, safe-area padded.
  return (
    <div className="relative z-30 shrink-0 order-last md:order-none w-full md:w-auto md:h-full flex items-center justify-center">
    <nav
      className="w-full md:w-[68px] flex flex-row md:flex-col items-stretch md:items-center justify-around md:justify-start gap-1 md:gap-2 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:px-0 md:py-6 rounded-t-3xl md:rounded-t-none md:rounded-r-3xl shadow-[0_-6px_20px_rgba(107,17,118,0.2)] md:shadow-lg md:shadow-primary/20"
      style={{ background: 'var(--gradient-primary)' }}
    >
      <NavButton
        Icon={Home}
        label="Embryo Dashboard"
        short="Home"
        active={onDashboard}
        onClick={() => navigate('/embryo-console')}
      />

      <span className="hidden md:block md:w-8 md:h-px md:my-1 bg-white/20" />

      {tabs.map(({ id, label, short, to, Icon }) => (
        <NavButton
          key={id}
          Icon={Icon}
          label={onDashboard ? `${label} — open a cycle first` : label}
          short={short}
          active={active === id}
          disabled={onDashboard}
          onClick={() => navigate(to)}
        />
      ))}
    </nav>
    </div>
  );
}

function NavButton({ Icon, label, short, active, disabled, onClick }: {
  Icon: typeof Star; label: string; short: string;
  active: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-0 min-w-0 py-1.5 md:py-0 md:w-11 md:h-11 rounded-2xl border transition-all ${
        active
          ? 'bg-white/20 border-white/45 text-white shadow-inner'
          : 'border-transparent md:border-white/20 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/40'
      } ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent hover:border-transparent md:hover:border-white/20' : ''}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="md:hidden text-[9px] font-bold leading-none max-w-full truncate">{short}</span>
      <Tip label={label} />
    </button>
  );
}

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none hidden md:block absolute z-50 whitespace-nowrap rounded-lg bg-gray-900 text-white text-[11px] font-semibold px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg left-[calc(100%+12px)] top-1/2 -translate-y-1/2">
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </span>
  );
}
