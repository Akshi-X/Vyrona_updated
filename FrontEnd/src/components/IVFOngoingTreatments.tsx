import { useState, useEffect, useRef } from 'react';
import type { IVFTreatment } from '../types/ivf.ts';
import FilterLight from '../assets/FilterLight.svg';
import FilterDark from '../assets/FilterDark.svg';

export interface EmbryoTrackingFilterOptions {
  site_names: string[];
  statuses: string[];
  goblet_colors: string[];
  crylock_colors: string[];
  total?: number;
  site_name_counts?: Record<string, number>;
  status_counts?: Record<string, number>;
  goblet_color_counts?: Record<string, number>;
  crylock_color_counts?: Record<string, number>;
}

export interface EmbryoTrackingFilterValues {
  siteName: string;
  status: string;
  gobletColor: string;
  cryolockColor: string;
}

export interface IVFOngoingTreatmentsProps {
  treatments: IVFTreatment[];
  hasMore?: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  filterOptions?: EmbryoTrackingFilterOptions;
  filterValues?: EmbryoTrackingFilterValues;
  onFilterChange?: (key: 'siteName' | 'status' | 'gobletColor' | 'cryolockColor', value: string) => void;
  /** Total matching current filters (for "filtered / total" display) */
  filteredTotal?: number | null;
  /** Total without filters (from filters API) */
  totalUnfiltered?: number;
  /** Called when user clicks "Clear filter" to reset all filters */
  onClearFilters?: () => void;
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
  { label: "Site Name", hasFilter: true, filterKey: 'siteName' },
  //{ label: "Status", hasFilter: true, filterKey: 'status' },
];

const defaultFilterOptions: EmbryoTrackingFilterOptions = {
  site_names: [],
  statuses: [],
  goblet_colors: [],
  crylock_colors: [],
};

const defaultFilterValues: EmbryoTrackingFilterValues = {
  siteName: 'all',
  status: 'all',
  gobletColor: 'all',
  cryolockColor: 'all',
};

