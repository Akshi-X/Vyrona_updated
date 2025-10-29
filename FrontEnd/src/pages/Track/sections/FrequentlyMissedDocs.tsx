export default function FrequentlyMissedDocs() {
  const docs = ['Transportation Authorization Form','Cross-Border Medication','Chain of Custody','Documentation','Temperature Deviation Reports'];
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-2">Frequently Missed Docs</h3>
      {docs.length === 0 ? (
        <p className="text-xs text-gray-500">No documents found</p>
      ) : (
        <ul className="text-xs text-purple-700 list-disc list-inside space-y-1">
          {docs.map((d, i) => (
            <li key={i} className="hover:underline cursor-pointer">{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}


