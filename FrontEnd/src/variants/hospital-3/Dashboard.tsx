/**
 * @variant DashboardHospital3
 * @hospital ID: 3
 * @route /dashboard
 * @baseComponent pages/Dashboard
 *
 * Custom Dashboard for Hospital 3.
 * This component replaces the default Dashboard for users
 * belonging to hospital_id = 3.
 *
 * Registry key: DashboardHospital3 (auto from hospital-3/Dashboard.tsx)
 */

import React from 'react';

const DashboardHospital3: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Dashboard
        </h1>
        <p className="text-gray-600 mt-1">
          Custom dashboard for Hospital 3
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Welcome
        </h2>
        <p className="text-gray-600">
          This is the custom dashboard screen for Hospital 3. You can replace this
          component with your own layout and widgets.
        </p>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        Dashboard variant for Hospital ID: 3
      </div>
    </div>
  );
};

export default DashboardHospital3;
