type EmbryoRow = {
  embryoId: string;
  hisNumber: string;
  cryolockNumber: string;
  canisterNumber: string;
  caneId: string;
  gobletColor: string;
  cryolockColor: string;
  dateOfVitrification: string;
  embryoGrade: string;
  embryoDay: string;
  embryoStatus: string;
  incubatorTemp: string;
  co2Conc: string;
  phLevel: string;
  humidity: string;
};

const mockRows: EmbryoRow[] = [
  {
    embryoId: 'EMB-T40-001',
    hisNumber: 'HIS-T40-0001',
    cryolockNumber: '1',
    canisterNumber: 'C1',
    caneId: 'E1',
    gobletColor: 'Blue',
    cryolockColor: 'Red',
    dateOfVitrification: '2025-11-05',
    embryoGrade: '4AA',
    embryoDay: 'D5 Blastocyst',
    embryoStatus: 'Stored',
    incubatorTemp: '37.1°C',
    co2Conc: '6.0%',
    phLevel: '7.35',
    humidity: '95%',
  },
  {
    embryoId: 'EMB-T40-002',
    hisNumber: 'HIS-T40-0002',
    cryolockNumber: '2',
    canisterNumber: 'C2',
    caneId: 'E1',
    gobletColor: 'Green',
    cryolockColor: 'Yellow',
    dateOfVitrification: '2025-11-07',
    embryoGrade: '4AB',
    embryoDay: 'D5 Blastocyst',
    embryoStatus: 'Stored',
    incubatorTemp: '37.0°C',
    co2Conc: '5.9%',
    phLevel: '7.33',
    humidity: '94%',
  },
  {
    embryoId: 'EMB-T40-003',
    hisNumber: 'HIS-T40-0003',
    cryolockNumber: '3',
    canisterNumber: 'C3',
    caneId: 'E1',
    gobletColor: 'Yellow',
    cryolockColor: 'Red',
    dateOfVitrification: '-',
    embryoGrade: '3AA',
    embryoDay: 'D3 Cleavage',
    embryoStatus: 'Under Observation',
    incubatorTemp: '37.3°C',
    co2Conc: '6.2%',
    phLevel: '7.31',
    humidity: '96%',
  },
  {
    embryoId: 'EMB-T40-004',
    hisNumber: 'HIS-T40-0004',
    cryolockNumber: '4',
    canisterNumber: 'C4',
    caneId: 'E1',
    gobletColor: '-',
    cryolockColor: 'Blue',
    dateOfVitrification: '-',
    embryoGrade: '4BB',
    embryoDay: 'D5 Blastocyst',
    embryoStatus: 'Stored',
    incubatorTemp: '37.1°C',
    co2Conc: '6.0%',
    phLevel: '7.34',
    humidity: '95%',
  },
];

export default function MockContainerDataTable() {
  return (
    <div className="bg-white border border-line rounded-lg p-4 h-[398px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-black text-[16px]">Container Data</h3>
        <div className="text-black text-sm">
          <span className="font-medium">Total Cryolock: </span>
          <span className="font-semibold">4</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#F8F8F8] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        <table className="min-w-max w-full text-xs bg-white">
          <thead className="sticky top-0 z-10 bg-surface text-primary text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px] whitespace-nowrap">Embryo ID</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">HIS # (PK)</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Canister #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cane ID</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Goblet Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Date of Vitrification</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Embryo Grade</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Embryo Day</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Embryo Status</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Temp</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">CO₂ Conc</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">pH Level</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Humidity</th>
            </tr>
          </thead>
          <tbody>
            {mockRows.map((row) => (
              <tr key={row.hisNumber} className="text-black text-[13px] h-[52px] hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{row.embryoId}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.hisNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.cryolockNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.canisterNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.caneId}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.gobletColor}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.cryolockColor}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.dateOfVitrification}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.embryoGrade}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.embryoDay}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.embryoStatus}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.incubatorTemp}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.co2Conc}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.phLevel}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.humidity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}