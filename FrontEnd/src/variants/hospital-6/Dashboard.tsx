/**
 * @variant DashboardHospital6
 * @hospital Yellow IVF (ID: 6)
 * @route /dashboard
 * @baseComponent pages/Dashboard
 *
 * Custom Dashboard for Yellow IVF (hospital_id = 6) with left sidebar layout.
 * Registry key: DashboardHospital6 (auto from hospital-6/Dashboard.tsx)
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';

const DashboardHospital6: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="flex w-full h-[100vh] overflow-x-hidden bg-[#fefce8]"
      style={{
        maxWidth: '100vw',
        touchAction: 'pan-y',
        overscrollBehaviorX: 'none',
      }}
    >
      {/* Left Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main Content Area */}
      <main
        className="flex-1 flex flex-col overflow-x-hidden overflow-y-hidden ml-60 min-w-0"
        style={{
          maxWidth: 'calc(100vw - 15rem)',
          touchAction: 'pan-y',
          overscrollBehaviorX: 'none',
          height: '100vh',
        }}
      >
        <div
          className="flex-1 p-6 pt-10 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0"
          style={{
            touchAction: 'pan-y',
            overscrollBehaviorX: 'none',
            overscrollBehaviorY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <header className="mb-2">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">Custom dashboard for Yellow IVF</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-sm text-gray-600 mb-1">Overview</h3>
              <p className="text-2xl font-bold text-gray-900">—</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-sm text-gray-600 mb-1">Alerts</h3>
              <p className="text-2xl font-bold text-gray-900">—</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-sm text-gray-600 mb-1">Activity</h3>
              <p className="text-2xl font-bold text-gray-900">—</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-sm text-gray-600 mb-1">Status</h3>
              <p className="text-2xl font-bold text-gray-900">—</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Welcome</h2>
            <p className="text-gray-600">
              This is the custom dashboard screen for Yellow IVF (Hospital ID: 6).
              You can replace this content with your own widgets and data.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardHospital6;
