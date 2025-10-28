import React from 'react';

export default function ThreePLTable() {
  const rows = [
    { name: 'DHL', mode: 'Air, Road', route: 'Paris–Lille', acceptable: '11:00 05/01/25' },
    { name: 'DHL', mode: 'Air, Road', route: 'Paris–Lille', acceptable: '11:00 05/01/25' },
    { name: 'DHL', mode: 'Air, Road', route: 'Paris–Lille', acceptable: '11:00 05/01/25' },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-purple-50 text-purple-700">
          <tr>
            <th className="px-3 py-2 text-left">3PL Player Name</th>
            <th className="px-3 py-2 text-left">Mode of Transport</th>
            <th className="px-3 py-2 text-left">Transport Route</th>
            <th className="px-3 py-2 text-left">Acceptable Range</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.mode}</td>
              <td className="px-3 py-2">{r.route}</td>
              <td className="px-3 py-2">{r.acceptable}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


