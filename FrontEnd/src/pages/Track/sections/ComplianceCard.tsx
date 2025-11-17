 
type ChecklistItem = { stage: string; actual: number; needed: number; missed: number };

interface ComplianceCardProps {
  items: ChecklistItem[];
  missingDocuments: string[];
  loading: boolean;
  error: string | null;
}

export default function ComplianceCard({ items, missingDocuments, loading, error }: ComplianceCardProps) {
  // Create expanded rows: for each item, create rows based on missing documents
  // If an item has missed > 0, show one row per missing document
  // Otherwise show one row with empty missed column
  const expandedRows: Array<{ stage: string; needed: number; missedDoc: string }> = [];
  
  let missingDocIndex = 0;
  
  items.forEach((item) => {
    if (item.missed > 0 && missingDocuments.length > 0) {
      // Show one row per missing document for this item
      // Take the next 'missed' number of documents from the array
      for (let i = 0; i < item.missed && missingDocIndex < missingDocuments.length; i++) {
        expandedRows.push({
          stage: item.stage,
          needed: item.needed,
          missedDoc: missingDocuments[missingDocIndex]
        });
        missingDocIndex++;
      }
    } else {
      // Show one row with empty missed column
      expandedRows.push({
        stage: item.stage,
        needed: item.needed,
        missedDoc: ''
      });
    }
  });

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-semibold text-black text-base mb-1 text-[16px]">Compliance</h3>
      <div className="text-xs text-gray-400 mb-3 text-[12px]">Logistic Document Checklist</div>

      {/* Header row */}
      <div className="bg-[#FDF4FF] rounded-md px-4 py-2 grid grid-cols-3 text-xs font-medium text-[#6B1176]">
        <div>Transport Route</div>
        <div className="text-center">Documents Required</div>
        <div className="text-left px-2">Documents Missed</div>
      </div>

      {/* Data rows */}
      <div className="mt-3 text-[14px] h-[120px] overflow-y-auto [scrollbar-width:thin]">
        {loading && (
          <div className="px-4 py-3 text-sm text-gray-500">Loading...</div>
        )}
        {!loading && error && (
          <div className="px-4 py-3 text-sm text-red-600">{error}</div>
        )}
        {!loading && !error && expandedRows.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500">No checklist items</div>
        )}
        {!loading && !error && expandedRows.map((row, idx) => (
          <div key={`${row.stage}-${idx}`} className="grid grid-cols-3 items-center px-4 py-3 text-sm">
            <div className="text-left text-black py-2">{row.stage}</div>
            <div className="text-center text-black py-2">{row.needed}</div>
            <div className="text-left text-black-600 py-2 px-4">{row.missedDoc || '-'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


