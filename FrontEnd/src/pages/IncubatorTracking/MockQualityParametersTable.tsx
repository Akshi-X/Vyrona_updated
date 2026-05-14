

// Minimal mock version of IVFQualityParametersTable for incubator details
export default function MockQualityParametersTable() {
  const tileClass = "bg-white rounded-lg border border-[#E7E1E1] shadow-sm p-2 flex items-center gap-2 w-full";

  const renderTile = (label: string, value: string) => (
    <div className={tileClass}>
      <div className="bg-[#FDF4FF] rounded-lg p-1 flex items-center justify-center">
        {/* empty icon placeholder */}
        <div className="h-5 w-5 bg-[#B58BC6] rounded-full" />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
        <span className="text-[15px] font-semibold text-black">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {renderTile('LN2 Level', '78%')}
      {renderTile('Battery', '92%')}
      {renderTile('Ext Temp', '5°C')}
      {renderTile('Int Temp', '37°C')}
      {renderTile('Evaporation', '1.2 kg/h')}
      {renderTile('Shock', 'None')}</div>
  );
}