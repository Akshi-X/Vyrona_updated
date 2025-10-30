export default function AuditTrailTable() {
  const rows = [
    { date: 'April 20', user: 'j.doe', doc: 'Agency' },
    { date: 'April 20', user: 'j.doe', doc: 'Agency' },
    { date: 'April 20', user: 'j.doe', doc: 'Agency' },
  ];
  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[270px]">
      <h3 className="font-bold text-black text-[16px] mb-2">Audit Trail Summary</h3>
      <div className="overflow-x-auto h-[193px]">
        <table className="w-full text-xs">
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] sticky top-0">
            <tr>
              <th className="px-3 py-5 text-left">Data</th>
              <th className="px-3 py-5 text-left">User</th>
              <th className="px-3 py-5 text-left">Doc</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 text-[14px]">
                  <td className="px-3 py-4">{r.date}</td>
                  <td className="px-3 py-4">{r.user}</td>
                  <td className="px-3 py-4">{r.doc}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-4 text-gray-500 text-center" colSpan={3}>No audit trail available</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


