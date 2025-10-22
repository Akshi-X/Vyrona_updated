const tableHeaders = [
  { label: "Header", hasSort: false },
  { label: "Header", hasSort: false },
  { label: "Header", hasSort: false },
  { label: "Header", hasSort: false },
  { label: "Header", hasSort: true },
];

const tableData = [
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
  ["Cell", "Cell", "Cell", "Cell", "Cell"],
];

export const OngoingTreatments = () => {
  return (
    <div className="w-full bg-white rounded-[10px] overflow-hidden border border-[#E7E1E1]">
      <div 
        className="max-h-[420px] overflow-y-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#af6eb7 transparent'
        }}
      >
        <table className="w-full">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-[#eeeeee]">
              {tableHeaders.map((header, index) => (
                <th
                  key={index}
                  className="bg-white p-[15px] font-semibold text-[#6b1176] text-sm text-left"
                >
                  <div className="flex items-center gap-2">
                    <span>{header.label}</span>
                    {header.hasSort && (
                      <svg className="w-4 h-4 text-[#6b1176]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-[#eeeeee] hover:bg-white/50"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="bg-white p-[15px] font-normal text-[#333333] text-sm"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
