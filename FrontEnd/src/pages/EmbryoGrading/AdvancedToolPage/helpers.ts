import { useCallback, useRef, useState } from 'react';
import type { IvfCycleLog, IvfGrade, IvfImage } from '../../../services/ivfService';
import type { OoState } from './types';

// Mirrors the allowlist the upload endpoint enforces.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The three annotation images shown alongside the source. Accents follow the
 * segmentation palette the model paints with.
 */
export const ANNOT_VIEWS: { label: string; tint: string; url: (i?: IvfImage) => string | null | undefined }[] = [
  { label: 'Expansion', tint: '#ff0078', url: i => i?.exp_img_url },
  { label: 'ICM', tint: '#00ff5a', url: i => i?.icm_img_url },
  { label: 'TE', tint: '#00c8ff', url: i => i?.te_img_url },
];

const FRAG_LABEL: Record<string, string> = {
  '1': 'Grade 1 (<10%)', '2': 'Grade 2 (10–20%)', '3': 'Grade 3 (20–30%)',
  '4': 'Grade 4 (30–50%)', '5': 'Grade 5 (>50%)',
};

export const FRAG_PCT: Record<string, string> = {
  '1': '<10%', '2': '10–20%', '3': '20–30%', '4': '30–50%', '5': '>50%',
};

export function parseDay3(grade: string | null): { cells: string | null; frag: string | null } {
  if (!grade) return { cells: null, frag: null };
  const m = grade.match(/^(\d+)\s*C\s*(\d+)/i);
  if (!m) return { cells: null, frag: null };
  return { cells: `${m[1]} cells`, frag: FRAG_LABEL[m[2]] ?? `Grade ${m[2]}` };
}

/**
 * A grade row is created before its inference runs, so a run killed outright
 * (browser closed, host stopped) can leave rows carrying neither a result nor an
 * image. They are not worth showing.
 */
export function isUsableGrade(g: IvfGrade): boolean {
  return g.is_active !== false && (g.images.length > 0 || g.grade != null);
}

/**
 * Column count for a `repeat(auto-fill, minmax(minPx, 1fr))` grid, tracked
 * live off the container's own width so callers can pad the last row out to
 * a full line instead of leaving it short.
 */
export function useElementColumns(minPx: number, gapPx: number): [(el: HTMLDivElement | null) => void, number] {
  const [columns, setColumns] = useState(1);
  const roRef = useRef<ResizeObserver | null>(null);
  // A callback ref (not a plain useRef+effect) so the observer attaches the
  // moment this grid actually mounts, even when that happens well after the
  // component's own mount — e.g. once an async fetch populates the list.
  const setRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setColumns(Math.max(1, Math.floor((entry.contentRect.width + gapPx) / (minPx + gapPx))));
    });
    ro.observe(el);
    roRef.current = ro;
  }, [minPx, gapPx]);
  return [setRef, columns];
}

export function ooState(log: IvfCycleLog): OoState {
  if (log.blast_grade) return 'final';
  if ((log.grade_count ?? 0) > 0) return 'ai';
  return 'none';
}

export const gradeTextCls = (grade: string) => {
  const icmTe = grade.slice(1);
  if (grade.startsWith('5') && icmTe === 'AA') return 'text-primary';
  if (icmTe === 'AA') return 'text-emerald-600';
  if (icmTe === 'AB' || icmTe === 'BA') return 'text-amber-600';
  if (icmTe === 'BB') return 'text-orange-500';
  return 'text-gray-700';
};

export const gradeQuality = (grade: string) => {
  if (!grade) return 'Awaiting grade';
  const icmTe = grade.slice(1);
  if (icmTe === 'AA') return 'Excellent quality';
  if (icmTe === 'AB' || icmTe === 'BA') return 'Good quality';
  if (icmTe === 'BB') return 'Fair quality';
  return 'Graded';
};

export const flagBadgeCls = (val: string) => {
  if (val === 'None') return 'bg-gray-100 border border-gray-300 text-gray-600';
  if (['Not Hatched', 'Intact', 'Good', 'Fine', 'Excellent'].includes(val)) return 'bg-primary/10 border border-primary/20 text-primary';
  if (['Minimal', 'Mild'].includes(val)) return 'bg-amber-50 border border-amber-200 text-amber-700';
  return 'bg-gray-50 border border-gray-200 text-gray-600';
};

// Backend IVF timestamps are UTC stored in naive columns, so they serialize
// without an offset — JS would otherwise parse them as local time.
export function parseUtc(iso?: string | null): Date {
  if (!iso) return new Date();
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

export function fmtTime(iso?: string | null): string {
  const d = parseUtc(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - d.getTime()) / 86400000) + 1;
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
