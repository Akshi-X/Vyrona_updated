import React from 'react';

export default function QualityParametersTable() {
  const rows = [
    { parameter: 'Temperature (°C)', current: '11.8°', status: 'Anomaly', acceptable: '2°C - 8°C' },
    { parameter: 'Temperature (°C)', current: '11.8°', status: 'Anomaly', acceptable: '2°C - 8°C' },
    { parameter: 'Temperature (°C)', current: '11.8°', status: 'Anomaly', acceptable: '2°C - 8°C' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-purple-50 text-purple-700">
          <tr>
            <th className="px-3 py-2 text-left">Parameter</th>
            <th className="px-3 py-2 text-left">Current Value</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Acceptable Range</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2">{r.parameter}</td>
              <td className="px-3 py-2 text-red-600 font-semibold">{r.current}</td>
              <td className="px-3 py-2">
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">{r.status}</span>
              </td>
              <td className="px-3 py-2 text-gray-600">{r.acceptable}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


