import { useEffect, useState } from 'react';
import { laneRiskService, type RiskFactor } from '../../../services/laneRiskService';

export default function HistoricLaneRiskAssessment() {
  const [factors, setFactors] = useState<RiskFactor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await laneRiskService.getLaneRiskAssessment();
        if (!isMounted) return;
        setFactors(res?.factors ?? []);
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
    <div className="bg-white rounded-lg border border-[#E7E1E1] p-5 h-full">
      <h3 className="font-semibold text-black text-[16px] mb-3">Historic Lane Risk Assessment</h3>
      <div className="overflow-x-auto rounded-lg ">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : factors.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No data available</div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
            <table className="w-full text-xs">
              <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-5 text-left font-[600]">Risk Factor</th>
                  <th className="px-4 py-5 text-left font-[600]">Risk Contributor</th>
                  <th className="px-4 py-5 text-left font-[600]">Risk Contributor</th>
                  <th className="px-4 py-5 text-left font-[600]">Risk Contributor</th>
                  <th className="px-4 py-5 text-left font-[600]">Risk Contributor</th>
                  <th className="px-4 py-5 text-left font-[600]">Risk Scale</th>
                </tr>
              </thead>
              <tbody>
                {factors.map((factor, index) => (
                  <tr key={index} className="hover:bg-gray-50 text-black text-[14px]">
                    <td className="px-4 py-5">{factor.risk_factor}</td>
                    <td className="px-4 py-5">{factor.risk_contributors[0] || '-'}</td>
                    <td className="px-4 py-5">{factor.risk_contributors[1] || '-'}</td>
                    <td className="px-4 py-5">{factor.risk_contributors[2] || '-'}</td>
                    <td className="px-4 py-5">{factor.risk_contributors[3] || '-'}</td>
                    <td className="px-4 py-5">{factor.risk_scale || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


