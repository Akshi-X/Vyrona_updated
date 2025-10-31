import React from 'react';

export default function ThreePLTable() {
  const rows = [
    { name: 'DHL', mode: 'Air, Road', route: 'Paris–Lille', acceptable: '11:00 05/01/25' },
    { name: 'DHL', mode: 'Air, Road', route: 'Paris–Lille', acceptable: '11:00 05/01/25' },
    { name: 'DHL', mode: 'Air, Road', route: 'Paris–Lille', acceptable: '11:00 05/01/25' },
  ];

  return (
    <div className="rounded-[5px] border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900  text-[16px]">3PL</h3>
        </div>
      </div>
      <div className="overflow-x-auto h-[254px]">
        <table className="w-full text-xs">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] h-[56px] sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-normal">3PL Player Name</th>
              <th className="px-3 py-2 text-left font-normal">Mode of Transport</th>
              <th className="px-3 py-2 text-left font-normal">Transport Route</th>
              <th className="px-3 py-2 text-left font-normal">Acceptable Range</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.mode}</td>
                <td className="px-3 py-2">{r.route}</td>
                <td className="px-3 py-2">{r.acceptable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


