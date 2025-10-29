export default function AuditTrailTable() {
  const rows = [
    { date: 'April 20', user: 'j.doe', doc: 'Agency' },
    { date: 'April 20', user: 'j.doe', doc: 'Agency' },
    { date: 'April 20', user: 'j.doe', doc: 'Agency' },
  ];
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-semibold text-black text-sm mb-2">Audit Trail Summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-purple-50 text-purple-700">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Doc</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500 text-center" colSpan={3}>No audit trail available</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{r.date}</td>
                  <td className="px-3 py-2">{r.user}</td>
                  <td className="px-3 py-2">{r.doc}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


