import { useState, useEffect, useRef } from 'react';
import { patientService, type Patient } from '../services/patientService';

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
    // First, filter by stage if needed
    let filtered = patients;
    if (stageFilter !== 'all') {
      filtered = patients.filter(p => p.stage === stageFilter);
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
  const allStages = [ 'Scheduled', 'Apheresis','Cryopreservation', 'Transportation', 'Reengineering', 'Reinfusion', 'AfterCare', 'Failure'];

  const getStageColor = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'scheduled':
      case 'apheresis':
      case 'cryopreservation':
      case 'transportation':
      case 'reengineering':
      case 'reinfusion':
        return 'bg-green-100 text-green-800';
      case 'aftercare':
      case 'after care':
        return 'bg-blue-100 text-blue-800';
      case 'failure':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
      <div className="h-[565px] overflow-y-auto overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#fdeeff]">
            <tr>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('patient_id')}
              >
                <div className="flex items-center gap-2">
                  Patient ID
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
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('location')}
              >
                <div className="flex items-center gap-2">
                  Manufacturing Location
                  <SortIcon field="location" />
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider"
              >
                <div className="flex items-center gap-2 relative" ref={dropdownRef}>
                  <span>Stage</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                      className={`text-xs p-1.5 text-[#6b1176] hover:bg-gray-50 transition-all duration-200 ${
                        stageFilter !== 'all' ? 'text-[#6b1176]' : ''
                      }`}
                      title={stageFilter === 'all' ? 'All Stages' : `Filtered: ${stageFilter}`}
                    >
                      <svg 
                        className="w-4 h-4"
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </button>
                    
                    {isDropdownOpen && (
                      <div className="absolute top-full mt-1 left-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[150px] overflow-hidden">
                        {['all', ...allStages].map((stage) => (
                          <button
                            key={stage}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStageFilter(stage);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                              stageFilter === stage
                                ? 'bg-[#6b1176] text-white'
                                : 'text-[#6b1176] hover:bg-gray-100'
                            }`}
                          >
                            {stage === 'all' ? 'All Stages' : stage}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </th>
              <th
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  Document
                </div>
              </th>
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
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {patient.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStageColor(patient.stage)}`}>
                      {patient.stage}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
