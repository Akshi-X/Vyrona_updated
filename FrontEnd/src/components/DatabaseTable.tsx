import { useState, useEffect, useRef } from 'react';
import { patientService, type Patient } from '../services/patientService';
import { ALL_STAGES, TREATMENT_STATUS_OPTIONS, getTreatmentStatusColor } from '../constants/stages';
import FilterLight from '../assets/FilterLight.svg';
import FilterDark from '../assets/FilterDark.svg';

interface DatabaseTableProps {
  pharmaId?: string;
}

export const DatabaseTable = ({ pharmaId = '1' }: DatabaseTableProps) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof Patient>('patient_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasFetchedRef = useRef(false);

  // Treatment status filter options (shared)
  const statusOptions = TREATMENT_STATUS_OPTIONS as readonly string[];

  // Fetch patients data on component mount
  useEffect(() => {
    // Prevent duplicate calls
    if (hasFetchedRef.current) {
      return;
    }

    hasFetchedRef.current = true;

    const fetchPatients = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await patientService.getDetailedPatients();

        setPatients(data);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch patients data');
        setLoading(false);
      }
    };

    fetchPatients();
  }, [pharmaId]);

  const handleSort = (field: keyof Patient) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedPatients = (() => {
    // First, filter by stage or treatment status if needed
    let filtered = patients;
    if (stageFilter !== 'all') {
      const normalizedFilter = stageFilter.toLowerCase();
      const isStatus = statusOptions.includes(normalizedFilter);
      if (isStatus) {
        filtered = patients.filter(p => {
          const status = (p.treatment_status || '').toLowerCase();
          if (normalizedFilter === 'after_care') {
            return status === 'after_care' || status === 'aftercare';
          }
          return status === normalizedFilter;
        });
      } else {
        filtered = patients.filter(p => (p.stage || '').toLowerCase() === normalizedFilter);
      }
    }

    // Then sort
    return [...filtered].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }

    return 0;
  });
  })();

  // All possible stage values
  const allStages = ALL_STAGES;

  const SortIcon = ({ field }: { field: keyof Patient }) => {
    if (sortField !== field) {
      return <span className="text-gray-400">↕</span>;
    }
    return sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

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

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#E7E1E1] overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6b1176]"></div>
          <span className="ml-3 text-gray-600">Loading patients data...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#E7E1E1] overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="text-red-500 text-lg font-semibold mb-2">Error Loading Data</div>
            <div className="text-gray-600 mb-4">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#6b1176] text-white rounded-md hover:bg-[#5a0f66] transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (patients.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E7E1E1] overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="text-gray-500 text-lg font-semibold mb-2">No Patients Found</div>
            <div className="text-gray-400">No patients data available for the selected pharma.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E7E1E1] overflow-hidden">
      <div className="h-[70vh] overflow-y-auto overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#fdeeff] z-10">
            <tr>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('patient_id')}
              >
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap">Patient ID</span>
                  <SortIcon field="patient_id" />
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('condition')}
              >
                <div className="flex items-center gap-2">
                  Condition
                  <SortIcon field="condition" />
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('provider_name')}
              >
                <div className="flex items-center gap-2">
                  3PL
                  <SortIcon field="provider_name" />
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('hospital')}
              >
                <div className="flex items-center gap-2">
                  Hospital
                  <SortIcon field="hospital" />
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider"
              >
                <div className="flex items-center gap-2 relative" ref={dropdownRef}>
                  <span className="whitespace-nowrap">Stage</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                      className={`text-xs p-1.5 rounded transition-all duration-200 ${
                        stageFilter !== 'all' 
                          ? ' text-white' 
                          : 'text-[#6b1176]'
                      }`}
                      title={stageFilter === 'all' ? 'All Stages' : `Filtered: ${stageFilter}`}
                    >
                      <img 
                        src={stageFilter === 'all' ? FilterLight : FilterDark}
                        alt="Filter"
                        className="w-[14px] h-[14px]"
                      />
                    </button>
                    
                    {isDropdownOpen && (
                      <div className="absolute top-full mt-1 left-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] font-normal overflow-hidden">
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
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('location')}
              >
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap">Manufacturing Location</span>
                  <SortIcon field="location" />
                </div>
              </th>
              {/* As per client requirement as for now the document column is commended */}
              {/* <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  Document
                </div>
              </th> */}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(() => {
              const hasData = patients.length > 0;
              const hasFilteredData = sortedPatients.length > 0;
              const isFiltered = stageFilter !== 'all';

              if (!hasData) {
                return (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No patients data available for the selected pharma.
                    </td>
                  </tr>
                );
              }

              if (!hasFilteredData && isFiltered) {
                return (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No data found for this filter
                    </td>
                  </tr>
                );
              }

              return sortedPatients.map((patient) => (
                <tr key={patient.patient_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {patient.patient_id}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {patient.condition}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {patient.provider_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {patient.hospital}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getTreatmentStatusColor(patient.treatment_status, patient.stage)}`}>
                      {patient.stage}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {patient.location}
                  </td>
                  {/* As per client requirement as for now the document column is commended */}
                  {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <button
                      className="text-[#6b1176] hover:text-[#5a0f66] font-medium underline"
                      onClick={() => {
                        if (!patient.docs_report) {
                          alert('No document available for download.');
                          return;
                        }
                        // Create a blob and download the PDF
                        const blob = new Blob([patient.docs_report], { type: 'application/pdf' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `patient_${patient.patient_id}_report.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                      }}
                    >
                      Download Doc
                    </button>
                  </td> */}
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};
