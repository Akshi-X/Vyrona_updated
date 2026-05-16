import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Star, ArrowLeftRight, BarChart2 } from 'lucide-react';

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

  const tabs: { id: Tab; label: string; to: string; icon: React.ReactNode }[] = [
    { id: 'logsheet', label: 'Log Sheet', to: `/embryo-grading/${his}`,          icon: <ClipboardList size={14} /> },
    { id: 'grading',  label: 'Grading',   to: `/embryo-grading/${his}/advanced`, icon: <Star size={14} /> },
    { id: 'compare',  label: 'Compare',   to: `/embryo-grading/${his}/compare`,  icon: <ArrowLeftRight size={14} /> },
    { id: 'reports',  label: 'Reports',   to: `/embryo-grading/${his}/reports`,  icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="flex border border-primary mb-3 shrink-0 rounded-xl overflow-hidden" style={{ background: 'var(--gradient-primary)' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => navigate(tab.to)}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
            active === tab.id
              ? 'border-white text-white'
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
