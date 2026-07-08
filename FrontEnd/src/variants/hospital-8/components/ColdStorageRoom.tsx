interface ColdStorageRoomProps {
  selectedSensorId?: string | null;
  onSensorSelect?: (sensorId: string) => void;
  refrigeratorCode?: string;
  branchName?: string;
  zoneCount?: number;
  zones?: { zone_id: string; zone_name: string }[];
}

export default function ColdStorageRoom({ refrigeratorCode, branchName, zoneCount, zones }: ColdStorageRoomProps) {
  const zone1 = zones?.find(z => z.zone_id === 'zone_1');
  const zone2 = zones?.find(z => z.zone_id === 'zone_2');
  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      <img
        src="/cold_storage.png"
        alt="Cold storage room"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="absolute left-8 top-[18%] w-[180px] h-[200px]" style={{ pointerEvents: 'none' }}>
        <object
          data="/flipped.svg"
          type="image/svg+xml"
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>
      {zone1 && (
        <div className="absolute left-8 top-[12%]" style={{ pointerEvents: 'none' }}>
          <span className="inline-block px-2.5 py-1 bg-white/25 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-white">{zone1.zone_name}</span>
        </div>
      )}

      <div className="absolute right-8 top-[18%] w-[180px] h-[200px]" style={{ pointerEvents: 'none' }}>
        <object
          data="/wave-rays.svg"
          type="image/svg+xml"
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>
      {zone2 && (
        <div className="absolute right-8 top-[12%]" style={{ pointerEvents: 'none' }}>
          <span className="inline-block px-2.5 py-1 bg-white/25 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-white">{zone2.zone_name}</span>
        </div>
      )}

      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none" style={{ zIndex: 2 }}>
        <div className="flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-xl border border-white/70 shadow-sm px-3 py-2">
          <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-bold text-gray-700">Connected Live</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl border border-white/60 shadow-md px-3 py-2.5 pointer-events-auto z-10">
        <div className="text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#5f3b73' }}>
          Room Overview
        </div>
        <div className="flex flex-col gap-1 text-[9px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Room ID</span>
            <span className="font-bold text-gray-800">{refrigeratorCode}{branchName ? ` - ${branchName}` : ''}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Type</span>
            <span className="font-bold text-gray-800">Refrigerated Room</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Zones</span>
            <span className="font-bold text-gray-800">{zoneCount || 0} Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
