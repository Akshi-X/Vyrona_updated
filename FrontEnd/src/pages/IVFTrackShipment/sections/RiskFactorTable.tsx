// Mock data for Risk Factors
// The fill percentage represents how much of the green area is filled (higher = lower risk)
const mockRiskFactors = [
  { factor: 'Quality Deviations', fillPercentage: 75 }, // Extends significantly into green (lower risk)
  { factor: 'Returns & Regulatory', fillPercentage: 65 }, // Extends slightly less into green
  { factor: 'Loss/Physical Damage', fillPercentage: 70 }, // Extends roughly to middle of green
  { factor: '3PL Reliability', fillPercentage: 60 }, // Similar to Returns & Regulatory
  { factor: 'Weather', fillPercentage: 85 }, // Extends furthest into green (lowest risk)
];

export default function RiskFactorTable() {
  return (
    <div className="bg-white border border-[#E7E1E1] h-[398px] rounded-lg p-4">
      <h3 className="font-semibold text-black text-[16px] mb-4">Risk Factor</h3>
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' as any }}>
        <table className="w-full text-xs">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px] sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px]">Risk Factor</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px]">Risk Scale</th>
            </tr>
          </thead>
          <tbody>
            {mockRiskFactors.map((row, index) => {
              return (
                <tr key={index} className="text-black text-[14px] h-[56px] hover:bg-gray-50">
                  <td className="px-3 py-2">{row.factor}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-start">
                      <div className="relative h-[6px] w-[100px] rounded-[10px] overflow-hidden bg-[#F3F4F6]">
                        {/* Gradient fill bar using the specified color palette */}
                        <div
                          className="absolute left-0 top-0 h-full rounded-[10px]"
                          style={{
                            background:
                              'linear-gradient(to right, #DB4B33 0%, #E18B40 25%, #EFDD51 50%, #9AC456 75%, #6EB454 100%)',
                            width: `${row.fillPercentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
