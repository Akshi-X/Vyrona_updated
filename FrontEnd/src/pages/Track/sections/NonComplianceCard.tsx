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
      <h3 className="font-semibold text-black text-sm mb-2 text-[16px]">Non-Compliance</h3>
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
              gradient={{
                id: 'nonComplianceGradient',
                x1: '0%',
                y1: '0%',
                x2: '100%',
                y2: '0%',
                stops: [
                  { offset: '0%', color: 'rgba(234, 88, 12, 1)' },   // #EA580C
                  { offset: '100%', color: 'rgba(244, 149, 0, 1)' }, // #F49500
                ],
              }}
              backgroundColor="#F4F4F4"
              strokeWidth={7.5}
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


