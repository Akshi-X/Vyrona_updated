import React from 'react';

export default function NonComplianceCard() {
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[270px] w-[200px]">
      <h3 className="font-bold text-black text-[14px] mb-3">Non-Compliance</h3>
      <div className="flex items-center gap-4">
        <div className="relative">
          <svg viewBox="0 0 120 120" className="w-28 h-28">
            <circle cx="60" cy="60" r="50" fill="#fff" stroke="#eee" strokeWidth="10" />
            <circle cx="60" cy="60" r="50" fill="transparent" stroke="#9c3aa6" strokeWidth="10" strokeDasharray="314" strokeDashoffset="(1-0.12)*314" />
            <text x="60" y="66" textAnchor="middle" className="fill-purple-700 text-[20px]">12%</text>
          </svg>
        </div>
      </div>
    </div>
  );
}


