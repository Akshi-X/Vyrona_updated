import { useState, useEffect, useRef, useMemo } from 'react';
import type { IVFTreatment } from '../types/ivf.ts';
import FilterLight from '../assets/FilterLight.svg';
import FilterDark from '../assets/FilterDark.svg';

interface IVFOngoingTreatmentsProps {
  treatments: IVFTreatment[];
}


interface TableHeader {
  label: string;
  hasFilter?: boolean;
  filterKey?: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status';
}

const tableHeaders: TableHeader[] = [
  { label: "HIS # (PK)" },
  { label: "Cryolock #" },
  { label: "Canister #" },
  { label: "Tank ID" },
  { label: "Cane ID" },
  { label: "Goblet Color", hasFilter: true, filterKey: 'gobletColor' },
  { label: "Cryolock Color", hasFilter: true, filterKey: 'cryolockColor' },
  { label: "Date of Vitrification" },
  { label: "Description" },
  { label: "Site Name", hasFilter: true, filterKey: 'siteName' },
  { label: "Status", hasFilter: true, filterKey: 'status' },
];

export function IVFOngoingTreatments({ treatments }: IVFOngoingTreatmentsProps) {
  const [gobletColorFilter, setGobletColorFilter] = useState<string>('all');
  const [cryolockColorFilter, setCryolockColorFilter] = useState<string>('all');
  const [siteNameFilter, setSiteNameFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  
  const gobletColorDropdownRef = useRef<HTMLDivElement>(null);
  const cryolockColorDropdownRef = useRef<HTMLDivElement>(null);
  const siteNameDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Extract unique values for filters
  const uniqueValues = useMemo(() => {
    const gobletColors = new Set<string>();
    const cryolockColors = new Set<string>();
    const siteNames = new Set<string>();
    const statuses = new Set<string>();

    treatments.forEach(treatment => {
      if (treatment.gobletColor) gobletColors.add(treatment.gobletColor);
      if (treatment.cryolockColor) cryolockColors.add(treatment.cryolockColor);
      if (treatment.siteName) siteNames.add(treatment.siteName);
      if (treatment.status) statuses.add(treatment.status);
    });

    return {
      gobletColors: Array.from(gobletColors).sort(),
      cryolockColors: Array.from(cryolockColors).sort(),
      siteNames: Array.from(siteNames).sort(),
      statuses: Array.from(statuses).sort(),
    };
  }, [treatments]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (!gobletColorDropdownRef.current || !gobletColorDropdownRef.current.contains(target)) &&
        (!cryolockColorDropdownRef.current || !cryolockColorDropdownRef.current.contains(target)) &&
        (!siteNameDropdownRef.current || !siteNameDropdownRef.current.contains(target)) &&
        (!statusDropdownRef.current || !statusDropdownRef.current.contains(target))
      ) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getFilteredTreatments = () => {
    return treatments.filter(treatment => {
      if (gobletColorFilter !== 'all' && treatment.gobletColor !== gobletColorFilter) {
        return false;
      }
      if (cryolockColorFilter !== 'all' && treatment.cryolockColor !== cryolockColorFilter) {
        return false;
      }
      if (siteNameFilter !== 'all' && treatment.siteName !== siteNameFilter) {
        return false;
      }
      if (statusFilter !== 'all' && treatment.status !== statusFilter) {
        return false;
      }
      return true;
    });
  };

  const filteredTreatments = getFilteredTreatments();

  const getFilterValue = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status') => {
    switch (filterKey) {
      case 'gobletColor': return gobletColorFilter;
      case 'cryolockColor': return cryolockColorFilter;
      case 'siteName': return siteNameFilter;
      case 'status': return statusFilter;
      default: return 'all';
    }
  };

  const setFilterValue = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status', value: string) => {
    switch (filterKey) {
      case 'gobletColor': setGobletColorFilter(value); break;
      case 'cryolockColor': setCryolockColorFilter(value); break;
      case 'siteName': setSiteNameFilter(value); break;
      case 'status': setStatusFilter(value); break;
    }
  };

  const getFilterOptions = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status') => {
    switch (filterKey) {
      case 'gobletColor': return uniqueValues.gobletColors;
      case 'cryolockColor': return uniqueValues.cryolockColors;
      case 'siteName': return uniqueValues.siteNames;
      case 'status': return uniqueValues.statuses;
      default: return [];
    }
  };

  const getDropdownRef = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status') => {
    switch (filterKey) {
      case 'gobletColor': return gobletColorDropdownRef;
      case 'cryolockColor': return cryolockColorDropdownRef;
      case 'siteName': return siteNameDropdownRef;
      case 'status': return statusDropdownRef;
      default: return null;
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden h-[320px] flex flex-col">
      <div className="flex-1 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        <table className="min-w-max w-full">
            <thead className="sticky top-0 z-10">
             <tr className="bg-[#FDF4FF]">
               {tableHeaders.map((header, index) => {
                 const filterKey = header.filterKey;
                 const currentFilterValue = filterKey ? getFilterValue(filterKey) : 'all';
                 const isDropdownOpen = openDropdown === filterKey;
                 const dropdownRef = filterKey ? getDropdownRef(filterKey) : null;
                 const filterOptions = filterKey ? getFilterOptions(filterKey) : [];

                 return (
                   <th
                     key={index}
                     className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap"
                   >
                     {header.hasFilter && filterKey ? (
                       <div className="flex items-center gap-2 relative" ref={dropdownRef}>
                         <span className="whitespace-nowrap">{header.label}</span>
                         <div className="relative">
                           <button
                             type="button"
                             onClick={(e) => {
                               e.stopPropagation();
                               setOpenDropdown(isDropdownOpen ? null : filterKey);
                             }}
                             className="text-xs p-1.5 transition-all duration-200 hover:opacity-80"
                             title={currentFilterValue === 'all' ? `All ${header.label}` : `Filtered: ${currentFilterValue}`}
                           >
                             <img 
                               src={currentFilterValue === 'all' ? FilterLight : FilterDark}
                               alt="Filter"
                               className="w-[14px] h-[14px]"
                             />
                           </button>
                           
                           {isDropdownOpen && (
                             <div className={`absolute top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg font-normal shadow-lg max-h-[200px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 ${
                               filterKey === 'status' ? 'right-0' : 'left-0'
                             } ${
                               filterKey === 'gobletColor' || filterKey === 'cryolockColor' ? 'w-[150px]' : 'w-[140px]'
                             }`}>
                               <button
                                 type="button"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setFilterValue(filterKey, 'all');
                                   setOpenDropdown(null);
                                 }}
                                 className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 flex items-center gap-2 ${
                                   currentFilterValue === 'all' ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                                 }`}
                               >
                                 All {header.label}
                               </button>
                               {filterOptions.map((option) => (
                                 <button
                                   key={option}
                                   type="button"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setFilterValue(filterKey, option);
                                     setOpenDropdown(null);
                                   }}
                                   className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 flex items-center gap-2 ${
                                     currentFilterValue === option ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                                   }`}
                                 >
                                   <span className="truncate">{option}</span>
                                 </button>
                               ))}
                             </div>
                           )}
                         </div>
                       </div>
                     ) : (
                       <span className="whitespace-nowrap">{header.label}</span>
                     )}
                   </th>
                 );
               })}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const hasData = treatments.length > 0;
              const hasFilteredData = filteredTreatments.length > 0;
              const isFiltered = gobletColorFilter !== 'all' || cryolockColorFilter !== 'all' || siteNameFilter !== 'all' || statusFilter !== 'all';

              if (!hasData) {
                return (
                  <tr className="bg-white">
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500 text-xs">
                      No treatments found
                    </td>
                  </tr>
                );
              }

              if (!hasFilteredData && isFiltered) {
                return (
                  <tr className="bg-white">
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500 text-xs">
                      No data found for the selected filters
                    </td>
                  </tr>
                );
              }

              return filteredTreatments.map((treatment, index) => (
                <tr
                  key={index}
                  className="border-b border-[#F3E0FF] bg-white transition-colors  whitespace-nowrap"
                >
                  <td className="px-4 py-3 text-xs">{treatment.hisNumber || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.cryolockNum || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.canisterNum || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.tankCode || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.caneCode || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.gobletColor || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.cryolockColor || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.dateOfVitrification || '-'}</td>
                  <td className="px-4 py-3 text-xs max-w-[200px]">
                    <div className="truncate" title={treatment.description || undefined}>
                      {treatment.description || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{treatment.siteName || '-'}</td>
                  <td className="px-4 py-3 text-xs">{treatment.status || '-'}</td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
