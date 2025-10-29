import React from 'react';

export default function QualityTrackingChart() {
  // Placeholder sparkline-style chart using SVG to match simple preview; replace with real chart lib later
  return (
    <div className="w-full h-48 bg-white">
      <svg viewBox="0 0 400 150" className="w-full h-full">
        <polyline
          fill="none"
          stroke="#9c3aa6"
          strokeWidth="2"
          points="0,90 40,80 80,95 120,70 160,85 200,75 240,95 280,60 320,80 360,65 400,90"
        />
        <polyline
          fill="none"
          stroke="#7bc0ff"
          strokeWidth="2"
          points="0,100 40,95 80,110 120,85 160,95 200,90 240,110 280,75 320,92 360,80 400,105"
        />
      </svg>
    </div>
  );
}


