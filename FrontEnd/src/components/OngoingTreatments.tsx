import { useState, useEffect } from 'react';
import { patientService, type OngoingTreatment } from '../services/patientService';

interface OngoingTreatmentsProps {
  // No props needed since we don't send pharma_id
}

type SortField = 'patient_id' | 'condition' | 'hospital' | 'stage' | 'location' | 'provider_name';
type SortDirection = 'asc' | 'desc';

const tableHeaders = [
  { label: "Patient ID", field: 'patient_id' as SortField, hasSort: true },
  { label: "Condition", field: 'condition' as SortField, hasSort: true },
  { label: "Hospital", field: 'hospital' as SortField, hasSort: true },
  { label: "Stage", field: 'stage' as SortField, hasSort: true },
  { label: "3PL", field: 'provider_name' as SortField, hasSort: true },
  { label: "Manufacturing Location", field: 'location' as SortField, hasSort: true },
];

export const OngoingTreatments = ({}: OngoingTreatmentsProps) => {
  const [treatments, setTreatments] = useState<OngoingTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const getStageColor = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'scheduled':
        return 'bg-green-100 text-green-800';
      case 'after care':
        return 'bg-blue-100 text-blue-800';
      case 'failure':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedTreatments = () => {
    if (!sortField) return treatments;

    return [...treatments].sort((a, b) => {
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
        className="max-h-[420px] overflow-y-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#af6eb7 transparent'
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
                  onClick={header.hasSort ? () => handleSort(header.field) : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span>{header.label}</span>
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
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {treatments.length === 0 ? (
              <tr>
                <td colSpan={tableHeaders.length} className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center">
                  No ongoing treatments found
                </td>
              </tr>
            ) : (
              getSortedTreatments().map((treatment) => (
                <tr
                  key={treatment.patient_id}
                  className="border-b border-[#eeeeee] hover:bg-white/50"
                >
                  <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.patient_id}
                  </td>
                  <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.condition}
                  </td>
                  <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.hospital}
                  </td>
                  <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStageColor(treatment.stage)}`}>
                      {treatment.stage}
                    </span>
                  </td>
                  <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.provider_name}
                  </td>
                  <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                    {treatment.location}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
