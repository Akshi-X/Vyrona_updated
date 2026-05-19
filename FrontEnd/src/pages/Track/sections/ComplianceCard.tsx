 
type ChecklistItem = {
  stage: string;
  actual: number;
  needed: number;
  missed: number;
  missing_documents?: string[];
};

interface ComplianceCardProps {
  items: ChecklistItem[];
  loading: boolean;
  error: string | null;
}

export default function ComplianceCard({ items, loading, error }: ComplianceCardProps) {
  // Create rows: one row per item, joining all missing documents with commas
  const rows: Array<{ stage: string; needed: number; missedDoc: string }> = items.map((item) => {
    const docs = Array.isArray(item.missing_documents) ? item.missing_documents : [];
    return {
      stage: item.stage,
      needed: item.needed,
      missedDoc: docs.length > 0 ? docs.join(', ') : '',
    };
  });

  return (
    <div className="bg-white border border-line rounded-lg p-4 h-full">
      <h3 className="font-semibold text-black text-base mb-1 text-[16px]">Compliance</h3>
      <div className="text-xs text-gray-400 mb-3 text-[12px]">Logistic Document Checklist</div>

      {/* Table with proper semantic HTML */}
      <div className="mt-3 h-[165px] overflow-y-auto [scrollbar-width:thin] bg-[#F8F8F8]">
        <div className="inline-block min-w-full bg-white rounded-[5px]">
        <table className="w-full text-[12px]">
          <thead className="bg-surface text-primary font-medium sticky top-0">
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
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm text-gray-500">
                  No checklist items
                </td>
              </tr>
            )}
            {!loading && !error && rows.map((row, idx) => (
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
    </div>
  );
}