export function IVFOngoingTreatments({
  treatments,
  hasMore = false,
  isLoading = false,
  isLoadingMore = false,
  onLoadMore,
  filterOptions = defaultFilterOptions,
  filterValues = defaultFilterValues,
  onFilterChange,
  filteredTotal = null,
  totalUnfiltered,
  onClearFilters,
}: IVFOngoingTreatmentsProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const hasActiveFilter =
    filterValues.siteName !== 'all' ||
    filterValues.status !== 'all' ||
    filterValues.gobletColor !== 'all' ||
    filterValues.cryolockColor !== 'all';

  const countLabel =
    hasActiveFilter && filteredTotal != null
      ? `Filtered Cryolock Count: ${filteredTotal}`
      : totalUnfiltered != null
        ? `Cryolock Count: ${totalUnfiltered}`
        : null;

  const gobletColorDropdownRef = useRef<HTMLDivElement>(null);
  const cryolockColorDropdownRef = useRef<HTMLDivElement>(null);
  const siteNameDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Handle infinite scroll
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !onLoadMore) return;

    const handleScroll = () => {
      // Don't load if already loading or no more data
      if (isLoadingMore || !hasMore) return;
      
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      // Load more when user scrolls within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        onLoadMore();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Filter values/options from props (backend-level filtering; no client-side filtering)
  const getFilterValue = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status') => {
    switch (filterKey) {
      case 'gobletColor': return filterValues.gobletColor;
      case 'cryolockColor': return filterValues.cryolockColor;
      case 'siteName': return filterValues.siteName;
      case 'status': return filterValues.status;
      default: return 'all';
    }
  };

  const setFilterValue = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status', value: string) => {
    onFilterChange?.(filterKey, value);
  };

  const getFilterOptions = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status') => {
    switch (filterKey) {
      case 'gobletColor': return filterOptions.goblet_colors ?? [];
      case 'cryolockColor': return filterOptions.crylock_colors ?? [];
      case 'siteName': return filterOptions.site_names ?? [];
      case 'status': return filterOptions.statuses ?? [];
      default: return [];
    }
  };

  const getFilterCount = (filterKey: 'gobletColor' | 'cryolockColor' | 'siteName' | 'status', option: string): number | null => {
    // "All" = count with current other filters applied (so it updates when e.g. Site is selected)
    if (option === 'all') return filterOptions.total ?? totalUnfiltered ?? null;
    switch (filterKey) {
      case 'gobletColor': return filterOptions.goblet_color_counts?.[option] ?? null;
      case 'cryolockColor': return filterOptions.crylock_color_counts?.[option] ?? null;
      case 'siteName': return filterOptions.site_name_counts?.[option] ?? null;
      case 'status': return filterOptions.status_counts?.[option] ?? null;
      default: return null;
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
    <div className="rounded-2xl w-full h-full flex flex-col">
      {countLabel != null && (
        <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
          <p className="text-xs text-gray-600">
            <span className="font-medium text-[#6B1176]">{countLabel}</span>
          </p>
          {hasActiveFilter && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-medium text-[#6B1176] hover:underline shrink-0"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
      {/* <div className='bg-black  text-white h-[320px] overflow-y-auto flex  '>sda
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        sd
        sd
        sd
        ssdasdsda
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        sd
        sd
        sd
        ssdassda
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        sd
        sd
        sd
        ssdassda
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        <br/>
        sd
        sd
        sd
        ssdas</div> */}
      <div
        ref={scrollContainerRef}
        className="h-[320px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
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
                         <div className="relative flex items-center gap-1">
                           <button
                             type="button"
                             onClick={(e) => {
                               e.stopPropagation();
                               setOpenDropdown(isDropdownOpen ? null : filterKey);
                             }}
                             className="text-xs p-1.5 transition-all duration-200 hover:opacity-80 flex items-center"
                             title={currentFilterValue === 'all' ? `All ${header.label}` : `Filtered: ${currentFilterValue}`}
                           >
                             <img 
                               src={currentFilterValue === 'all' ? FilterLight : FilterDark}
                               alt="Filter"
                               className="w-[14px] h-[14px] shrink-0"
                             />
                           </button>
                           
                           {isDropdownOpen && (
                             <div className={`absolute top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg font-normal shadow-lg max-h-[200px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 ${
                               filterKey === 'status' ? 'right-0' : 'left-0'
                             } 
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
                                 {getFilterCount(filterKey, 'all') != null && (
                                   <span className="ml-1 opacity-80">({getFilterCount(filterKey, 'all')})</span>
                                 )}
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
                                   {getFilterCount(filterKey, option) != null && (
                                     <span className="ml-1 opacity-80">({getFilterCount(filterKey, option)})</span>
                                   )}
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
              if (isLoading) {
                return (
                  <tr className="bg-white">
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500 text-xs">
                      Loading...
                    </td>
                  </tr>
                );
              }
              if (treatments.length === 0) {
                return (
                  <tr className="bg-white">
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500 text-xs">
                      No treatments found
                    </td>
                  </tr>
                );
              }
              return (
                <>
                  {treatments.map((treatment, index) => (
                    <tr
                      key={`${treatment.hisNumber}-${treatment.cryolockNum}-${index}`}
                      className="border-b border-[#F3E0FF] bg-white transition-colors  whitespace-nowrap"
                    >
                      <td className="px-4 py-3 text-xs">{treatment.hisNumber || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.cryolockNum?.split("/").pop() || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.canisterNum || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.tankCode || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.caneCode || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.gobletColor || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.cryolockColor || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.dateOfVitrification || '-'}</td>
                      <td className="px-4 py-3 text-xs">{treatment.siteName || '-'}</td>
                      {/* <td className="px-4 py-3 text-xs">{treatment.status || '-'}</td> */}
                    </tr>
                  ))}
                  {isLoadingMore && (
                    <tr className="bg-white">
                      <td colSpan={10} className="px-4 py-3 text-center text-gray-500 text-xs">
                        Loading more data...
                      </td>
                    </tr>
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
