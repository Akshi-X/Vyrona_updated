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

  const strokeWidth =  9;
  const radius= 75;
  
  // For semi-circle, we use half the circumference
  const circumference = Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${radius * 2 + strokeWidth} ${radius + strokeWidth}`}
      >
        {/* Background semi-circle */}
        <path
          d={`M ${strokeWidth / 2} ${radius + strokeWidth / 2} A ${radius} ${radius} 0 0 1 ${radius * 2 + strokeWidth / 2} ${radius + strokeWidth / 2}`}
          fill="none"
          stroke="#f0f0f0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress semi-circle - starts from left and goes clockwise */}
        <path
          d={`M ${strokeWidth / 2} ${radius + strokeWidth / 2} A ${radius} ${radius} 0 0 1 ${radius * 2 + strokeWidth / 2} ${radius + strokeWidth / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
    </div>
  );
};
