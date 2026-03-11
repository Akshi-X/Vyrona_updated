/**
 * @variant DashboardHospital2
 * @hospital ARC Fertility (ID: 2)
 * @route /dashboard
 * @owner arc-team@company.com
 * @created 2024-01-15
 * @lastReviewed 2024-06-01
 * @baseComponent pages/Dashboard
 *
 * Custom Dashboard for ARC Fertility Hospital.
 * This component replaces the default Dashboard for users
 * belonging to ARC Fertility (hospital_id = 2).
 *
 * FEATURES:
 * - Custom KPI widgets specific to ARC requirements
 * - ARC-branded header and styling
 * - Temperature monitoring widget
 * - Custom data visualization layout
 *
 * CHANGELOG:
 * - 2024-06-01: Updated to match base Dashboard v2.3
 * - 2024-03-15: Added temperature monitoring widget
 * - 2024-01-15: Initial creation
 */

import React from 'react';

/**
 * ARC Fertility custom dashboard component.
 *
 * This is an example of how to create a hospital-specific variant.
 * The component will be automatically discovered by the registry
 * based on its file location (hospital-2/Dashboard.tsx).
 *
 * The component key will be: DashboardHospital2
 */
const DashboardARC: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* ARC-specific header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-900">
          ARC Fertility Dashboard
        </h1>
        <p className="text-gray-600 mt-1">
          Custom dashboard for ARC Fertility Hospital
        </p>
      </header>

      {/* Custom KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Active Tanks"
          value="12"
          change="+2"
          changeType="positive"
        />
        <KPICard
          title="Temperature Alerts"
          value="3"
          change="-1"
          changeType="positive"
        />
        <KPICard
          title="Pending Shipments"
          value="8"
          change="+3"
          changeType="neutral"
        />
        <KPICard
          title="Compliance Score"
          value="98%"
          change="+2%"
          changeType="positive"
        />
      </div>

      {/* ARC-specific Temperature Monitoring Widget */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Temperature Monitoring (ARC Custom)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TemperatureWidget tankId="TANK-001" temp={-196.2} status="normal" />
          <TemperatureWidget tankId="TANK-002" temp={-195.8} status="normal" />
          <TemperatureWidget tankId="TANK-003" temp={-194.1} status="warning" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Recent Activity
          </h2>
          <div className="space-y-3">
            <ActivityItem
              action="Tank refilled"
              target="TANK-001"
              time="2 hours ago"
            />
            <ActivityItem
              action="Alert acknowledged"
              target="TANK-003"
              time="4 hours ago"
            />
            <ActivityItem
              action="Shipment completed"
              target="SHP-2024-001"
              time="Yesterday"
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickActionButton label="View All Tanks" icon="🗄️" />
            <QuickActionButton label="Create Shipment" icon="📦" />
            <QuickActionButton label="View Alerts" icon="🔔" />
            <QuickActionButton label="Generate Report" icon="📊" />
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-6 text-center text-sm text-gray-500">
        This is a custom dashboard variant for ARC Fertility (Hospital ID: 2)
      </div>
    </div>
  );
};

// ============================================================
// Sub-components (can be extracted to separate files if needed)
// ============================================================

interface KPICardProps {
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
}

const KPICard: React.FC<KPICardProps> = ({ title, value, change, changeType }) => {
  const changeColors = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    neutral: 'text-gray-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-sm text-gray-600 mb-1">{title}</h3>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <span className={`text-sm ${changeColors[changeType]}`}>{change}</span>
      </div>
    </div>
  );
};

interface TemperatureWidgetProps {
  tankId: string;
  temp: number;
  status: 'normal' | 'warning' | 'critical';
}

const TemperatureWidget: React.FC<TemperatureWidgetProps> = ({
  tankId,
  temp,
  status,
}) => {
  const statusColors = {
    normal: 'bg-green-100 border-green-500 text-green-700',
    warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
    critical: 'bg-red-100 border-red-500 text-red-700',
  };

  return (
    <div className={`rounded-lg border-l-4 p-4 ${statusColors[status]}`}>
      <div className="font-medium">{tankId}</div>
      <div className="text-2xl font-bold">{temp}°C</div>
      <div className="text-sm capitalize">{status}</div>
    </div>
  );
};

interface ActivityItemProps {
  action: string;
  target: string;
  time: string;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ action, target, time }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
    <div>
      <span className="text-gray-800">{action}</span>
      <span className="text-blue-600 ml-1">{target}</span>
    </div>
    <span className="text-sm text-gray-500">{time}</span>
  </div>
);

interface QuickActionButtonProps {
  label: string;
  icon: string;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({ label, icon }) => (
  <button className="flex items-center justify-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
    <span className="text-xl">{icon}</span>
    <span className="text-sm font-medium text-blue-900">{label}</span>
  </button>
);

export default DashboardARC;
