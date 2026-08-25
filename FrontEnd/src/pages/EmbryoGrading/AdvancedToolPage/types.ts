export type Step = 'select' | 'upload' | 'processing' | 'result';
export type OoState = 'none' | 'ai' | 'final';

export interface ImageSlot { file: File; url: string; addedAt: number; }

// ── In-flight run, persisted so a refresh can rejoin it ───────────────────────

export interface MlRunImage {
  gradeId: number;
  imageUrl: string | null;  // null between createGrade and a successful upload
  fileName: string;
  fileSize: number;
  jobId?: number;  // the one analysis job for this image — segmentation + grading in one pass
  done?: boolean;  // the job completed; grading-service already persisted the result
  rejected?: string[];  // detector reasons; set (even empty) means the row was retired, never graded
}

/** Nothing left to do for this image — it either graded or the detector turned it down. */
export const isSettled = (im: MlRunImage) => !!im.done || !!im.rejected;

export interface MlRunRecord {
  v: 1;
  his: string;
  cycleId: number;
  logId: number;
  oocyteNo: number;
  expected: number;  // slots at start; more than images.length means files were lost to a reload
  startedAt: number;
  images: MlRunImage[];
}

const ML_RUN_KEY = 'ivf_ml_run_v1';
// sessionStorage dies with the tab; this only guards against session restore
// resurrecting a record whose jobs are long gone.
const ML_RUN_MAX_AGE_MS = 30 * 60 * 1000;

export function readMlRun(): MlRunRecord | null {
  try {
    const raw = sessionStorage.getItem(ML_RUN_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as MlRunRecord;
    if (rec?.v !== 1 || Date.now() - rec.startedAt > ML_RUN_MAX_AGE_MS) {
      sessionStorage.removeItem(ML_RUN_KEY);
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

export function writeMlRun(rec: MlRunRecord): void {
  try { sessionStorage.setItem(ML_RUN_KEY, JSON.stringify(rec)); } catch { /* quota or private mode */ }
}

export function clearMlRun(): void {
  try { sessionStorage.removeItem(ML_RUN_KEY); } catch { /* nothing to clear */ }
}

export type MlPhase = 'upload' | 'analyse';

export const UPLOAD_BAND = 15;

/**
 * Overall progress, derived purely from the record so a resumed run reports the
 * same number a fresh one would at the same point.
 */
export function mlProgressFor(rec: MlRunRecord, index: number, phase: MlPhase, within: number): number {
  const total = Math.max(1, rec.expected);
  if (phase === 'upload') return Math.round((UPLOAD_BAND * (index + within / 100)) / total);
  return Math.round(UPLOAD_BAND + ((100 - UPLOAD_BAND) * (index + within / 100)) / total);
}

export const PHASE_LABEL: Record<MlPhase, string> = {
  upload: 'Uploading images',
  analyse: 'Analyzing embryo',
};

/** One sentence naming the files the detector turned down. */
export function rejectionMessage(rejected: MlRunImage[]): string {
  const names = rejected.map(im => im.fileName).filter(Boolean).join(', ');
  if (!names) return `No embryo detected in ${rejected.length} image${rejected.length > 1 ? 's' : ''} — not graded.`;
  return rejected.length === 1
    ? `No embryo detected in ${names} — it was not graded.`
    : `No embryo detected in ${names} — they were not graded.`;
}
