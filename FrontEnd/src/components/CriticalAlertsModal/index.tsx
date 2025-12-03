import React, { useState, useEffect, useRef } from 'react';
import AlertCard from '../AlertCard';
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';

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
  // Filter states
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Dropdown open states
  const [isPriorityFilterOpen, setIsPriorityFilterOpen] = useState(false);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  
  // Refs for dropdowns
  const priorityFilterRef = useRef<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);

  // Reset filters when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPriorityFilter('all');
      setStatusFilter('all');
      setIsPriorityFilterOpen(false);
      setIsStatusFilterOpen(false);
    }
  }, [isOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (priorityFilterRef.current && !priorityFilterRef.current.contains(event.target as Node)) {
        setIsPriorityFilterOpen(false);
      }
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setIsStatusFilterOpen(false);
      }
    };

    if (isPriorityFilterOpen || isStatusFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isPriorityFilterOpen, isStatusFilterOpen]);

  // Filter alerts
  const visibleAlerts = alerts.filter(alert => {
    // Apply priority filter (using severity field)
    if (priorityFilter !== 'all' && alert.severity !== priorityFilter) {
      return false;
    }
    // Apply status filter
    if (statusFilter !== 'all' && alert.status !== statusFilter) {
      return false;
    }
    return true;
  });

  // Get unique values for filters
  const priorities: ('Low' | 'Medium' | 'High' | 'Critical')[] = ['Low', 'Medium', 'High', 'Critical'];
  const statuses: ('Active' | 'Acknowledged' | 'Resolved' | 'Escalated')[] = ['Active', 'Acknowledged', 'Resolved', 'Escalated'];

  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title="Critical Alerts"
      description="Review critical alerts that require immediate attention"
      icon={
        <img
          src={CriticalAlertsIcon}
          alt="Critical Alerts"
          className="w-[24px] h-[24px]"
        />
      }
      loading={loading}
      loadingText="Loading alerts..."
      emptyText="No critical alerts found"
      dataLength={Math.max(visibleAlerts.length, 1)}
    >
      <table className="alert-card-table w-full">
        <thead className="bg-[#fdeeff]">
          <tr className="border-b border-[#eeeeee]">
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left">Patient ID</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left">Type</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left">Message</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left">Timestamp</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left">
              <div className="flex items-center gap-2">
                <span>Priority</span>
                <div className="relative" ref={priorityFilterRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPriorityFilterOpen(!isPriorityFilterOpen);
                    }}
                    className={`p-1 rounded hover:bg-purple-100 transition-colors ${
                      priorityFilter !== 'all' ? 'text-[#6b1176]' : 'text-gray-400'
                    }`}
                    title="Filter by priority"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </button>
                  {isPriorityFilterOpen && (
                    <div className="absolute left-0 top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] overflow-hidden">
                      <button
                        onClick={() => {
                          setPriorityFilter('all');
                          setIsPriorityFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                          priorityFilter === 'all' ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                        }`}
                      >
                        All
                      </button>
                      {priorities.map((priority) => (
                        <button
                          key={priority}
                          onClick={() => {
                            setPriorityFilter(priority);
                            setIsPriorityFilterOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                            priorityFilter === priority ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                          }`}
                        >
                          {priority}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left">
              <div className="flex items-center gap-2">
                <span>Status</span>
                <div className="relative" ref={statusFilterRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsStatusFilterOpen(!isStatusFilterOpen);
                    }}
                    className={`p-1 rounded hover:bg-purple-100 transition-colors ${
                      statusFilter !== 'all' ? 'text-[#6b1176]' : 'text-gray-400'
                    }`}
                    title="Filter by status"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </button>
                  {isStatusFilterOpen && (
                    <div className="absolute left-0 top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] overflow-hidden">
                      <button
                        onClick={() => {
                          setStatusFilter('all');
                          setIsStatusFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                          statusFilter === 'all' ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                        }`}
                      >
                        All
                      </button>
                      {statuses.map((status) => (
                        <button
                          key={status}
                          onClick={() => {
                            setStatusFilter(status);
                            setIsStatusFilterOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                            statusFilter === status ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleAlerts.length === 0 && (
            <tr>
              <td colSpan={6} className="bg-white p-[15px] text-center text-gray-500 text-sm">
                No alerts match the current filters
              </td>
            </tr>
          )}
          {visibleAlerts.map((alert) => (
            <tr key={alert.id} className="border-b border-[#eeeeee] hover:bg-white/50">
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm font-mono truncate">
                {alert.patientId}
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm truncate">
                {alert.type}
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <div className="truncate" title={alert.message}>{alert.message}</div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm truncate">
                {alert.timestamp}
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  alert.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                  alert.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                  alert.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {alert.severity}
                </span>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
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
