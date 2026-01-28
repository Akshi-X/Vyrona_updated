import type { IVFTreatment } from '../types/ivf.ts';

interface IVFOngoingTreatmentsProps {
  treatments: IVFTreatment[];
}

export function IVFOngoingTreatments({ treatments }: IVFOngoingTreatmentsProps) {
  return (
    <div className="rounded-2xl overflow-hidden h-[320px] flex flex-col">
      <div className="flex-1 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        <table className="min-w-max w-full">
            <thead className="sticky top-0 z-10">
             <tr className="bg-[#FDF4FF]">
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                HIS # (PK)
              </th>
               <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">
                Cryolock #
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
                Embryo Grading
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
            {treatments.length === 0 ? (
              <tr className="bg-white">
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500 text-xs">
                  No treatments found
                </td>
              </tr>
            ) : (
              treatments.map((treatment, index) => (
                <tr
                  key={index}
                  className="border-b border-[#F3E0FF] bg-white transition-colors  whitespace-nowrap"
                >
                  <td className="px-4 py-3 text-xs">{treatment.hisNumber || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.cryolockNum || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.canisterNum || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.tankId || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.caneId || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.gobletColor || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.cryolockColor || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.dateOfVitrification || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.embryoGrading || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.siteName || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.status || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
