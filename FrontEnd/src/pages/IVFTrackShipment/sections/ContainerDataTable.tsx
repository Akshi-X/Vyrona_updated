// Mock data for Container Data
const mockContainerData = [
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
  { hisNumber: 'HIS-10334', cryobackNum: 'CL-01', containerNum: '8', tankId: 'Tank 0', caneId: 'Cane-A.12' },
];

export default function ContainerDataTable() {
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[805px]">
      <h3 className="font-semibold text-black text-[16px] mb-4">Container Data</h3>
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' as any }}>
        <table className="w-full text-xs">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px] sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px] whitespace-nowrap">HIS Number (PK)</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryoback Num</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Container #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Tank ID</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Cane ID</th>
            </tr>
          </thead>
          <tbody>
            {mockContainerData.map((row, index) => (
              <tr key={index} className="text-black text-[14px] h-[56px] hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{row.hisNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.cryobackNum}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.containerNum}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.tankId}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.caneId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
