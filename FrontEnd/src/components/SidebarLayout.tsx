import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
export default function SidebarLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="bg-[#FDFAFF] flex w-full min-h-screen overflow-x-hidden">
      <Sidebar onLogout={handleLogout} />
      <div className="flex-1 ml-0 md:ml-60 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
