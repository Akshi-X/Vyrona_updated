// Mock data for Refill Log
const mockRefillData = [
  {
    containerId: '2020R034ST',
    liquidNitrogenVol: '88%',
    description: 'Change header text to better reflect...',
    refilledBy: 'Dr. Sarah Johnson',
    refilledDate: '01/03/2025',
    status: 'Done',
  },
  {
    containerId: '2020R034ST',
    liquidNitrogenVol: '88%',
    description: 'Change header text to better reflect...',
    refilledBy: 'Dr. Sarah Johnson S',
    refilledDate: '01/03/2025',
    status: 'In Progress',
  },
  {
    containerId: '2020R034ST',
    liquidNitrogenVol: '88%',
    description: 'Change header text to better reflect...',
    refilledBy: 'Dr. Sarah Johnson',
    refilledDate: '01/03/2025',
    status: 'Not started',
  },
  {
    containerId: '2020R034ST',
    liquidNitrogenVol: '88%',
    description: 'Change header text to better reflect...',
    refilledBy: 'Dr. Sarah Johnson',
    refilledDate: '01/03/2025',
    status: 'Not started',
  },
  {
    containerId: '2020R034ST',
    liquidNitrogenVol: '88%',
    description: 'Change header text to better reflect...',
    refilledBy: 'Dr. Sarah Johnson',
    refilledDate: '01/03/2025',
    status: 'Not started',
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Done':
      return 'text-green-600';
    case 'In Progress':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
};

export default function RefillLogTable() {
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-[16px] mb-4">Refill Log</h3>
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' as any }}>
        <table className="w-full text-xs">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px] sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px]">Container ID</th>
              <th className="px-3 py-2 text-left">Liquid Nitrogen Vol</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Refilled By</th>
              <th className="px-3 py-2 text-left">Refilled Date</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {mockRefillData.map((row, index) => (
              <tr key={index} className="text-black text-[14px] h-[56px] hover:bg-gray-50 ">
                <td className="px-3 py-2">{row.containerId}</td>
                <td className="px-3 py-2">{row.liquidNitrogenVol}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">{row.refilledBy}</td>
                <td className="px-3 py-2">{row.refilledDate}</td>
                <td className={`px-3 py-2 ${getStatusColor(row.status)}`}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
