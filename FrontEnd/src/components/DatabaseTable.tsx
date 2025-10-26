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

  const sortedPatients = [...patients].sort((a, b) => {
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

  const SortIcon = ({ field }: { field: keyof Patient }) => {
    if (sortField !== field) {
      return <span className="text-gray-400">↕</span>;
    }
    return sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

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
      <div className="overflow-x-auto">
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
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('stage')}
              >
                <div className="flex items-center gap-2">
                  Stage
                  <SortIcon field="stage" />
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
            {sortedPatients.map((patient) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
