import { useState, useEffect, useRef } from 'react';
import { patientService, type OngoingTreatment } from '../services/patientService';
import { ALL_STAGES, TREATMENT_STATUS_OPTIONS, getTreatmentStatusColor } from '../constants/stages';
import FilterLight from '../assets/FilterLight.svg';
import FilterDark from '../assets/FilterDark.svg';

// Color helper imported from constants

interface OngoingTreatmentsProps {
  // No props needed since we don't send pharma_id
}

type SortField = 'patient_id' | 'condition' | 'hospital' | 'location' | 'provider_name';
type SortDirection = 'asc' | 'desc';

interface TableHeader {
  label: string;
  field: SortField | null;
  hasSort: boolean;
  hasFilter?: boolean;
}

const tableHeaders: TableHeader[] = [
  { label: "Patient ID", field: 'patient_id' as SortField, hasSort: true },
  { label: "Condition", field: 'condition' as SortField, hasSort: true },
  { label: "Hospital", field: 'hospital' as SortField, hasSort: true },
  { label: "Stage", field: null, hasSort: false, hasFilter: true },
  { label: "3PL", field: 'provider_name' as SortField, hasSort: true },
  { label: "Manufacturing Location", field: 'location' as SortField, hasSort: true },
];

export const OngoingTreatments = ({}: OngoingTreatmentsProps) => {
  const [treatments, setTreatments] = useState<OngoingTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Status filter options for treatment_status (shared)
  const statusOptions = TREATMENT_STATUS_OPTIONS as readonly string[];
  const allStages = ALL_STAGES;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedTreatments = () => {
    // First, filter by treatment status or stage if needed
    let filtered = treatments;
    if (stageFilter !== 'all') {
      const normalizedFilter = stageFilter.toLowerCase();
      const isStatus = statusOptions.includes(normalizedFilter);
      if (isStatus) {
        filtered = treatments.filter(t => {
          const status = (t.treatment_status || '').toLowerCase();
          // treat "after_care" and "aftercare" as the same
          if (normalizedFilter === 'after_care') {
            return status === 'after_care' || status === 'aftercare';
          }
          return status === normalizedFilter;
        });
      } else {
        // Stage filter - compare by string value
        filtered = treatments.filter(t => (t.stage || '').toLowerCase() === normalizedFilter);
      }
    }

    // Then sort if sort field is selected
    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      // Handle number comparison (for patient_id if it's numeric)
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // Fallback to string comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      const comparison = aStr.localeCompare(bStr);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  useEffect(() => {
    let isCancelled = false;
    
    const fetchOngoingTreatments = async () => {
      try {
        setLoading(true);
        setError(null);
         const data = await patientService.getOngoingTreatments();
        
        // Only update state if the component is still mounted
        if (!isCancelled) {
          setTreatments(data);
        }
      } catch (err) {
        
        // Only update state if the component is still mounted
        if (!isCancelled) {
          setError('Failed to load ongoing treatments');
          setTreatments([]);
        }
      } finally {
        // Only update loading state if the component is still mounted
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchOngoingTreatments();

    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isCancelled = true;
    };
   }, []); // No dependencies needed since we don't use pharmaId

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-white rounded-[10px] overflow-hidden border border-[#E7E1E1]">
        <div className="p-6 text-center">
          <div className="text-[#6b1176] text-sm">Loading ongoing treatments...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-[10px] overflow-hidden border border-[#E7E1E1]">
        <div className="p-6 text-center">
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-[10px] overflow-hidden border border-[#E7E1E1]">
      <div 
        className="h-[415px] overflow-y-auto"
        style={{
          scrollbarWidth: 'thin'
        }}
      >
        <table className="w-full">
          <thead className="sticky top-0 bg-[#fdeeff] z-10">
            <tr className="border-b border-[#eeeeee]">
              {tableHeaders.map((header, index) => (
                <th
                  key={index}
                  className={`p-[15px] font-semibold text-[#6b1176] text-sm text-left ${
                    header.hasSort ? 'cursor-pointer hover:bg-[#f0e6f0]' : ''
                  }`}
                  onClick={header.hasSort && header.field ? () => handleSort(header.field as SortField) : undefined}
                >
                  {header.hasFilter ? (
                    <div className="flex items-center gap-2 relative" ref={dropdownRef}>
                      <span className="whitespace-nowrap">{header.label}</span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsDropdownOpen(!isDropdownOpen);
                          }}
                          className="text-xs p-1.5 transition-all duration-200 hover:opacity-80"
                          title={stageFilter === 'all' ? 'All All Stages' : `Filtered: ${stageFilter}`}
                        >
                          <img 
                            src={stageFilter === 'all' ? FilterLight : FilterDark}
                            alt="Filter"
                            className="w-[14px] h-[14px]"
                          />
                        </button>
                        
                        {isDropdownOpen && (
                          <div className="absolute top-full mt-1 left-0 z-[9999] bg-white border border-gray-200 rounded-lg font-normal shadow-lg min-w-[180px] overflow-hidden">
                            {['all', ...allStages, ...statusOptions].map((item) => {
                              const isAll = item === 'all';
                              const isStatus = typeof item === 'string' && statusOptions.includes((item as string).toLowerCase());
                              const key = isAll ? 'all' : (item as string);
                              const value = isAll ? 'all' : (isStatus ? (item as string).toLowerCase() : (item as string));
                              const label = isAll
                                ? 'All Stages'
                                : isStatus
                                  ? ((item as string) === 'after_care' ? 'AfterCare' : (item as string).charAt(0).toUpperCase() + (item as string).slice(1))
                                  : (item as string);

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStageFilter(value);
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                    stageFilter === value ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap">{header.label}</span>
                      {header.hasSort && (
                        <div className="flex flex-col">
                          {sortField === header.field ? (
                            sortDirection === 'asc' ? (
                              <svg className="w-3 h-3 text-[#6b1176]" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 text-[#6b1176]" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            )
                          ) : (
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const filteredTreatments = getSortedTreatments();
              const hasData = treatments.length > 0;
              const hasFilteredData = filteredTreatments.length > 0;
              const isFiltered = stageFilter !== 'all';

              if (!hasData) {
                return (
                  <tr>
                    <td colSpan={tableHeaders.length} className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center">
                      No ongoing treatments found
                    </td>
                  </tr>
                );
              }

              if (!hasFilteredData && isFiltered) {
                return (
                  <tr>
                    <td colSpan={tableHeaders.length} className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center">
                      No data found for this filter
                    </td>
                  </tr>
                );
              }

              return filteredTreatments.map((treatment) => (
                <tr
                  key={treatment.patient_id}
                  className="border-b border-[#eeeeee] bg-white hover:bg-gray-50"
                >
                  <td className="p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.patient_id}
                  </td>
                  <td className="p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.condition}
                  </td>
                  <td className="p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.hospital}
                  </td>
                  <td className="p-[15px] font-normal text-[#333333] text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getTreatmentStatusColor(treatment.treatment_status, treatment.stage)}`}>
                      {treatment.stage || 'N/A'}
                    </span>
                  </td>
                  <td className="p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.provider_name}
                  </td>
                  <td className="p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.location}
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};
