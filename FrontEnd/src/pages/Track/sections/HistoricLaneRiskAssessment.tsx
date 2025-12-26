import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { laneRiskService, type RiskFactor } from '../../../services/laneRiskService';

// Component to display risk scale bar (0-5)
function RiskScaleBar({ riskScale }: { riskScale: string }) {
  // Extract numeric value from strings like "4.1 (Excellent)" or "4.5 (Excellent)"
  const extractNumericValue = (scale: string): number => {
    const match = scale.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  };

  const value = extractNumericValue(riskScale);
  // Calculate percentage position (0-100%) for a 0-5 scale
  const percentage = Math.min(Math.max((value / 5) * 100, 0), 100);

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-[120px] h-[8px] rounded-sm overflow-visible group">
        {/* Color segments: red, orange, yellow, light green, dark green */}
        <div className="absolute inset-0 flex rounded-sm overflow-hidden">
          <div className="w-1/5 bg-red-500"></div>
          <div className="w-1/5 bg-orange-500"></div>
          <div className="w-1/5 bg-yellow-400"></div>
          <div className="w-1/5 bg-green-300"></div>
          <div className="w-1/5 bg-green-600"></div>
        </div>
        {/* Black vertical line marker with tooltip */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-black z-10 cursor-pointer group/marker"
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)' }}
        >
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 border border-gray-300 bg-white text-black text-[11px] rounded whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
            {riskScale}
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-300"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HistoricLaneRiskAssessment() {
  const { patientId } = useParams();
  const [factors, setFactors] = useState<RiskFactor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setError('Patient ID is required');
      setLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const res = await laneRiskService.getLaneRiskAssessment(patientId);
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
  }, [patientId]);

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
          <div className="max-h-[360px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
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
                    <td className="px-4 py-5">
                      {factor.risk_scale ? (
                        <RiskScaleBar riskScale={factor.risk_scale} />
                      ) : (
                        '-'
                      )}
                    </td>
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


