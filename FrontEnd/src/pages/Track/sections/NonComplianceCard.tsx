import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CurveBar } from '../../../components/CurveBar';
import { shipmentService } from '../../../services/shipmentService';

export default function NonComplianceCard() {
  const { patientId } = useParams();
  const [percentage, setPercentage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!patientId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await shipmentService.getDocumentChecklist(patientId);
        const value = Number(res?.non_compliance_percentage ?? 0);
        if (isMounted) setPercentage(Number.isFinite(value) ? value : 0);
      } catch (e: any) {
        if (isMounted) setError(e?.message || 'Failed to load');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [patientId]);

  const display = Math.round(percentage);

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full flex flex-col">
      <h3 className="font-bold text-black text-sm mb-2 text-[16px]">Non-Compliance</h3>
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <span className="text-[12px] text-gray-500">Loading...</span>
        ) : error ? (
          <span className="text-[12px] text-red-600">{error}</span>
        ) : (
          <div className="relative">
            <CurveBar
              percentage={display}
              color="#F97316"
              backgroundColor="#F4F4F4"
              strokeWidth={9}
              className='w-[24px] h-[24px]'
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-black font-bold text-[28px] mt-[50px]">{display}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


