 

export default function ComplianceCard() {
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-bold text-black text-base mb-1 text-[16px]">Compliance</h3>
      <div className="text-xs text-gray-400 mb-3 text-[12px]">Document Checklist</div>

      {/* Header row */}
      <div className="bg-[#FDF4FF] rounded-md px-4 py-2 grid grid-cols-3 text-xs font-medium text-[#6B1176]">
        <div>Transport Route</div>
        <div className="text-center">Needed</div>
        <div className="text-center">Missed</div>
      </div>

      {/* Data rows */}
      <div className="mt-3 text-[14px]">
        <div className="grid grid-cols-3 items-center px-4 py-3 text-sm">
          <div className="text-black font-medium">Paris-Lille</div>
          <div className="text-center text-black font-medium">8</div>
          <div className="text-center text-red-600 font-medium">2</div>
        </div>
        <div className="grid grid-cols-3 items-center px-4 py-3 text-sm">
          <div className="text-black font-medium">Paris-Lille</div>
          <div className="text-center text-black font-medium">8</div>
          <div className="text-center text-red-600 font-medium">2</div>
        </div>
      </div>
    </div>
  );
}


