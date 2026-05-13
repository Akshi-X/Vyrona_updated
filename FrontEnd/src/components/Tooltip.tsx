import type { ReactNode } from 'react';

interface TooltipProps {
  text?: string;
  children: ReactNode;
  placement?: 'top' | 'bottom';
}

export default function Tooltip({ text, children, placement = 'top' }: TooltipProps) {
  if (!text) return <>{children}</>;

  const isTop = placement === 'top';

  return (
    <div className="relative group">
      {children}
      <div
        className={`absolute ${isTop ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50`}
      >
        <p className="font-semibold text-black text-xs whitespace-nowrap">{text}</p>
        {isTop ? (
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#E7E1E1]" />
        ) : (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]" />
        )}
      </div>
    </div>
  );
}
