export default function HistoricLaneRiskAssessment() {
  const rows = ['A','B','C','D','E'].map((route) => ({
    route,
    quality: 'Temperature deviations (2.1% frequency)',
    returns: 'EU clearance: 12-16 hrs avg',
    loss: '0.3% lost shipments',
    reliability: 'DHL: 2.1% SLA breach',
    weather: 'Storm delays: 4 events',
  }));

  return (
    <div className="bg-white rounded-lg">
      <h3 className="font-bold text-black text-[16px] mb-3">Historic Lane Risk Assessment</h3>
      <div className="overflow-x-auto rounded-lg ">
        <table className="w-full text-xs border border-[#E7E1E1] sticky top-0 h-[320px]">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px]">
            <tr>
              <th className="px-4 py-5 text-left font-[600]">Route</th>
              <th className="px-4 py-5 text-left font-[600]">Quality Deviations</th>
              <th className="px-4 py-5 text-left font-[600]">Returns & Regulatory</th>
              <th className="px-4 py-5 text-left font-[600]">Loss/Physical Damage</th>
              <th className="px-4 py-5 text-left font-[600]">3PL Reliability</th>
              <th className="px-4 py-5 text-left font-[600]">Weather</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.route} className="hover:bg-gray-50 text-black text-[14px]">
                <td className="px-4 py-5">{r.route}</td>
                <td className="px-4 py-5">{r.quality}</td>
                <td className="px-4 py-5">{r.returns}</td>
                <td className="px-4 py-5">{r.loss}</td>
                <td className="px-4 py-5">{r.reliability}</td>
                <td className="px-4 py-5">{r.weather}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


