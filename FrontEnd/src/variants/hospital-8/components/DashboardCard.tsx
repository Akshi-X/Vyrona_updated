import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type CardAccent = 'purple' | 'blue' | 'indigo' | 'magenta' | 'aqua' | 'violet' | 'plum';

const ACCENT: Record<CardAccent, {
  blobA: string;
  blobB: string;
  border: string;
  accentColor: string;
}> = {
  purple: {
    blobA: 'rgba(192, 132, 252, 0.38)',
    blobB: 'rgba(154, 58, 208, 0.20)',
    border: 'rgba(192, 132, 252, 0.35)',
    accentColor: '#9a3ad0',
  },
  blue: {
    blobA: 'rgba(111, 147, 245, 0.38)',
    blobB: 'rgba(74, 100, 223, 0.20)',
    border: 'rgba(111, 147, 245, 0.35)',
    accentColor: '#4a64df',
  },
  indigo: {
    blobA: 'rgba(154, 122, 242, 0.38)',
    blobB: 'rgba(109, 74, 224, 0.20)',
    border: 'rgba(154, 122, 242, 0.35)',
    accentColor: '#6d4ae0',
  },
  magenta: {
    blobA: 'rgba(217, 111, 224, 0.38)',
    blobB: 'rgba(181, 60, 192, 0.20)',
    border: 'rgba(217, 111, 224, 0.35)',
    accentColor: '#b53cc0',
  },
  aqua: {
    blobA: 'rgba(79, 214, 232, 0.38)',
    blobB: 'rgba(59, 158, 240, 0.20)',
    border: 'rgba(79, 214, 232, 0.35)',
    accentColor: '#3b9ef0',
  },
  violet: {
    blobA: 'rgba(176, 107, 240, 0.38)',
    blobB: 'rgba(139, 58, 214, 0.20)',
    border: 'rgba(176, 107, 240, 0.35)',
    accentColor: '#8b3ad6',
  },
  plum: {
    blobA: 'rgba(205, 122, 214, 0.38)',
    blobB: 'rgba(171, 68, 184, 0.20)',
    border: 'rgba(205, 122, 214, 0.35)',
    accentColor: '#ab44b8',
  },
};

interface DashboardCardProps {
  accent?: CardAccent;
  watermark?: LucideIcon;
  watermarkPosition?: 'bottom-right' | 'top-right';
  onClick?: () => void;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  accent = 'purple',
  watermark: Watermark,
  watermarkPosition = 'bottom-right',
  onClick,
  className = '',
  contentClassName = 'p-4',
  children,
}) => {
  const a = ACCENT[accent];
  const clickable = typeof onClick === 'function';

  const watermarkPositionClass = watermarkPosition === 'top-right'
    ? 'absolute right-3 top-3'
    : 'absolute -right-3 -bottom-3';

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={[
        'relative overflow-hidden rounded-2xl shadow-lg card-hover-pulse bg-white',
        clickable ? 'cursor-pointer hover:shadow-xl' : '',
        className,
      ].join(' ')}
      style={{ border: `1px solid ${a.border}` }}
    >
      {/* Ambient radial glow — bottom-left */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-14%',
          left: '-8%',
          width: 210,
          height: 210,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${a.blobA} 0%, transparent 68%)`,
          filter: 'blur(34px)',
          opacity: 0.5,
        }}
      />
      {/* Ambient radial glow — top-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-20%',
          right: '3%',
          width: 170,
          height: 170,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${a.blobB} 0%, transparent 65%)`,
          filter: 'blur(28px)',
          opacity: 0.5,
        }}
      />

      {/* Watermark icon — tinted with accent color */}
      {Watermark && (
        <Watermark
          aria-hidden
          className={`${watermarkPositionClass} opacity-[0.14] pointer-events-none`}
          style={{ color: a.accentColor }}
          size={104}
          strokeWidth={1.5}
        />
      )}

      <div className={`relative h-full z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
};

export default DashboardCard;
