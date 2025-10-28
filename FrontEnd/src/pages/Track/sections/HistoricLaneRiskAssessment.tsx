import React from 'react';

export default function HistoricLaneRiskAssessment() {
  const rows = ['A','B','C','D','E'].map((route) => ({
    route,
    quality: 'Temperature deviations (2.1% frequency)',
    returns: 'EU clearance: 12-16 hrs avg',
    loss: '0.3% lost shipments',
    reliability: 'DHL: 2.1% SLA breach',
    weather: 'Storm delays: 4 even',
  }));

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-2">Historic Lane Risk Assessment</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-purple-50 text-purple-700">
            <tr>
              <th className="px-3 py-2 text-left">Route</th>
              <th className="px-3 py-2 text-left">Quality Deviations</th>
              <th className="px-3 py-2 text-left">Returns & Regulatory</th>
              <th className="px-3 py-2 text-left">Loss/Physical Damage</th>
              <th className="px-3 py-2 text-left">3PL Reliability</th>
              <th className="px-3 py-2 text-left">Weather</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.route} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{r.route}</td>
                <td className="px-3 py-2">{r.quality}</td>
                <td className="px-3 py-2">{r.returns}</td>
                <td className="px-3 py-2">{r.loss}</td>
                <td className="px-3 py-2">{r.reliability}</td>
                <td className="px-3 py-2">{r.weather}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


