export default function QualityTrackingChart() {
  // y-scale 0–12; data values roughly shaped to match the mock
  const yMax = 12;
  const yTicks = [12, 10, 8, 6, 4, 2, 0];
  const xLabels = ['11:32:09 pm', '11:33:09 pm', '11:34:09 pm', '11:35:09 pm'];

  // Grey series sits higher with a dip, purple series lower and smoother
  const grey = [7, 8.6, 8.1, 8.7, 9.8, 8.1, 9.0, 5.7, 9.1, 8.2, 9.5];
  const purple = [6.7, 5.8, 7.4, 5.6, 5.2, 5.1, 6.9, 4.8, 7.2, 6.0, 5.4];

  // helpers to convert to SVG coords
  const width = 640; // virtual viewBox width
  const height = 200; // virtual viewBox height
  const leftPadding = 0; // we render y labels outside of SVG
  const bottomPadding = 24; // room for x-axis baseline

  const toPointString = (values: number[]) => {
    const step = width / (values.length - 1);
    return values
      .map((v, i) => {
        const x = leftPadding + i * step;
        const y = ((yMax - v) / yMax) * (height - bottomPadding);
        return `${x},${y}`;
      })
      .join(' ');
  };

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4">
      <h3 className="font-bold text-black text-sm mb-3 text-[16px]">Quality Tracking</h3>

      <div className="flex my-[25px]">
        {/* Y-axis labels */}
        <div className="mr-3 text-[10px] text-[#7C7C7C] select-none">
          <div className="relative h-40 flex flex-col justify-between">
            {yTicks.map((t) => (
              <div key={t} className="-translate-y-1/2">{t}</div>
            ))}
          </div>
        </div>

        {/* Chart area */}
        <div className="relative flex-1 w-[85%]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
            {/* horizontal grid lines */}
            {yTicks.map((t, idx) => {
              const y = ((yMax - t) / yMax) * (height - bottomPadding);
              return (
                <line
                  key={t}
                  x1={0}
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke="#E9E5E5"
                  strokeDasharray={idx === yTicks.length - 1 ? '0' : '2 8'}
                />
              );
            })}

            {/* grey series */}
            <polyline
              fill="none"
              stroke="#9B9B9B"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={toPointString(grey)}
            />

            {/* purple series */}
            <polyline
              fill="none"
              stroke="#B554FF"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={toPointString(purple)}
            />

            {/* x-axis baseline */}
            <line
              x1={0}
              x2={width}
              y1={height - bottomPadding}
              y2={height - bottomPadding}
              stroke="#E9E5E5"
            />
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between text-[#4B4B4B] text-xs mt-2 px-1">
            {xLabels.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


