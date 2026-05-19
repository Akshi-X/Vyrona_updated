import type { ReactNode } from 'react';

interface TooltipProps {
  text?: string;
  content?: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom';
}

export default function Tooltip({ text, content, children, placement = 'top' }: TooltipProps) {
  if (!text && !content) return <>{children}</>;

  const isTop = placement === 'top';
  const body = content ?? <p className="font-semibold text-black text-xs whitespace-nowrap">{text}</p>;

  return (
    <div className="relative group">
      {children}
      <div
        className={`absolute ${isTop ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 px-3 py-2 bg-white border border-line rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50`}
      >
        {body}
        {isTop ? (
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
        ) : (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-border" />
        )}
      </div>
    </div>
  );
}
