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
    { id: 'logsheet', label: 'Development Tracker', to: `/embryo-console/${his}`,          icon: <ClipboardList size={12} /> },
    { id: 'grading',  label: 'AI Grading',         to: `/embryo-console/${his}/advanced`, icon: <Star size={12} /> },
    { id: 'compare',  label: 'Compare & Select',   to: `/embryo-console/${his}/compare`,  icon: <ArrowLeftRight size={12} /> },
    { id: 'reports',  label: 'Client Report',      to: `/embryo-console/${his}/reports`,  icon: <BarChart2 size={12} /> },
  ];

  return (
    <div className="flex flex-1 p-1 rounded-xl gap-0.5" style={{ background: '#ede5f4' }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.to)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-primary hover:text-primary hover:bg-white/50'
            }`}
          >
            <span className={`transition-colors ${isActive ? 'text-primary' : ''}`}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
