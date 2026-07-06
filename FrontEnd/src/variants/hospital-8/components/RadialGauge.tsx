import React from 'react';

interface RadialGaugeProps {
  value: number;
  caption?: string;
  color?: string;
  track?: string;
  size?: number;
}

const RadialGauge: React.FC<RadialGaugeProps> = ({
  value,
  caption,
  color = '#6b1176',
  track = '#E9D5FF',
  size = 92,
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const bg = `conic-gradient(from -90deg, ${color} ${pct}%, ${track} ${pct}% 100%)`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full" style={{ background: bg }} />
      <div
        className="absolute rounded-full bg-white flex flex-col items-center justify-center"
        style={{ inset: size * 0.16 }}
      >
        <p className="font-extrabold text-gray-900 leading-none" style={{ fontSize: size * 0.24 }}>
          {pct}%
        </p>
        {caption && (
          <p className="text-gray-400 mt-0.5 font-semibold" style={{ fontSize: size * 0.1 }}>
            {caption}
          </p>
        )}
      </div>
    </div>
  );
};

export default RadialGauge;
