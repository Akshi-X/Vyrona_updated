 
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
      const docsToUse = Math.min(item.missed, missingDocuments.length - missingDocIndex);
      const rows = Array.from({ length: docsToUse }, (_, i) => {
        const doc = missingDocuments[missingDocIndex + i];
        return {
          stage: item.stage,
          needed: item.needed,
          missedDoc: doc
        };
      });
      expandedRows.push(...rows);
      missingDocIndex += docsToUse;
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

      {/* Table with proper semantic HTML */}
      <div className="mt-3 h-[165px] overflow-y-auto [scrollbar-width:thin]">
        <table className="w-full text-[12px]">
          <thead className="bg-[#FDF4FF] text-[#6B1176] font-medium sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left w-[154px] h-[56px] rounded-tl-[10px]">Transport Route</th>
              <th className="px-4 py-2 text-center w-[154px] whitespace-nowrap h-[56px]">Documents Required</th>
              <th className="px-4 py-2 text-left px-2 w-[154px] whitespace-nowrap h-[56px] rounded-tr-[10px]">Documents Missed</th>
            </tr>
          </thead>
          <tbody className="text-[14px]">
            {loading && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && expandedRows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm text-gray-500">
                  No checklist items
                </td>
              </tr>
            )}
            {!loading && !error && expandedRows.map((row, idx) => (
              <tr key={`${row.stage}-${idx}`} className="text-black hover:bg-gray-50">
                <td className="px-4 py-3 text-left">{row.stage}</td>
                <td className="px-4 py-3 text-center">{row.needed}</td>
                <td className="px-4 py-3 text-left px-4">{row.missedDoc || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


