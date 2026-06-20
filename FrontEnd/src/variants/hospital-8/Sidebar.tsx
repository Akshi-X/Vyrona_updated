import React from 'react';
import { Grid3x3, Settings, LogOut, FileText, Users, User, Refrigerator } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarProps {
  onLogout?: () => void;
}

const TOOLTIP = 'pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-[#29053f] text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-[9999]';

function NavButton({ onClick, className, children, tooltip }: {
  onClick: () => void;
  className: string;
  children: React.ReactNode;
  tooltip: string;
}) {
  return (
    <div className="relative group">
      <button onClick={onClick} className={className}>
        {children}
      </button>
      <span className={TOOLTIP}>{tooltip}</span>
    </div>
  );
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { id: 'dashboard', icon: Grid3x3, label: 'Dashboard', path: '/dashboard' },
    { id: 'alerts', icon: Settings, label: 'Alert Config', path: '/alert-setting' },
    { id: 'refrigerator', icon: Refrigerator, label: 'Refrigerator Tracking', path: '/refrigerator-tracking' },
    { id: 'reports', icon: FileText, label: 'Reports', path: '/reports' },
    { id: 'users', icon: Users, label: 'Users', path: '/users' },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const navCls = (path: string) =>
    `p-2.5 transition-colors rounded-lg ${isActive(path) ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`;

  return (
    <div className="w-20 bg-gradient-to-b from-[#7b2f83] to-[#29053f] flex flex-col items-center py-6 gap-6 flex-shrink-0 h-screen relative z-[100]">
      {/* Logo */}
      <div className="w-12 h-12 flex items-center justify-center cursor-pointer">
        <img src="/tabLogowhite.svg" alt="Logo" className="w-full h-full object-contain" />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-8 flex-1 justify-center">
        {navItems.map(({ id, icon: Icon, label, path }) => (
          <NavButton key={id} onClick={() => navigate(path)} className={navCls(path)} tooltip={label}>
            <Icon size={22} />
          </NavButton>
        ))}
      </nav>

      {/* Bottom */}
      <div className="flex flex-col gap-4 items-center">
        <NavButton onClick={() => navigate('/user-profile')} className={navCls('/user-profile')} tooltip="Profile">
          <User size={20} />
        </NavButton>
        <NavButton
          onClick={() => onLogout?.()}
          className="p-2.5 text-white/70 hover:text-red-400 transition-colors rounded-lg hover:bg-white/10"
          tooltip="Logout"
        >
          <LogOut size={20} />
        </NavButton>
      </div>
    </div>
  );
};

export default Sidebar;
