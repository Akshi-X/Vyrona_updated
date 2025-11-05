export default function FrequentlyMissedDocs() {
  const docs = [
    'Transportation Authorization Form',
    'Cross-Border Medication Authorization',
    'Chain of Custody Documentation',
    'Temperature Deviation Reports',
  ];
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-bold text-black text-base text-[16px] mb-2 text-[16px]">Missed Docs</h3>
      {docs.length  ? (
        <ul className="text-[12px] text-[#6B1176] p-3 list-disc list-inside space-y-1">
          {docs.map((d, i) => (
            <li key={i} className="hover:underline cursor-pointer">{d}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-gray-500">No documents found</p>
      )}
    </div>
  );
}


