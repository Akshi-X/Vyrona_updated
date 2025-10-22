import React from 'react';

interface CurveBarProps {
  percentage: number;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CurveBar: React.FC<CurveBarProps> = ({ 
  percentage, 
  color, 
  size = 'md',
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-[120px] h-[60px]',
    md: 'w-[185px] h-[92px]',
    lg: 'w-[240px] h-[120px]'
  };

  const strokeWidth = size === 'sm' ? 8 : size === 'md' ? 12 : 16;
  const radius = size === 'sm' ? 50 : size === 'md' ? 75 : 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${radius * 2 + strokeWidth} ${radius + strokeWidth}`}
      >
        {/* Background circle */}
        <circle
          cx={radius + strokeWidth / 2}
          cy={radius + strokeWidth / 2}
          r={radius}
          fill="none"
          stroke="#f0f0f0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress circle - starts from left (9 o'clock) and goes clockwise */}
        <circle
          cx={radius + strokeWidth / 2}
          cy={radius + strokeWidth / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
          transform={`rotate(-90 ${radius + strokeWidth / 2} ${radius + strokeWidth / 2})`}
        />
      </svg>
    </div>
  );
};
