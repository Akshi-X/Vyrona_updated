import React from 'react';

export default function RiskPanel() {
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-4">Risk</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs text-gray-600 mb-2">Phase Risk Prediction</div>
          <svg viewBox="0 0 200 80" className="w-full h-20">
            <polyline fill="none" stroke="#9c3aa6" strokeWidth="2" points="0,60 20,50 40,55 60,45 80,50 100,40 120,55 140,35 160,45 180,30 200,40" />
          </svg>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-600 mb-2">Lane Historic Data (RCA)</div>
          <svg viewBox="0 0 120 120" className="w-28 h-28 mx-auto">
            <polygon points="60,10 100,40 80,100 40,100 20,40" fill="rgba(156,58,166,0.15)" stroke="#9c3aa6" />
          </svg>
        </div>
      </div>
    </div>
  );
}


