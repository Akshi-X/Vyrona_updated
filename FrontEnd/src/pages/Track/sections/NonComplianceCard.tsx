import { CurveBar } from '../../../components/CurveBar';

interface NonComplianceCardProps {
  percentage: number;
  loading: boolean;
  error: string | null;
}

export default function NonComplianceCard({ percentage, loading, error }: NonComplianceCardProps) {
  const value = Number.isFinite(percentage) ? percentage : 0;
  const display = Math.round(value);

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


