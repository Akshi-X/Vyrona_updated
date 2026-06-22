import type { RefrigeratorSensorTile } from './useRefrigeratorKpiSnapshot';

interface ColdStorageRoomProps {
  sensorTiles?: RefrigeratorSensorTile[];
  selectedSensorId?: string | null;
  onSensorSelect?: (sensorId: string) => void;
}

export default function ColdStorageRoom({ sensorTiles = [], selectedSensorId, onSensorSelect }: ColdStorageRoomProps) {
  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      {/* Background image */}
      <img
        src="/cold_storage.png"
        alt="Cold storage room"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Left SVG waves (flipped) */}
      <div className="absolute left-8 top-[18%] w-[180px] h-[200px]" style={{ pointerEvents: 'none' }}>
        <object
          data="/flipped.svg"
          type="image/svg+xml"
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>

      {/* Right SVG waves (normal) */}
      <div className="absolute right-8 top-[18%] w-[180px] h-[200px]" style={{ pointerEvents: 'none' }}>
        <object
          data="/wave-rays.svg"
          type="image/svg+xml"
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>

      {/* Bottom-left: Room Overview */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl border border-white/60 shadow-md px-3 py-2.5 pointer-events-auto z-10">
        <div className="text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#5f3b73' }}>
          Room Overview
        </div>
        <div className="flex flex-col gap-1 text-[9px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Room ID</span>
            <span className="font-bold text-gray-800">R1-COLD-01</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Type</span>
            <span className="font-bold text-gray-800">Refrigerated Room</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Capacity</span>
            <span className="font-bold text-gray-800">Medium</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Sensors</span>
            <span className="font-bold text-gray-800">2 Active</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Last Updated</span>
            <span className="font-bold text-gray-800">Just now</span>
          </div>
        </div>
      </div>

      {/* Bottom-right: Sensor Status */}
      <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-xl border border-white/60 shadow-md px-3 py-2.5 pointer-events-auto z-10">
        <div className="text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#5f3b73' }}>
          Sensor Status
        </div>
        <div className="flex flex-col gap-2">
          {sensorTiles.map((tile) => {
            const isActive = !tile.isMissing;
            return (
              <div
                key={tile.id}
                onClick={() => onSensorSelect?.(tile.id)}
                className={`cursor-pointer rounded-lg px-2 py-1.5 border transition-all ${
                  selectedSensorId === tile.id
                    ? 'bg-primary/10 border-primary'
                    : 'bg-gray-50 border-gray-100 hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold text-gray-800">{tile.label}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[8px] text-gray-500">Value</span>
                  <span className="text-[8px] font-bold text-gray-700">{tile.value}</span>
                </div>
                <div className="text-[7px] text-gray-400 mt-0.5">Signal: {isActive ? 'Strong ✓' : 'Lost'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
