 
type ChecklistItem = { stage: string; actual: number; needed: number; missed: number };

interface ComplianceCardProps {
  items: ChecklistItem[];
  loading: boolean;
  error: string | null;
}

export default function ComplianceCard({ items, loading, error }: ComplianceCardProps) {

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-bold text-black text-base mb-1 text-[16px]">Compliance</h3>
      <div className="text-xs text-gray-400 mb-3 text-[12px]">Logistic Document Checklist</div>

      {/* Header row */}
      <div className="bg-[#FDF4FF] rounded-md px-4 py-2 grid grid-cols-3 text-xs font-medium text-[#6B1176]">
        <div>Transport Route</div>
        <div className="text-center">Needed</div>
        <div className="text-center">Missed</div>
      </div>

      {/* Data rows */}
      <div className="mt-3 text-[14px] h-[120px] overflow-y-auto [scrollbar-width:thin]">
        {loading && (
          <div className="px-4 py-3 text-sm text-gray-500">Loading...</div>
        )}
        {!loading && error && (
          <div className="px-4 py-3 text-sm text-red-600">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500">No checklist items</div>
        )}
        {!loading && !error && items.map((item, idx) => (
          <div key={`${item.stage}-${idx}`} className="grid grid-cols-3 items-center px-4 py-3 text-sm">
            <div className="text-black font-medium py-2">{item.stage}</div>
            <div className="text-center text-black font-medium py-2">{item.needed}</div>
            <div className="text-center text-red-600 font-medium py-2">{item.missed}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


