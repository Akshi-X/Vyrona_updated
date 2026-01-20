import { useState } from 'react';

interface IVFTreatment {
  hisNumber: string;
  cryolockNum: string;
  canisterNum: number;
  tankId: string;
  caneId: string;
  gobletColor: string;
  cryolockColor: string;
  dateOfVitrification: string;
  siteName: string;
  status: string;
}

interface IVFOngoingTreatmentsProps {
  treatments: IVFTreatment[];
}

export function IVFOngoingTreatments({ treatments }: IVFOngoingTreatmentsProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(treatments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTreatments = treatments.slice(startIndex, endIndex);

  return (
    <div className=" rounded-2xl overflow-hidden">
      <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        <table className="w-full">
            <thead>
             <tr className="bg-[#FDF4FF]">
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                HIS Number (PK)
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Cryolock Num
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Canister #
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Tank ID
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Cane ID
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Goblet Color
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Cryolock Color
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Date of Vitrification
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Site Name
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {currentTreatments.length === 0 ? (
              <tr className="bg-white">
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500 text-xs">
                  No treatments found
                </td>
              </tr>
            ) : (
              currentTreatments.map((treatment, index) => (
                <tr
                  key={index}
                  className="border-b border-[#F3E0FF] bg-white transition-colors  whitespace-nowrap"
                >
                  <td className="px-4 py-3 text-xs">{treatment.hisNumber}</td>
                  <td className="px-4 py-3 text-xs">{treatment.cryolockNum}</td>
                  <td className="px-4 py-3 text-xs">{treatment.canisterNum}</td>
                  <td className="px-4 py-3 text-xs">{treatment.tankId}</td>
                  <td className="px-4 py-3 text-xs">{treatment.caneId}</td>
                  <td className="px-4 py-3 text-xs">{treatment.gobletColor}</td>
                  <td className="px-4 py-3 text-xs">{treatment.cryolockColor}</td>
                  <td className="px-4 py-3 text-xs">{treatment.dateOfVitrification}</td>
                  <td className="px-4 py-3 text-xs">{treatment.siteName}</td>
                  <td className="px-4 py-3 text-xs">{treatment.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-[#E7E1E1] flex items-center justify-between">
          <div className="text-xs text-gray-600">
            Showing {startIndex + 1} to {Math.min(endIndex, treatments.length)} of {treatments.length} treatments
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-xs border border-[#E7E1E1] rounded hover:bg-[#F9F9F9] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-xs border border-[#E7E1E1] rounded hover:bg-[#F9F9F9] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
