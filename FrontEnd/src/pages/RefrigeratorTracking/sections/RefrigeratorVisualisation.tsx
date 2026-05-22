import type { ReactNode } from 'react';
import { Snowflake, Thermometer } from 'lucide-react';
import type { ActivityLogRecord } from '../../../services/activityLogService';
import type { RefrigeratorSensorTile } from './useRefrigeratorKpiSnapshot';

/**
 * Visual contract for the Refrigerator 3D viewer. The actual Three.js scene
 * (procedural geometry mirroring cryocan/incubator) is delegated to a
 * dedicated 3D-build agent. This file provides the layout shell (left KPI
 * tiles, center placeholder, right activity feed) plus the prop interface the
 * delegated agent must implement against.
 */

export type RefrigeratorZone = 'freezer' | 'fridge';

export type RefrigeratorVisualisationProps = {
  // Left KPI tiles (always two: freezer + refrigerator temp)
  sensorTiles?: RefrigeratorSensorTile[];
  selectedSensorId?: string | null;
  onSensorSelect?: (sensorId: string) => void;

  // Center 3D — selectable zones
  selectedZone?: RefrigeratorZone | null;
  onZoneSelect?: (zone: RefrigeratorZone) => void;
  freezerTemp?: number | null;
  fridgeTemp?: number | null;
  freezerTempAlert?: boolean;
  fridgeTempAlert?: boolean;
  doorStatus?: 'open' | 'closed';

  // Right activity feed
  systemActivity?: ActivityLogRecord[];

  // Header metadata
  refrigeratorCode?: string;
  refrigeratorId?: number;
  branchName?: string;
};

const ZONE_ICON: Record<RefrigeratorZone, ReactNode> = {
  freezer: <Snowflake size={18} className="text-sky-500" />,
  fridge: <Thermometer size={18} className="text-emerald-500" />,
};

const ZONE_LABEL: Record<RefrigeratorZone, string> = {
  freezer: 'Freezer',
  fridge: 'Refrigerator',
};

export default function RefrigeratorVisualisation({
  sensorTiles = [],
  selectedSensorId,
  onSensorSelect,
  selectedZone,
  onZoneSelect,
  freezerTemp,
  fridgeTemp,
  freezerTempAlert,
  fridgeTempAlert,
  systemActivity = [],
  refrigeratorCode,
}: RefrigeratorVisualisationProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-4">
      <aside className="flex flex-col gap-3">
        {sensorTiles.map((tile) => {
          const isSelected = selectedSensorId === tile.id;
          const isAlert =
            (tile.id === 'freezer_temperature' && freezerTempAlert) ||
            (tile.id === 'refrigerator_temperature' && fridgeTempAlert);
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => onSensorSelect?.(tile.id)}
              className={[
                'text-left rounded-xl border px-4 py-3 transition',
                isSelected ? 'border-primary bg-primary/5' : 'border-line bg-surface hover:bg-primary/3',
                isAlert ? 'ring-1 ring-red-300' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                  {tile.label}
                </span>
                {tile.id === 'freezer_temperature' ? (
                  <Snowflake size={14} className="text-sky-500" />
                ) : (
                  <Thermometer size={14} className="text-emerald-500" />
                )}
              </div>
              <div className="mt-1 text-2xl font-black text-gray-900">{tile.value}</div>
              <div className="text-xs text-gray-500">{tile.timestamp ?? '—'}</div>
            </button>
          );
        })}
      </aside>

      <section
        data-refrigerator-3d-mount
        className="relative min-h-[520px] rounded-2xl border border-line bg-linear-to-br from-white to-gray-50 overflow-hidden"
        aria-label="Refrigerator 3D visualisation"
      >
        {/* 3D scene mounts here. See RefrigeratorVisualisationProps for the
            contract the delegated 3D agent must implement against. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-gray-500">
          <div className="text-sm font-semibold tracking-wide uppercase text-gray-400">
            {refrigeratorCode ? `${refrigeratorCode} ` : ''}3D Viewer
          </div>
          <div className="flex flex-col gap-2 w-full max-w-[320px]">
            {(['freezer', 'fridge'] as RefrigeratorZone[]).map((zone) => {
              const isSelected = selectedZone === zone;
              const temp = zone === 'freezer' ? freezerTemp : fridgeTemp;
              const isAlert = zone === 'freezer' ? freezerTempAlert : fridgeTempAlert;
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => onZoneSelect?.(zone)}
                  className={[
                    'w-full rounded-xl border px-4 py-6 flex items-center justify-between transition',
                    isSelected ? 'border-primary bg-primary/10' : 'border-line bg-white hover:border-primary/40',
                    isAlert ? 'ring-1 ring-red-300' : '',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-3 font-semibold text-gray-700">
                    {ZONE_ICON[zone]}
                    {ZONE_LABEL[zone]}
                  </span>
                  <span className="text-lg font-black text-gray-900">
                    {temp != null ? `${temp.toFixed(1)}°C` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-center text-gray-400 max-w-xs">
            Awaiting 3D refrigerator scene. The procedural Three.js geometry
            (two stacked compartments, hinged door, click-to-select zones) will
            be added by a follow-up agent against the props on this component.
          </p>
        </div>
      </section>

      <aside className="rounded-2xl border border-line bg-surface px-4 py-3 flex flex-col min-h-[520px]">
        <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase">System Activity</h3>
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
          {systemActivity.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No recent activity.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {systemActivity.map((record) => (
                <li key={record.id} className="rounded-lg border border-line bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-gray-800">{record.action}</div>
                  <div className="text-[11px] text-gray-500">{record.created_at}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
