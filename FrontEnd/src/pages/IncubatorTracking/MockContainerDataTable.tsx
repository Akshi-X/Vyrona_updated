
import type { IVFTreatment } from '../../types/ivf';

const mockRows: IVFTreatment[] = [
  {
    hisNumber: 'HIS001',
    cryolockNum: 'CL001',
    canisterNum: 1,
    tankCode: 'T40',
    caneCode: 'CANE-1',
    gobletColor: 'Blue',
    cryolockColor: 'Red',
    dateOfVitrification: '2024-03-01',
    siteName: 'Egmore',
    status: 'Stored',
    embryoGrading: '4AA',
    description: null,
  },
  {
    hisNumber: 'HIS002',
    cryolockNum: 'CL002',
    canisterNum: 1,
    tankCode: 'T40',
    caneCode: 'CANE-1',
    gobletColor: 'Green',
    cryolockColor: 'Yellow',
    dateOfVitrification: '2024-03-02',
    siteName: 'Egmore',
    status: 'Thawed',
    embryoGrading: '4AB',
    description: null,
  },
];

export default function MockContainerDataTable() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-500">HIS #</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Cryolock</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Grade</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {mockRows.map((row) => (
            <tr key={row.hisNumber}>
              <td className="px-4 py-2 text-gray-700">{row.hisNumber}</td>
              <td className="px-4 py-2 text-gray-700">{row.cryolockNum}</td>
              <td className="px-4 py-2 text-gray-700">{row.embryoGrading}</td>
              <td className="px-4 py-2 text-gray-700">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}