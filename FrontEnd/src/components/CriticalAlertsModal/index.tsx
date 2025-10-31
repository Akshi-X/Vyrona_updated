import React from 'react';
import AlertCard from '../AlertCard';

interface CriticalAlert {
  id: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  patientId: string;
  message: string;
  timestamp: string;
  status: 'Active' | 'Acknowledged' | 'Resolved' | 'Escalated';
}

interface CriticalAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: CriticalAlert[];
  loading?: boolean;
}

const CriticalAlertsModal: React.FC<CriticalAlertsModalProps> = ({
  isOpen,
  onClose,
  alerts,
  loading = false
}) => {
  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title="Critical Alerts"
      description="Review critical alerts that require immediate attention"
      icon={
        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      }
      loading={loading}
      loadingText="Loading alerts..."
      emptyText="No critical alerts found"
      dataLength={alerts.length}
    >
      <table className="w-full divide-y divide-gray-200">
        <thead className="bg-purple-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Patient ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Severity</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Message</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Timestamp</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {alerts.map((alert) => (
            <tr key={alert.id} className="hover:bg-gray-50">
              <td className="px-4 py-4 text-sm text-gray-900 font-mono truncate">
                {alert.patientId}
              </td>
              <td className="px-4 py-4 text-sm font-medium text-gray-900 truncate">
                {alert.type}
              </td>
              <td className="px-4 py-4">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  alert.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                  alert.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                  alert.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {alert.severity}
                </span>
              </td>
              <td className="px-4 py-4 text-sm text-gray-900">
                <div className="truncate" title={alert.message}>{alert.message}</div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-500 truncate">
                {alert.timestamp}
              </td>
              <td className="px-4 py-4">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  alert.status === 'Active' ? 'bg-red-100 text-red-800' :
                  alert.status === 'Acknowledged' ? 'bg-yellow-100 text-yellow-800' :
                  alert.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  {alert.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AlertCard>
  );
};

export default CriticalAlertsModal;
