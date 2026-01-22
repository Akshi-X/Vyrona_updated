import { useEffect, useState } from 'react';
import { ivfService } from '../../../services/ivfService';
import type { IVFTreatment } from '../../../types/ivf.ts';

export default function ContainerDataTable() {
  const [rows, setRows] = useState<IVFTreatment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRows = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await ivfService.getEmbryoTracking();
        if (!cancelled) setRows(response?.data || []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message || 'Failed to load container data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRows();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[805px] flex flex-col">
      <h3 className="font-semibold text-black text-[16px] mb-4">Container Data</h3>
      <div
        className="flex-1 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px] whitespace-nowrap">HIS Number (PK)</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock Num</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Canister #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Tank ID</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cane ID</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Goblet Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Date of Vitrification</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Embryo Grading</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Site Name</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-gray-500" colSpan={11}>
                  Loading...
                </td>
              </tr>
            ) : error ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-red-600" colSpan={11}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-gray-500" colSpan={11}>
                  No container data found
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="text-black text-[14px] h-[56px] hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">{row.hisNumber || '-'} </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.cryolockNum || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.canisterNum || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.tankId || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.caneId || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.gobletColor || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.cryolockColor || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.dateOfVitrification || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.embryoGrading || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.siteName || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.status || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
