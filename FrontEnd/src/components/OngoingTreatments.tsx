import { useState, useEffect } from 'react';
import { patientService, type OngoingTreatment } from '../services/patientService';

interface OngoingTreatmentsProps {
  // No props needed since we don't send pharma_id
}

const tableHeaders = [
  { label: "Patient ID", hasSort: false },
  { label: "Condition", hasSort: false },
  { label: "Hospital", hasSort: false },
  { label: "Stage", hasSort: false },
  { label: "Location", hasSort: true },
];

export const OngoingTreatments = ({}: OngoingTreatmentsProps) => {
  const [treatments, setTreatments] = useState<OngoingTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-[#eeeeee]">
              {tableHeaders.map((header, index) => (
                <th
                  key={index}
                  className="bg-white p-[15px] font-semibold text-[#6b1176] text-sm text-left"
                >
                  <div className="flex items-center gap-2">
                    <span>{header.label}</span>
                    {header.hasSort && (
                      <svg className="w-4 h-4 text-[#6b1176]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
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
              treatments.map((treatment) => (
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
                    {treatment.stage}
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
