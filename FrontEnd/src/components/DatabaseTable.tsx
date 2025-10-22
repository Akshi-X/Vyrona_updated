import { useState } from 'react';

interface Patient {
  id: string;
  name: string;
  age: number;
  condition: string;
  treatment: string;
  status: string;
}

interface DatabaseTableProps {
  patients: Patient[];
}

export const DatabaseTable = ({ patients }: DatabaseTableProps) => {
  const [sortField, setSortField] = useState<keyof Patient>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'monitoring':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const SortIcon = ({ field }: { field: keyof Patient }) => {
    if (sortField !== field) {
      return <span className="text-gray-400">↕</span>;
    }
    return sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

  return (
    <div className="bg-white rounded-lg border border-[#E7E1E1] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('id')}
              >
                <div className="flex items-center gap-2">
                  Patient ID
                  <SortIcon field="id" />
                </div>
              </th>
              <th 
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th 
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('age')}
              >
                <div className="flex items-center gap-2">
                  Age
                  <SortIcon field="age" />
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
                onClick={() => handleSort('treatment')}
              >
                <div className="flex items-center gap-2">
                  Treatment
                  <SortIcon field="treatment" />
                </div>
              </th>
              <th 
                className="px-6 py-4 text-left text-xs font-semibold text-[#6b1176] uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-2">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedPatients.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {patient.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {patient.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {patient.age}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {patient.condition}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {patient.treatment}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(patient.status)}`}>
                    {patient.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
