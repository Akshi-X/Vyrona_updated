import React from 'react';

export default function TrackAndTraceMap() {
  return (
    <div className="w-full h-48 rounded overflow-hidden border">
      {/* Placeholder image-style map; integrate real map later (Mapbox/Leaflet) */}
      <div className="w-full h-full bg-[url('/logo.svg')] bg-cover bg-center flex items-center justify-center text-gray-400">
        <span className="text-xs">Map placeholder</span>
      </div>
    </div>
  );
}


