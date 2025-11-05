import { useEffect, useState } from 'react';
import { laneRiskService, type LaneRiskItem } from '../../../services/laneRiskService';

export default function HistoricLaneRiskAssessment() {
  const [rows, setRows] = useState<LaneRiskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await laneRiskService.getLaneRiskAssessment();
        if (!isMounted) return;
        setRows(res?.lanes ?? []);
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || 'Failed to load lane risk assessment');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="bg-white rounded-lg">
      <h3 className="font-bold text-black text-[16px] mb-3">Historic Lane Risk Assessment</h3>
      <div className="overflow-x-auto rounded-lg ">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No data available</div>
        ) : (
          <table className="w-full text-xs border border-[#E7E1E1] sticky top-0 h-[320px]">
            <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px]">
              <tr>
                <th className="px-4 py-5 text-left font-[600]">Route</th>
                <th className="px-4 py-5 text-left font-[600]">Quality Deviations</th>
                <th className="px-4 py-5 text-left font-[600]">Returns & Regulatory</th>
                <th className="px-4 py-5 text-left font-[600]">Loss/Physical Damage</th>
                <th className="px-4 py-5 text-left font-[600]">3PL Reliability</th>
                <th className="px-4 py-5 text-left font-[600]">Weather</th>
                <th className="px-4 py-5 text-left font-[600]">Lane Complexity</th>
                <th className="px-4 py-5 text-left font-[600]">Geopolitical</th>
                <th className="px-4 py-5 text-left font-[600]">Digital Communication</th>
                <th className="px-4 py-5 text-left font-[600]">Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.route} className="hover:bg-gray-50 text-black text-[14px]">
                  <td className="px-4 py-5">{r.route}</td>
                  <td className="px-4 py-5">{r.quality_deviations || '-'}</td>
                  <td className="px-4 py-5">{r.returns_regulatory || '-'}</td>
                  <td className="px-4 py-5">{r.loss_physical_damage || '-'}</td>
                  <td className="px-4 py-5">{r.three_pl_reliability || '-'}</td>
                  <td className="px-4 py-5">{r.weather || '-'}</td>
                  <td className="px-4 py-5">{r.lane_complexity || '-'}</td>
                  <td className="px-4 py-5">{r.geopolitical || '-'}</td>
                  <td className="px-4 py-5">{r.digital_communication || '-'}</td>
                  <td className="px-4 py-5">{r.risk_level || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


