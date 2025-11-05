import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { shipmentService } from '../../../services/shipmentService';

export default function FrequentlyMissedDocs() {
  const { patientId } = useParams();
  const [missingDocs, setMissingDocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!patientId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await shipmentService.getDocumentChecklist(patientId);
        if (isMounted) setMissingDocs(res?.missing_documents || []);
      } catch (e: any) {
        if (isMounted) {
          setMissingDocs([]);
          setError(e?.message || 'Failed to load missed documents');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [patientId]);

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-bold text-black text-base text-[16px] mb-2 text-[16px]">Missed Docs</h3>
      {loading ? (
        <p className="text-[12px] text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-[12px] text-red-600">{error}</p>
      ) : (missingDocs && missingDocs.length) ? (
        <ul className="text-[12px] text-[#6B1176] p-3 list-disc list-inside space-y-1">
          {missingDocs.map((d, i) => (
            <li key={i} className="hover:underline cursor-pointer">{d}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-gray-500">No documents found</p>
      )}
    </div>
  );
}


