import { lazy, Suspense, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../contexts/CapabilityContext';
import ConfirmDialog from './ConfirmDialog';

const SidebarRefrigeratorOnly = lazy(() => import('../variants/hospital-8/Sidebar'));

export default function SidebarLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isRefrigeratorOnly } = useCapabilities();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const onLogout = () => setShowLogoutConfirm(true);

  return (
    <div className="bg-surface flex w-full h-dvh overflow-hidden">
      {isRefrigeratorOnly
        ? <Suspense fallback={null}><SidebarRefrigeratorOnly onLogout={onLogout} /></Suspense>
        : <Sidebar onLogout={onLogout} />}
      <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </div>

      {showLogoutConfirm && (
        <ConfirmDialog
          title="Confirm Logout"
          message="Are you sure you want to log out?"
          confirmLabel="Logout"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </div>
  );
}
