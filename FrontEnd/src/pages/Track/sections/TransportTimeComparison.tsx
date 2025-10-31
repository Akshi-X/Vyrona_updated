export default function TransportTimeComparison() {
  // two series for each route to match the mock: dark and light bars
  const routes = ['Route A', 'Route B', 'Route C', 'Route D'];
  const darkValues = [78, 45, 60, 56];
  const lightValues = [38, 100, 38, 78];

  const yTicks = [100, 80, 60, 40, 20, 0];

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[270px]">
      <h3 className="font-bold text-black text-sm mb-3 text-[16px]">Transport Time Comparison</h3>

      <div className="flex mt-[35px]">
        {/* Y-axis labels */}
        <div className="mr-3 text-[10px] text-[#7C7C7C] select-none">
          <div className="relative h-40 flex flex-col justify-between">
            {yTicks.map((t) => (
              <div key={t} className="-translate-y-1/2">
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Chart area */}
        <div className="relative flex-1">
          {/* grid lines */}
          <div
            className="absolute inset-0 rounded-md pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, #EDEDED 0, #EDEDED 1px, transparent 1px, transparent 20%)',
            }}
          />

          {/* bars */}
          <div className="relative z-10 h-40 flex items-end justify-between px-2">
            {routes.map((route, idx) => (
              <div key={route} className="flex flex-col items-center w-1/5">
                <div className="flex items-end gap-2 w-full justify-center">
                  <div
                    className="bg-[#5B0D8E] rounded-sm w-6"
                    style={{ height: `${darkValues[idx]}%` }}
                  />
                  <div
                    className="bg-[#A340F9] rounded-sm w-6"
                    style={{ height: `${lightValues[idx]}%` }}
                  />
                </div>
                <div className="text-center text-xs mt-2 text-[#4B4B4B]">{route}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


