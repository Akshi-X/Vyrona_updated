import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface FloatingSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  /** 'default' — compact, primary-tinted (matches the app's inline field selects).
   *  'outline' — gray-bordered, matches the branch/tank pickers in TrackCanisterModal. */
  variant?: 'default' | 'outline';
}

const TRIGGER_VARIANT_CLS: Record<NonNullable<FloatingSelectProps['variant']>, string> = {
  default: 'border-primary/20 bg-primary/[0.04]',
  outline: 'border-gray-300 bg-white shadow-sm hover:border-primary-light',
};

/**
 * Same floating-panel dropdown idiom used in TrackCanisterModal (portal-rendered
 * option list, click-outside to close, repositions on resize/scroll) — extracted
 * here so it can be reused without copy-pasting the trigger/panel wiring per field.
 */
export default function FloatingSelect({ value, onChange, options, placeholder = '—', variant = 'default' }: FloatingSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number; placement: 'bottom' | 'top' } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const maxHeight = 176;
    const availableBelow = window.innerHeight - rect.bottom - margin;
    const availableAbove = rect.top - margin;
    const placement: 'bottom' | 'top' =
      availableBelow < Math.min(200, maxHeight) && availableAbove > availableBelow ? 'top' : 'bottom';
    const top = placement === 'bottom' ? rect.bottom + margin : rect.top - margin;
    setMenuStyle({ top, left: rect.left, width: rect.width, placement });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateMenuPosition]);

  return (
    <div className="relative" ref={triggerRef}>
      <div
        className={`relative min-w-[100px] border rounded-md pl-2 pr-5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${TRIGGER_VARIANT_CLS[variant]}`}
        onClick={() => { if (!isOpen) updateMenuPosition(); setIsOpen(v => !v); }}
        role="button" tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isOpen) updateMenuPosition(); setIsOpen(v => !v); }
          if (e.key === 'Escape') setIsOpen(false);
        }}
      >
        <span className={`block truncate ${value ? (variant === 'default' ? 'text-primary' : 'text-black') : 'text-gray-400'}`}>{value || placeholder}</span>
        <svg className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isOpen && menuStyle && createPortal(
        <div ref={menuRef} className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-xs"
          style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width, transform: menuStyle.placement === 'top' ? 'translateY(-100%)' : undefined }}>
          <div className={`px-2.5 py-1 cursor-pointer hover:bg-primary-light hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${!value ? 'bg-primary-light text-white' : 'text-black'}`}
            onClick={() => { onChange(''); setIsOpen(false); }}>
            {placeholder}
          </div>
          {options.map(o => (
            <div key={o}
              className={`px-2.5 py-1 cursor-pointer hover:bg-primary-light hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${value === o ? 'bg-primary-light text-white' : 'text-black'}`}
              onClick={() => { onChange(o); setIsOpen(false); }}>
              {o}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
