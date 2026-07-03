import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import VariantRoute from './VariantRoute';
import { useAuth } from '../contexts/AuthContext';
import ConfirmDialog from './ConfirmDialog';

export default function SidebarLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="bg-surface flex w-full min-h-screen">
      <VariantRoute
        routePath="/_sidebar"
        defaultComponent={<Sidebar onLogout={() => setShowLogoutConfirm(true)} />}
        componentProps={{ onLogout: () => setShowLogoutConfirm(true) }}
      />
      <div className="flex-1 min-w-0 overflow-x-hidden">
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
