import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ivfService, type IvfCycleWithLogs, type IvfGrade } from '../../services/ivfService';

export interface EmbryoMorphology {
  hatching: string;
  zonaPellucida: string;
  blastocoelQuality: string;
  expInference: string;
  icmInference: string;
  teInference: string;
}

export interface LeaderboardImage { url: string; grade: string; score: number; morphology: EmbryoMorphology }

export interface LeaderboardEmbryo {
  id: string;
  oocyteNo: number;
  time: string;
  aiScore: number;
  grade: string;
  quality: string;
  rank: number;
  src: string;
  images: LeaderboardImage[];
  morphology: EmbryoMorphology;
}

// Backend IVF timestamps are UTC stored in naive columns, so they serialize
// without an offset — JS would otherwise parse them as local time.
export function parseUtc(iso?: string | null): Date | null {
  if (!iso) return null;
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

export function toMorphology(g: IvfGrade): EmbryoMorphology {
  const qf = g.quality_flags ?? {};
  return {
    hatching: qf.hatching ?? '—',
    zonaPellucida: qf.zona_pellucida ?? '—',
    blastocoelQuality: qf.blastocoel ?? '—',
    expInference: g.exp_inference ?? 'No expansion inference recorded.',
    icmInference: g.icm_inference ?? 'No ICM inference recorded.',
    teInference: g.te_inference ?? 'No TE inference recorded.',
  };
}

export function qualityLabel(score: number): string {
  if (score >= 8) return 'High Quality';
  if (score >= 6) return 'Good Quality';
  return 'Low Quality';
}

export function isUsableGrade(g: IvfGrade): boolean {
  return g.is_active !== false && g.grade != null && g.images.length > 0 && !!g.images[0].upload_image_url;
}

export function gradeCls(grade: string) {
  if (!grade || grade.length < 2) return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' };
  const icmTe = grade.slice(1);
  if (icmTe === 'AA') return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (icmTe === 'AB' || icmTe === 'BA') return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  if (icmTe === 'BB') return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  return { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' };
}

export function scoreBarGradient(score: number): string {
  if (score >= 8) return 'linear-gradient(90deg,#34d399,#059669)';
  if (score >= 6) return 'linear-gradient(90deg,#fb923c,#ea580c)';
  return 'linear-gradient(90deg,#fb7185,#e11d48)';
}

export function scorePillStyle(score: number): CSSProperties {
  if (score >= 8) return { background: '#dcfce7', color: '#166534' };
  if (score >= 6) return { background: '#ffedd5', color: '#9a3412' };
  return { background: '#ffe4e6', color: '#9f1239' };
}

export function criticalStyle(val: string): { borderColor: string; background: string; color: string } {
  const v = val.toLowerCase();
  if (v === 'none' || v === 'not hatching') return { borderColor: '#10b981', background: '#f0fdf4', color: '#065f46' };
  if (v === 'minimal')                      return { borderColor: '#eab308', background: '#fefce8', color: '#713f12' };
  if (v === 'mild' || v === 'hatching')     return { borderColor: '#f59e0b', background: '#fffbeb', color: '#92400e' };
  if (v === 'moderate' || v === 'present')  return { borderColor: '#f97316', background: '#fff7ed', color: '#9a3412' };
  if (v === 'severe' || v === 'hatched')    return { borderColor: '#f43f5e', background: '#fff1f2', color: '#9f1239' };
  return { borderColor: '#d1d5db', background: '#f9fafb', color: '#374151' };
}

/**
 * Builds the ranked, per-oocyte grade leaderboard for a cycle — the same
 * pipeline the Compare page and the report's Embryo Grade Details section
 * both need, kept in one place so they never drift.
 */
export function useEmbryoGrades(cycle: IvfCycleWithLogs | null): { embryos: LeaderboardEmbryo[]; loading: boolean } {
  const [embryos, setEmbryos] = useState<LeaderboardEmbryo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cycle) { setEmbryos([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const graded = cycle.logs.filter(l => (l.grade_count ?? 0) > 0);
    const opuAt = parseUtc(cycle.opu_date);

    Promise.all(graded.map(async log => {
      const grades = (await ivfService.listGrades(cycle.cycle_id, log.log_id).catch(() => [] as IvfGrade[]))
        .filter(isUsableGrade);
      if (grades.length === 0) return null;

      // Re-running AI grading on the same upload leaves one row per attempt —
      // collapse attempts that landed on the same grade + score down to their
      // most recent run so the list reads as distinct results, not a log.
      const latestByResult = new Map<string, IvfGrade>();
      for (const g of grades) {
        const key = `${g.grade}::${g.ai_score}`;
        const existing = latestByResult.get(key);
        if (!existing || (parseUtc(g.created_at)?.getTime() ?? 0) > (parseUtc(existing.created_at)?.getTime() ?? 0)) {
          latestByResult.set(key, g);
        }
      }

      const sorted = Array.from(latestByResult.values()).sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
      const best = sorted.find(g => g.is_best) ?? sorted[0];
      const images: LeaderboardImage[] = sorted.map(g => ({
        url: g.images[0].upload_image_url,
        grade: g.grade!,
        score: g.ai_score ?? 0,
        morphology: toMorphology(g),
      }));
      const bestAt = parseUtc(best.created_at);
      const hours = opuAt && bestAt ? (bestAt.getTime() - opuAt.getTime()) / 3_600_000 : null;

      const embryo: LeaderboardEmbryo = {
        id: `EID ${cycle.cycle_id}.${log.oocyte_no}`,
        oocyteNo: log.oocyte_no,
        time: hours != null && hours > 0 ? `${hours.toFixed(2)} h` : '—',
        aiScore: best.ai_score ?? 0,
        grade: best.grade!,
        quality: qualityLabel(best.ai_score ?? 0),
        rank: 0,
        src: images[0].url,
        images,
        morphology: toMorphology(best),
      };
      return embryo;
    })).then(results => {
      if (cancelled) return;
      const built = results
        .filter((e): e is LeaderboardEmbryo => e !== null)
        .sort((a, b) => a.oocyteNo - b.oocyteNo)
        // Oocyte numbers are embryologist-entered and can start at 0 or have
        // gaps; the leaderboard relabels them 1..N for display purposes only.
        .map((e, i) => ({ ...e, oocyteNo: i + 1 }))
        .sort((a, b) => b.aiScore - a.aiScore)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      setEmbryos(built);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [cycle]);

  return { embryos, loading };
}
