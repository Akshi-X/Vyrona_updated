import { CurveBar } from '../../../components/CurveBar';

export default function NonComplianceCard() {
  const percentage = 12;
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full flex flex-col">
      <h3 className="font-bold text-black text-sm mb-2 text-[16px]">Non-Compliance</h3>
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          <CurveBar percentage={percentage} color="#F97316" className='w-[30px] h-[30px]'/>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-black font-bold text-[28px] mt-[50px]">{percentage}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}


