import React from 'react';

export default function ComplianceCard() {
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-2">Compliance</h3>
      <div className="text-xs text-gray-500 mb-3">Document checklist</div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-gray-600 mb-1">Transport Route</div>
          <div className="flex items-center gap-2">
            <span className="text-purple-700">Paris–Lille</span>
            <span className="text-green-600">✓</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-purple-700">Paris–Lille</span>
            <span className="text-red-600">2</span>
          </div>
        </div>
        <div>
          <div className="text-gray-600 mb-1">Needed</div>
          <div>8</div>
          <div>8</div>
        </div>
        <div>
          <div className="text-gray-600 mb-1">Missed</div>
          <div>2</div>
          <div>2</div>
        </div>
      </div>
    </div>
  );
}


