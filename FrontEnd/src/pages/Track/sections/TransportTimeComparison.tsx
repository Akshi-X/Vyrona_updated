import React from 'react';

export default function TransportTimeComparison() {
  const bars = [60, 90, 50, 70];
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-2">Transport Time Comparison</h3>
      <div className="flex items-end h-40 gap-4">
        {bars.map((h, i) => (
          <div key={i} className="flex-1">
            <div className="bg-purple-300 w-full" style={{ height: `${h}%` }}></div>
            <div className="text-center text-xs mt-1">Route {String.fromCharCode(65+i)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


