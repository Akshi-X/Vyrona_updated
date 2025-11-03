import { useState } from 'react';
import ExtractIcon from '../../../assets/TrackAndTraceIcons/Extract.svg';

export default function QualityParametersTable() {
  const [showAnomalies, setShowAnomalies] = useState(false);

  const rows = [
    { parameter: 'Temperature (°C)', current: '11.8°c', status: 'Anomaly', acceptable: '2°C - 8°C' },
    { parameter: 'Temperature (°C)', current: '11.8°c', status: 'Anomaly', acceptable: '2°C - 8°C' },
    { parameter: 'Temperature (°C)', current: '11.8°c', status: 'Anomaly', acceptable: '2°C - 8°C' },
  ];

  return (
    <div className="rounded-[5px] border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900  text-[16px]">Quality Parameter</h3>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <span className="text-black text-[14px] font-medium">Anomalies</span>
            {/* Toggle */}
            <button
              type="button"
              aria-pressed={showAnomalies}
              onClick={() => setShowAnomalies((v) => !v)}
              className={`h-5 w-9 rounded-full transition-colors ${
                showAnomalies ? 'bg-purple-600' : 'bg-gray-300'
              } relative`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  showAnomalies ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-[6px] bg-[#EAB308] px-3 py-2 text-xs font-semibold h-[30px] text-white ">
            Quality Loss: 11.5%
          </span>
          <button
            type="button"
            aria-label="Download"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6B1176] text-white shadow hover:bg-purple-700"
          >
            <img src={ExtractIcon} alt="Download" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] h-[56px] sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-normal">Parameter</th>
              <th className="px-3 py-2 text-left font-normal">Current Value</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Acceptable Range</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 text-gray-800">{r.parameter}</td>
                <td className="px-3 py-2 font-semibold text-red-600">{r.current}</td>
                <td className="px-3 py-2 font-medium text-red-600">{r.status}</td>
                <td className="px-3 py-2 text-gray-600">{r.acceptable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


