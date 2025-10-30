export default function RiskPanel() {
  // Line chart data for Phase Risk Prediction
  // Light gray line: fluctuating between 6-10
  // Magenta line: fluctuating between 4-8
  // SVG height is ~60, Y-axis goes from top (0) to bottom (60), need to invert
  // Scale: 0 maps to Y=60, 12 maps to Y=0
  
  // More data points for smoother wavy lines
  const lightGrayPoints = [
    { x: 0, y: 8 },
    { x: 10, y: 8.8 },
    { x: 20, y: 9.5 },
    { x: 30, y: 8.2 },
    { x: 40, y: 7.5 },
    { x: 50, y: 8.8 },
    { x: 60, y: 9.2 },
    { x: 70, y: 9.8 },
    { x: 80, y: 10 },
    { x: 90, y: 8.5 },
    { x: 100, y: 6.5 },
    { x: 110, y: 7.8 },
    { x: 120, y: 9 },
    { x: 130, y: 7.5 },
    { x: 140, y: 8.2 },
    { x: 150, y: 9.5 },
    { x: 160, y: 8 }
  ];

  const magentaPoints = [
    { x: 0, y: 5 },
    { x: 10, y: 5.8 },
    { x: 20, y: 7 },
    { x: 30, y: 5.5 },
    { x: 40, y: 4.5 },
    { x: 50, y: 5.8 },
    { x: 60, y: 6.5 },
    { x: 70, y: 7.5 },
    { x: 80, y: 8 },
    { x: 90, y: 6.2 },
    { x: 100, y: 4 },
    { x: 110, y: 5.5 },
    { x: 120, y: 7 },
    { x: 130, y: 6 },
    { x: 140, y: 5.5 },
    { x: 150, y: 7.5 },
    { x: 160, y: 6 }
  ];

  const convertToSVG = (value: number, maxValue: number, svgHeight: number, padding: number) => {
    const actualHeight = svgHeight - padding * 2;
    return svgHeight - padding - (value / maxValue) * actualHeight;
  };

  const lightGrayPath = lightGrayPoints.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${convertToSVG(p.y, 12, 60, 5)}`
  ).join(' ');

  const magentaPath = magentaPoints.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${convertToSVG(p.y, 12, 60, 5)}`
  ).join(' ');

  // Radar chart data
  const radarData = [
    { label: 'Human errors', value: 11.5 },
    { label: 'Infrastruc', value: 8.5 },
    { label: 'Weather', value: 6 },
    { label: 'Customs', value: 8.5 },
    { label: 'Carrier', value: 11.5 }
  ];

  const radarCenter = { x: 70, y: 70 };
  const radarRadius = 50;
  const maxRadarValue = 15;
  const categories = radarData.length;
  const angleStep = (2 * Math.PI) / categories;

  // Generate radar grid (concentric polygons)
  const gridLevels = [0, 2.5, 5, 7.5, 10, 12.5, 15];
  
  // Generate radar points for data polygon
  const radarPoints = radarData.map((item, index) => {
    const angle = (index * angleStep) - (Math.PI / 2); // Start from top
    const radius = (item.value / maxRadarValue) * radarRadius;
    return {
      x: radarCenter.x + radius * Math.cos(angle),
      y: radarCenter.y + radius * Math.sin(angle),
      angle,
      label: item.label,
      value: item.value
    };
  });

  const radarPolygonPoints = radarPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Generate axis lines (spokes)
  const axisLines = radarData.map((_, index) => {
    const angle = (index * angleStep) - (Math.PI / 2);
    const x2 = radarCenter.x + radarRadius * Math.cos(angle);
    const y2 = radarCenter.y + radarRadius * Math.sin(angle);
    return { x2, y2, angle, label: radarData[index].label };
  });

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 shadow-sm">
      <h3 className="font-semibold text-black text-sm">Risk</h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Phase Risk Prediction - Line Chart */}
        <div className="border border-white rounded p-3">
          <div className="text-xs text-gray-600 mb-2">Phase Risk Prediction</div>
          <svg viewBox="0 0 170 70" className="w-full h-24" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines (horizontal dotted) */}
            {[0, 2, 4, 6, 8, 10, 12].map(value => {
              const y = convertToSVG(value, 12, 60, 5);
              return (
                <line
                  key={value}
                  x1="15"
                  y1={y}
                  x2="160"
                  y2={y}
                  stroke="#E5E5E5"
                  strokeWidth="0.5"
                  strokeDasharray="2,2"
                />
              );
            })}
            
            {/* Y-axis labels */}
            {[0, 2, 4, 6, 8, 10, 12].map(value => {
              const y = convertToSVG(value, 12, 60, 5);
              return (
                <text
                  key={value}
                  x="10"
                  y={y + 3}
                  textAnchor="end"
                  fontSize="7"
                  fill="#666"
                >
                  {value}
                </text>
              );
            })}

            {/* X-axis labels */}
            <text x="45" y="68" textAnchor="middle" fontSize="7" fill="#666">
              Phase 2
            </text>
            <text x="135" y="68" textAnchor="middle" fontSize="7" fill="#666">
              Phase 4
            </text>

            {/* Light gray line */}
            <path
              d={lightGrayPath}
              fill="none"
              stroke="#D3D3D3"
              strokeWidth="2"
            />

            {/* Magenta/purple line */}
            <path
              d={magentaPath}
              fill="none"
              stroke="#9c3aa6"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Lane Historic Data (RCA) - Radar Chart */}
        <div className="border border-white rounded p-3">
          <div className="text-xs text-gray-600 mb-2 text-center">Lane Historic Data (RCA)</div>
          <svg viewBox="0 0 140 140" className="w-full h-28 mx-auto" preserveAspectRatio="xMidYMid meet">
            {/* Grid polygons (concentric circles) */}
            {gridLevels.map((level) => {
              if (level === 0) return null;
              const radius = (level / maxRadarValue) * radarRadius;
              const points = axisLines.map(axis => {
                const x = radarCenter.x + radius * Math.cos(axis.angle);
                const y = radarCenter.y + radius * Math.sin(axis.angle);
                return `${x},${y}`;
              }).join(' ');
              
              return (
                <polygon
                  key={level}
                  points={points}
                  fill="none"
                  stroke="#E5E5E5"
                  strokeWidth="0.5"
                />
              );
            })}

            {/* Axis lines (spokes) */}
            {axisLines.map((axis, idx) => (
              <line
                key={idx}
                x1={radarCenter.x}
                y1={radarCenter.y}
                x2={axis.x2}
                y2={axis.y2}
                stroke="#E5E5E5"
                strokeWidth="0.5"
              />
            ))}

            {/* Scale labels on one axis (Infrastruc) */}
            {gridLevels.slice(1).map((level) => {
              const radius = (level / maxRadarValue) * radarRadius;
              const angle = axisLines[1].angle; // Infrastruc axis
              const x = radarCenter.x + radius * Math.cos(angle) + 3;
              const y = radarCenter.y + radius * Math.sin(angle) + 3;
              return (
                <text
                  key={level}
                  x={x}
                  y={y}
                  fontSize="7"
                  fill="#666"
                >
                  {level}
                </text>
              );
            })}

            {/* Data polygon */}
            <polygon
              points={radarPolygonPoints}
              fill="rgba(156, 58, 166, 0.15)"
              stroke="#9c3aa6"
              strokeWidth="1.5"
            />

            {/* Category labels */}
            {radarPoints.map((point, idx) => {
              const labelRadius = radarRadius + 18;
              const labelX = radarCenter.x + labelRadius * Math.cos(point.angle);
              const labelY = radarCenter.y + labelRadius * Math.sin(point.angle);
              
              return (
                <text
                  key={idx}
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="7"
                  fill="#666"
                  fontWeight="400"
                >
                  {point.label}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}


