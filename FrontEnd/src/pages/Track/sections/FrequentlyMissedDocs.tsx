interface FrequentlyMissedDocsProps {
  missingDocs: string[];
  loading: boolean;
  error: string | null;
}

export default function FrequentlyMissedDocs({ missingDocs, loading, error }: FrequentlyMissedDocsProps) {

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-semibold text-black text-base text-[16px] mb-2 text-[16px]">Missed Docs</h3>
      {loading ? (
        <p className="text-[12px] text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-[12px] text-red-600">{error}</p>
      ) : (missingDocs && missingDocs.length) ? (
        <ul className="text-[12px] text-[#6B1176] p-3 list-disc list-inside space-y-1 overflow-y-auto [scrollbar-width:thin]">
          {missingDocs.map((d, i) => (
            <li key={i} className="hover:underline cursor-pointer font-semibold">{d}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-gray-500">No documents found</p>
      )}
    </div>
  );
}


