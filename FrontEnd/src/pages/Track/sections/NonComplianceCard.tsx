import { CurveBar } from '../../../components/CurveBar';
import RiskIcon from '../../../assets/DashBoardIcons/Risk.svg';

interface NonComplianceCardProps {
  percentage: number;
  missedDocsCount: number;
  loading: boolean;
  error: string | null;
}

export default function NonComplianceCard({ percentage, missedDocsCount, loading, error }: NonComplianceCardProps) {
  const value = Number.isFinite(percentage) ? percentage : 0;
  const display = Math.round(value);

  return (
    <div className="bg-[#FFF4EE] border border-[#E7E1E1] rounded-lg p-4 h-full flex flex-col">
      <h3 className="font-semibold text-gray-700 text-sm mb-4 text-[16px]">Non-Compliance</h3>
      
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[12px] text-gray-500">Loading...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[12px] text-red-600">{error}</span>
        </div>
      ) : (
        <>
          {/* Semi-circular progress indicator with percentage */}
          <div className="flex-1 flex items-center justify-center mb-4">
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
                backgroundColor="#FFFFFF"
                strokeWidth={7.5}
                size="md"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-black font-bold text-[28px] mt-[50px]">{display}%</span>
              </div>
            </div>
          </div>

          {/* No. of missed docs section */}
          <div className="flex items-center gap-2 mb-3 mx-4">
            {/* Orange exclamation icon in circle */}
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <img src={RiskIcon} alt="Exclamation Icon" className="w-4 h-4" />
            </div>
            <span className="text-gray-700 text-sm text-[12px]">No. of missed docs</span>
          </div>

          {/* Count badge */}
          <div className="flex justify-center">
            <div className="bg-[#FFFFFF] w-[47px] h-[24px] rounded-[8px] px-3 py-1.5 flex items-center justify-center">
              <span className="text-[#F97316] text-[12px] font-bold">{missedDocsCount}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


