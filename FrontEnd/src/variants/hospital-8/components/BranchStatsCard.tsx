import React from 'react';
import { X, AlertCircle, Snowflake, MapPin } from 'lucide-react';
import type { BranchMetrics } from '../types/map';

interface BranchStatsCardProps {
  branch: BranchMetrics | null;
  onClose: () => void;
  position?: { x: number; y: number } | null;
}

const BranchStatsCard: React.FC<BranchStatsCardProps> = ({ branch, onClose, position }) => {
  if (!branch) return null;

  const statusColor = branch.active_alerts > 0 ? 'text-red-600' : 'text-emerald-600';
  const statusBg = branch.active_alerts > 0 ? 'bg-red-50' : 'bg-emerald-50';

  return (
    <div
      className="absolute bg-white rounded-lg border border-gray-200 p-3 z-50 w-64 -translate-x-1/2"
      style={
        position
          ? { left: `${position.x}px`, top: `${position.y - 160}px` }
          : { display: 'none' }
      }
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{branch.branch_name}</h3>
          <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
            <MapPin size={10} />
            {branch.district_name}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-gray-100 rounded-md transition-colors"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      <div
        className={`${statusBg} rounded-lg p-2 mb-2 flex items-center gap-2`}
      >
        <AlertCircle size={14} className={statusColor} />
        <span className={`text-xs font-semibold ${statusColor}`}>
          {branch.active_alerts > 0 ? `${branch.active_alerts} Alert${branch.active_alerts !== 1 ? 's' : ''}` : 'Healthy'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Snowflake size={12} className="text-primary" />
            <span className="text-[10px] font-semibold text-gray-500">Ref</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{branch.refrigerator_count}</div>
        </div>

        {branch.embryos_stored !== undefined && (
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-500 mb-1">Embryos Stored</div>
            <div className="text-2xl font-bold text-gray-900">
              {(branch.embryos_stored || 0).toLocaleString()}
            </div>
          </div>
        )}

        {branch.patients !== undefined && (
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-500 mb-1">Active Patients</div>
            <div className="text-2xl font-bold text-gray-900">
              {(branch.patients || 0).toLocaleString()}
            </div>
          </div>
        )}

        {branch.ln2_usage !== undefined && (
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-500 mb-1">LN2 Usage</div>
            <div className="text-2xl font-bold text-gray-900">{branch.ln2_usage}%</div>
          </div>
        )}
      </div>

    </div>
  );
};

export default BranchStatsCard;
