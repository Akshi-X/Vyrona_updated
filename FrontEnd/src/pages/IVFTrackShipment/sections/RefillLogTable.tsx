import { useEffect, useState } from 'react';
import { ivfService } from '../../../services/ivfService';
import type { RefillLogItem } from '../../../services/ivfService';


interface RefillLogTableProps {
  canisterNumber?: string | number;
}

export default function RefillLogTable({ canisterNumber }: RefillLogTableProps) {
  const [rows, setRows] = useState<RefillLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canisterNumber) {
      setRows([]);
      setError('Canister number is required');
      return;
    }

    let cancelled = false;
    const fetchRows = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await ivfService.getCanisterRefillLogs(canisterNumber);
        if (!cancelled) setRows(response?.refill_logs || []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message || 'Failed to load refill logs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRows();
    return () => {
      cancelled = true;
    };
  }, [canisterNumber]);

  return (
    <div id="onboarding-ivf-refill-log" className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[398px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-black text-[16px]">Refill Log</h3>
      </div>
      <div
        className="flex-1 overflow-auto bg-[#F8F8F8] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Refilled Date</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Refill Time</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Refilled By</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap h-[56px]">Description</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="text-black text-[14px] h-[56px] bg-white">
                  {[1, 2, 3, 4].map((col) => (
                    <td key={col} className="px-3 py-2 whitespace-nowrap">
                      <div className="relative overflow-hidden h-4 rounded-md bg-gray-200" style={{ width: `${[75, 55, 70, 90][col - 1]}px` }}>
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                          style={{ width: '50%', animationDelay: `${i * 0.08}s` }}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr className="text-black text-[14px] h-[56px] bg-white">
                <td className="px-3 py-2 text-red-600" colSpan={4}>
                  {error}
                </td>
              </tr>
            ) : (
              <>
                {rows.length === 0 ? (
                  <tr className="text-black text-[14px] bg-white">
                    <td className="px-3 py-2" colSpan={4}>
                      <div className="relative">
                        <div className="space-y-2">
                          {[
                            ['2026-02-14', '09:15:00', 'Nurse A', 'Routine check'],
                            ['2026-03-01', '11:45:00', 'Tech B', 'Top-up'],
                            ['2026-03-01', '11:45:00', 'Tech B', 'Top-up'],
                            ['2026-03-01', '11:45:00', 'Tech B', 'Top-up'],
                          ].map((cells, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-4 gap-3 items-center h-12 bg-white px-3 rounded blur-[1px] opacity-70"
                            >
                              {cells.map((cell, col) => (
                                <div key={col} className="text-[13px] text-gray-500 truncate">
                                  {cell}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-1.5 bg-white/80 text-gray-700 text-sm px-4 py-2 rounded shadow-sm text-center">
                            <svg
                              className="w-6 h-6 text-[#6B1176]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
                              />
                            </svg>
                            <span>No logs added yet.</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                  <tr key={row.log_id} className="text-black text-[14px] h-[56px] bg-white hover:bg-gray-50">
                    <td className="px-3 py-2 h-[56px]">{row.refill_date || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">{row.refill_time || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">{row.refilled_by || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">{row.description || '-'}</td>
                  </tr>
                  ))
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
