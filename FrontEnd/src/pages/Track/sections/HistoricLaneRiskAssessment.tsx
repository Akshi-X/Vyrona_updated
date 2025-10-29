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
    <div className="bg-white rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-2">Historic Lane Risk Assessment</h3>
      <div className="overflow-x-auto rounded-lg ">
        <table className="w-full text-xs">
          <thead className="bg-[#F6ECFF] text-[#6b1176] text-[12px]">
            <tr>
              <th className="px-4 py-5 text-left">Route</th>
              <th className="px-4 py-5 text-left">Quality Deviations</th>
              <th className="px-4 py-5 text-left">Returns & Regulatory</th>
              <th className="px-4 py-5 text-left">Loss/Physical Damage</th>
              <th className="px-4 py-5 text-left">3PL Reliability</th>
              <th className="px-4 py-5 text-left">Weather</th>
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


