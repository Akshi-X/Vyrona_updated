

export default function MockQualityTrackingChart() {
  return (
    <div className="h-full w-full flex items-center justify-center text-gray-400">
      {/* Simple placeholder that visually mimics the chart area */}
      <svg className="w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#6b1176"
          strokeWidth="3"
          points="0,80 40,50 80,60 120,30 160,40 200,20"
        />
      </svg>
      <span className="absolute">Mock KPI Chart</span>
    </div>
  );
}