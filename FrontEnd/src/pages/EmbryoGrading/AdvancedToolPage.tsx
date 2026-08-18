import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Brain, ChevronDown, ArrowLeft, ArrowRight, Check, CheckCircle2,
  UploadCloud, Trash2, Sun, Contrast, Monitor, FileText, Sparkles,
  RefreshCw, User, ImageIcon, X, Sparkle, ZoomIn, ZoomOut, Maximize2, Move,
  Droplet, ClipboardCheck, Grid2x2, Percent, Shield,
  Award, Info, CircleDashed, CircleDot, Pencil, Camera, Syringe, Tag,
} from 'lucide-react';
import type { IVFTreatment } from '../../types/ivf';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  ivfService, MlNoEmbryoError,
  type IvfCycle, type IvfCycleLog, type IvfGrade, type IvfImage,
  type MlJobEvent,
} from '../../services/ivfService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'select' | 'upload' | 'processing' | 'result';
type OoState = 'none' | 'ai' | 'final';
/**
 * The three annotation images shown alongside the source. Accents follow the
 * segmentation palette the model paints with.
 */
const ANNOT_VIEWS: { label: string; tint: string; url: (i?: IvfImage) => string | null | undefined }[] = [
  { label: 'Expansion', tint: '#ff0078', url: i => i?.exp_img_url },
  { label: 'ICM', tint: '#00ff5a', url: i => i?.icm_img_url },
  { label: 'TE', tint: '#00c8ff', url: i => i?.te_img_url },
];

interface AdvancedEmbryoRouteState { embryo?: IVFTreatment; savedEditingLogId?: number | null; }
interface ImageSlot { file: File; url: string; addedAt: number; }

// ── In-flight run, persisted so a refresh can rejoin it ───────────────────────

interface MlRunImage {
  gradeId: number;
  imageUrl: string | null;  // null between createGrade and a successful upload
  fileName: string;
  fileSize: number;
  jobId?: number;  // the one analysis job for this image — segmentation + grading in one pass
  done?: boolean;  // the job completed; grading-service already persisted the result
  rejected?: string[];  // detector reasons; set (even empty) means the row was retired, never graded
}

/** Nothing left to do for this image — it either graded or the detector turned it down. */
const isSettled = (im: MlRunImage) => !!im.done || !!im.rejected;

interface MlRunRecord {
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

function readMlRun(): MlRunRecord | null {
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

function writeMlRun(rec: MlRunRecord): void {
  try { sessionStorage.setItem(ML_RUN_KEY, JSON.stringify(rec)); } catch { /* quota or private mode */ }
}

function clearMlRun(): void {
  try { sessionStorage.removeItem(ML_RUN_KEY); } catch { /* nothing to clear */ }
}

type MlPhase = 'upload' | 'analyse';

const UPLOAD_BAND = 15;

/**
 * Overall progress, derived purely from the record so a resumed run reports the
 * same number a fresh one would at the same point.
 */
function mlProgressFor(rec: MlRunRecord, index: number, phase: MlPhase, within: number): number {
  const total = Math.max(1, rec.expected);
  if (phase === 'upload') return Math.round((UPLOAD_BAND * (index + within / 100)) / total);
  return Math.round(UPLOAD_BAND + ((100 - UPLOAD_BAND) * (index + within / 100)) / total);
}

const PHASE_LABEL: Record<MlPhase, string> = {
  upload: 'Uploading images',
  analyse: 'Analyzing embryo',
};

/** One sentence naming the files the detector turned down. */
function rejectionMessage(rejected: MlRunImage[]): string {
  const names = rejected.map(im => im.fileName).filter(Boolean).join(', ');
  if (!names) return `No embryo detected in ${rejected.length} image${rejected.length > 1 ? 's' : ''} — not graded.`;
  return rejected.length === 1
    ? `No embryo detected in ${names} — it was not graded.`
    : `No embryo detected in ${names} — they were not graded.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FRAG_LABEL: Record<string, string> = {
  '1': 'Grade 1 (<10%)', '2': 'Grade 2 (10–20%)', '3': 'Grade 3 (20–30%)',
  '4': 'Grade 4 (30–50%)', '5': 'Grade 5 (>50%)',
};

const FRAG_PCT: Record<string, string> = {
  '1': '<10%', '2': '10–20%', '3': '20–30%', '4': '30–50%', '5': '>50%',
};

function parseDay3(grade: string | null): { cells: string | null; frag: string | null } {
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
function isUsableGrade(g: IvfGrade): boolean {
  return g.is_active !== false && (g.images.length > 0 || g.grade != null);
}

/**
 * Column count for a `repeat(auto-fill, minmax(minPx, 1fr))` grid, tracked
 * live off the container's own width so callers can pad the last row out to
 * a full line instead of leaving it short.
 */
function useElementColumns(minPx: number, gapPx: number): [(el: HTMLDivElement | null) => void, number] {
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

function ooState(log: IvfCycleLog): OoState {
  if (log.blast_grade) return 'final';
  if ((log.grade_count ?? 0) > 0) return 'ai';
  return 'none';
}

const gradeTextCls = (grade: string) => {
  const icmTe = grade.slice(1);
  if (grade.startsWith('5') && icmTe === 'AA') return 'text-primary';
  if (icmTe === 'AA') return 'text-emerald-600';
  if (icmTe === 'AB' || icmTe === 'BA') return 'text-amber-600';
  if (icmTe === 'BB') return 'text-orange-500';
  return 'text-gray-700';
};

const gradeQuality = (grade: string) => {
  if (!grade) return 'Awaiting grade';
  const icmTe = grade.slice(1);
  if (icmTe === 'AA') return 'Excellent quality';
  if (icmTe === 'AB' || icmTe === 'BA') return 'Good quality';
  if (icmTe === 'BB') return 'Fair quality';
  return 'Graded';
};

const flagBadgeCls = (val: string) => {
  if (val === 'None') return 'bg-gray-100 border border-gray-300 text-gray-600';
  if (['Not Hatching', 'Intact', 'Good', 'Fine', 'Excellent'].includes(val)) return 'bg-primary/10 border border-primary/20 text-primary';
  if (['Minimal', 'Mild'].includes(val)) return 'bg-amber-50 border border-amber-200 text-amber-700';
  return 'bg-gray-50 border border-gray-200 text-gray-600';
};

// Backend IVF timestamps are UTC stored in naive columns, so they serialize
// without an offset — JS would otherwise parse them as local time.
function parseUtc(iso?: string | null): Date {
  if (!iso) return new Date();
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

function fmtTime(iso?: string | null): string {
  const d = parseUtc(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - d.getTime()) / 86400000) + 1;
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedEmbryoGradingPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const routeState = (location.state as AdvancedEmbryoRouteState) || {};

  // A run left in flight by a reload; read once so the first render already
  // shows the processing screen instead of flashing the oocyte grid.
  const [resumeRecord] = useState<MlRunRecord | null>(() => readMlRun());

  // The wizard position lives in the URL so a refresh (or a shared link) lands
  // back on the same oocyte instead of the picker. Keyed by log_id — oocyte_no
  // is only a per-cycle sequence number.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlLogId = Number(searchParams.get('log')) || null;
  const urlStep = searchParams.get('step');
  const urlGradeId = Number(searchParams.get('grade')) || null;

  // A reconnect shows its progress inline on the result page; only a fresh run
  // gets the full-screen processing step. A URL left mid-run (step=processing)
  // therefore comes back as the result page with its loading state.
  const [step, setStep] = useState<Step>(() => {
    if (resumeRecord) return 'result';
    if (!urlLogId) return 'select';
    if (urlStep === 'processing') return 'result';
    return urlStep === 'upload' || urlStep === 'result' ? urlStep : 'select';
  });

  const [cycle, setCycle] = useState<IvfCycle | null>(null);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [logs, setLogs] = useState<IvfCycleLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Resolved from urlLogId once the logs land.
  const [selectedOocyteNo, setSelectedOocyteNo] = useState<number | null>(() => resumeRecord?.oocyteNo ?? null);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [uploading, setUploading] = useState(false);

  const [existingGrades, setExistingGrades] = useState<IvfGrade[]>([]);
  const [selectedGradeIdx, setSelectedGradeIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [bestImages, setBestImages] = useState<Record<number, string>>({});
  const [mlProgress, setMlProgress] = useState(() => {
    if (!resumeRecord) return 0;
    const next = resumeRecord.images.findIndex(im => !isSettled(im));
    return mlProgressFor(resumeRecord, next < 0 ? resumeRecord.expected : next, 'analyse', 0);
  });
  const [mlStage, setMlStage] = useState(() => (resumeRecord ? 'Reconnecting to AI grading' : ''));
  const [mlError, setMlError] = useState<string | null>(null);
  const [skippedFiles, setSkippedFiles] = useState<string[]>(
    () => resumeRecord?.images.filter(im => im.rejected).map(im => im.fileName) ?? []);
  const [newGradeIds, setNewGradeIds] = useState<number[]>([]);
  const [activeGradeId, setActiveGradeId] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const retriedRef = useRef<Set<string>>(new Set());
  const resumeStartedRef = useRef(false);

  const selectedLog = logs.find(l => l.oocyte_no === selectedOocyteNo) ?? null;
  const resultGrade = existingGrades[selectedGradeIdx] ?? null;

  // ── Fetch cycle + logs ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!his) { setLogsLoading(false); return; }
    const detailHis = his.trim().toUpperCase();
    let cancelled = false;
    setLogsLoading(true);
    ivfService.listCycles({ his_id: detailHis }).then(async cycles => {
      if (cancelled) return;
      const matched = cycles.find(c => c.his_id.toUpperCase() === detailHis);
      if (!matched) { setLogsLoading(false); return; }
      setCycleId(matched.cycle_id);
      const full = await ivfService.getCycleWithLogs(matched.cycle_id);
      if (cancelled) return;
      setCycle(full);
      setLogs(full.logs);
      setLogsLoading(false);
      const targetLogId = urlLogId ?? routeState.savedEditingLogId;
      if (targetLogId != null && !resumeRecord) {
        const target = full.logs.find(l => l.log_id === targetLogId);
        if (target) setSelectedOocyteNo(target.oocyte_no);
        else {
          // Stale link — the step was already initialized from this same URL
          // at mount, so clearing the params alone would leave it stranded on
          // a screen that requires a selected oocyte that will never arrive.
          setStep('select');
          setSearchParams({}, { replace: true });
        }
      }
    }).catch(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [his]);

  // ── Best (or latest) graded image per oocyte, for the select cards ──────────

  useEffect(() => {
    if (cycleId == null) return;
    const graded = logs.filter(l => (l.grade_count ?? 0) > 0);
    if (graded.length === 0) return;
    let cancelled = false;
    Promise.all(graded.map(l =>
      ivfService.listGrades(cycleId, l.log_id)
        .then(gs => {
          const best = gs.filter(g => g.is_active).find(g => g.is_best);
          return [l.log_id, best?.images[0]?.upload_image_url ?? null] as const;
        })
        .catch(() => [l.log_id, null] as const)
    )).then(entries => {
      if (cancelled) return;
      setBestImages(Object.fromEntries(entries.filter(([, url]) => url) as [number, string][]));
    });
    return () => { cancelled = true; };
  }, [cycleId, logs]);

  // ── Image slots ─────────────────────────────────────────────────────────────

  const addImageSlot = (file: File) => {
    if (imageSlots.length >= 4) return;
    setImageSlots(prev => [...prev, { file, url: URL.createObjectURL(file), addedAt: Date.now() }]);
  };
  const removeImageSlot = (idx: number) => {
    setImageSlots(prev => { URL.revokeObjectURL(prev[idx].url); return prev.filter((_, i) => i !== idx); });
  };
  // Functional update so callbacks that hold this across a run still revoke the
  // slots that actually exist when it fires, not the ones captured at creation.
  const removeAllSlots = useCallback(() => {
    setImageSlots(prev => { prev.forEach(s => URL.revokeObjectURL(s.url)); return []; });
  }, []);

  const goUpload = (no: number) => {
    const log = logs.find(l => l.oocyte_no === no);
    setSelectedOocyteNo(no);
    setStep('upload');
    if (log) setSearchParams({ log: String(log.log_id), step: 'upload' }, { replace: true });
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
    clearMlRun();
    removeAllSlots();
    setStep('select');
    setSearchParams({}, { replace: true });
  };

  // ── Run grading (upload all → per image: analyse; grading-service persists) ─

  const report = useCallback((rec: MlRunRecord, index: number, phase: MlPhase, within: number) => {
    setMlProgress(mlProgressFor(rec, index, phase, within));
    setMlStage(rec.expected > 1
      ? `${PHASE_LABEL[phase]} (${index + 1}/${rec.expected})`
      : PHASE_LABEL[phase]);
    setActiveGradeId(rec.images[index]?.gradeId ?? null);
  }, []);

  /** Pull the log's grades back in, keeping whichever one is on screen selected. */
  const refreshGrades = useCallback(async (cid: number, logId: number, keepGradeId?: number | null) => {
    const gs = (await ivfService.listGrades(cid, logId)).filter(isUsableGrade);
    setExistingGrades(gs);
    if (keepGradeId != null) {
      const idx = gs.findIndex(g => g.grade_id === keepGradeId);
      if (idx >= 0) setSelectedGradeIdx(idx);
    }
    return gs;
  }, []);

  /**
   * Phase 1 — get every queued image into blob storage before any inference, so
   * the rest of the run survives a reload on nothing but persisted URLs.
   */
  const uploadPhase = useCallback(async (
    cid: number, logId: number, oocyteNo: number, hisId: string, slots: ImageSlot[],
  ): Promise<MlRunRecord> => {
    const rec: MlRunRecord = {
      v: 1, his: hisId, cycleId: cid, logId, oocyteNo,
      expected: slots.length, startedAt: Date.now(), images: [],
    };
    writeMlRun(rec);

    for (let i = 0; i < slots.length; i++) {
      report(rec, i, 'upload', 0);
      const created = await ivfService.createGradeWithImage(cid, logId, slots[i].file);
      rec.images.push({
        gradeId: created.grade_id,
        imageUrl: created.upload_image_url,
        fileName: created.file_name ?? slots[i].file.name,
        fileSize: created.file_size ?? slots[i].file.size,
      });
      writeMlRun(rec);
      report(rec, i, 'upload', 100);
    }
    return rec;
  }, [report]);

  /**
   * Attach to the job we already started for this image, or start one. A job
   * is re-triggered at most once so a job that keeps dying cannot loop
   * forever. Segmentation and grading run together in this one job, so once
   * it's started the image finishes fully graded whether or not anything
   * stays attached to it.
   */
  const runMlStep = useCallback(async (
    rec: MlRunRecord, i: number,
  ): Promise<MlJobEvent> => {
    const onEvent = (e: MlJobEvent) => report(rec, i, 'analyse', e.progress ?? 0);
    const signal = abortRef.current?.signal;
    const known = rec.images[i].jobId;

    if (known != null) {
      try {
        return await ivfService.attachMlJob(known, onEvent, signal);
      } catch (err) {
        if (signal?.aborted || err instanceof MlNoEmbryoError || retriedRef.current.has(`${i}`)) throw err;
        console.warn(`Re-running analysis for image ${i + 1}:`, err);
        retriedRef.current.add(`${i}`);
      }
    }

    // Safe to re-trigger: a new job writes fresh output blobs and a fresh row.
    return ivfService.streamMlJob(rec.images[i].imageUrl!, e => {
      if (e.status === 'queued' && e.job_id != null) {
        rec.images[i].jobId = e.job_id;
        writeMlRun(rec);
      }
      onEvent(e);
    }, signal);
  }, [report]);

  /** Phase 2 — everything comes from the record; component state may not be hydrated. */
  const processPhase = useCallback(async (rec: MlRunRecord): Promise<void> => {
    for (let i = 0; i < rec.images.length; i++) {
      const img = rec.images[i];
      if (isSettled(img)) continue;

      if (!img.imageUrl) {
        // Reload landed between createGrade and the upload — retire the empty row.
        await ivfService.updateGrade(rec.cycleId, img.gradeId, { is_active: false }).catch(() => { /* best effort */ });
        continue;
      }

      report(rec, i, 'analyse', 0);
      try {
        // grading-service writes the grade/image row itself as part of the job —
        // there is nothing left for the client to persist once this resolves.
        await runMlStep(rec, i);
      } catch (err) {
        if (!(err instanceof MlNoEmbryoError)) throw err;
        console.warn(`No embryo detected in ${img.fileName || `image ${i + 1}`}:`, err.reasons);
        // Recorded before the retire call so a reload mid-request still knows to skip it.
        img.rejected = err.reasons;
        writeMlRun(rec);
        await ivfService.updateGrade(rec.cycleId, img.gradeId, { is_active: false }).catch(() => { /* best effort */ });
        setSkippedFiles(prev => [...prev, img.fileName]);
        continue;
      }

      img.done = true;
      writeMlRun(rec);
      // Let the result screen fill this card in without waiting for the queue.
      await refreshGrades(rec.cycleId, rec.logId, img.gradeId).catch(() => { /* shown at the end anyway */ });
    }
  }, [report, runMlStep, refreshGrades]);

  const finishRun = useCallback(async (rec: MlRunRecord): Promise<void> => {
    setMlProgress(100);
    const refreshed = await ivfService.listGrades(rec.cycleId, rec.logId);
    const active = refreshed.filter(isUsableGrade);
    const graded = rec.images.filter(im => im.done);
    const rejected = rec.images.filter(im => im.rejected);
    const lost = rec.expected - rec.images.filter(isSettled).length;
    // Stay on the image this run just finished; the best one is only badged.
    // If it dropped out of `active` (e.g. retired concurrently), fall back to
    // best-graded rather than silently landing on an unrelated index 0.
    const lastDone = [...rec.images].reverse().find(im => im.done);
    let idx = lastDone ? active.findIndex(g => g.grade_id === lastDone.gradeId) : -1;
    if (idx < 0) {
      idx = active.findIndex(g => g.is_best);
      if (idx < 0) idx = active.reduce((bi, g, i, arr) => (g.ai_score ?? -1) > (arr[bi].ai_score ?? -1) ? i : bi, 0);
    }
    idx = Math.max(0, idx);

    const notes = [
      rejected.length > 0 ? rejectionMessage(rejected) : null,
      lost > 0 ? `${lost} image(s) could not be graded after the page reloaded` : null,
    ].filter((n): n is string => n !== null);
    // Nothing from this run survived — the result screen would have nothing of
    // its own to show, so send them back to pick better images.
    const backToUpload = graded.length === 0 && rejected.length > 0;

    setNewGradeIds(graded.map(im => im.gradeId));
    setExistingGrades(active);
    setSelectedGradeIdx(idx);
    setMlError(notes.length > 0 ? notes.join(' ') : null);
    clearMlRun();
    removeAllSlots();
    if (rejected.length > 0 && !backToUpload) toast.error(rejectionMessage(rejected));
    setStep(backToUpload ? 'upload' : 'result');
    setSearchParams(backToUpload
      ? { log: String(rec.logId), step: 'upload' }
      : {
        log: String(rec.logId), step: 'result',
        ...(active[idx] ? { grade: String(active[idx].grade_id) } : {}),
      }, { replace: true });
  }, [removeAllSlots, setSearchParams]);

  /**
   * A grade row is created before its inference runs, so a run that dies partway
   * leaves rows with no grade and no image. Retire them or they show up as blank
   * cards on the result screen forever.
   */
  const retireIncomplete = useCallback(async (rec: MlRunRecord | null) => {
    if (!rec) return;
    await Promise.all(rec.images.filter(im => !isSettled(im)).map(im =>
      ivfService.updateGrade(rec.cycleId, im.gradeId, { is_active: false })
        .catch(() => { /* best effort — the row is already junk */ })));
  }, []);

  const runGrading = useCallback(async () => {
    if (selectedOocyteNo == null || cycleId == null || !selectedLog || !his || imageSlots.length === 0) return;
    abortRef.current = new AbortController();
    retriedRef.current = new Set();
    setUploading(true);
    setStep('processing');
    setMlError(null);
    setSkippedFiles([]);
    setMlProgress(0);
    setMlStage(PHASE_LABEL.upload);
    let rec: MlRunRecord | null = null;
    try {
      rec = await uploadPhase(cycleId, selectedLog.log_id, selectedOocyteNo, his.trim().toUpperCase(), imageSlots);
      await processPhase(rec);
      await finishRun(rec);
    } catch (err) {
      console.error('Grading failed:', err);
      await retireIncomplete(rec);
      clearMlRun();
      setMlError(err instanceof Error ? err.message : 'AI grading failed');
      setStep('upload');
    } finally {
      setUploading(false);
    }
  }, [selectedOocyteNo, cycleId, selectedLog, his, imageSlots, uploadPhase, processPhase, finishRun, retireIncomplete]);

  // ── Rejoin a run the reload interrupted ─────────────────────────────────────

  useEffect(() => {
    const rec = resumeRecord;
    if (!rec || resumeStartedRef.current || cycleId == null || logs.length === 0) return;

    if (rec.his !== his?.trim().toUpperCase() || rec.cycleId !== cycleId
      || !logs.some(l => l.log_id === rec.logId)) {
      // Belongs to a different patient or cycle — never write grades under this one.
      clearMlRun();
      setStep('select');
      return;
    }

    // StrictMode double-invokes effects; without this the jobs get attached twice.
    resumeStartedRef.current = true;
    abortRef.current = new AbortController();
    retriedRef.current = new Set();
    setUploading(true);
    setStep('result');

    // Show the half-finished grade straight away, then keep working behind it.
    const nextPending = rec.images.find(im => !isSettled(im))?.gradeId ?? null;
    setActiveGradeId(nextPending);
    setSearchParams({
      log: String(rec.logId), step: 'result',
      ...(nextPending ? { grade: String(nextPending) } : {}),
    }, { replace: true });

    refreshGrades(rec.cycleId, rec.logId, nextPending)
      .catch(() => { /* the run itself reports failures */ })
      .then(() => processPhase(rec))
      .then(() => finishRun(rec))
      .catch(async err => {
        if (abortRef.current?.signal.aborted) return;
        console.error('Resuming grading failed:', err);
        await retireIncomplete(rec);
        clearMlRun();
        setMlError(err instanceof Error ? err.message : 'AI grading failed');
        setStep('upload');
      })
      .finally(() => setUploading(false));
  }, [resumeRecord, cycleId, logs, his, processPhase, finishRun, retireIncomplete, refreshGrades, setSearchParams]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleApprove = async () => {
    if (!resultGrade || cycleId == null || !selectedLog) { navigate(his ? `/embryo-console/${his}` : '/embryo-console'); return; }
    setSaving(true);
    try {
      await ivfService.selectBestGrade(cycleId, selectedLog.log_id, resultGrade.grade_id);
      await ivfService.updateGrade(cycleId, resultGrade.grade_id, { is_completed: true, stage: 3 });
    } catch { /* non-blocking */ }
    finally { setSaving(false); }
    navigate(his ? `/embryo-console/${his}` : '/embryo-console');
  };

  const handleOverride = useCallback(async (gradeId: number, fields: Record<string, string>) => {
    if (cycleId == null) return;
    await ivfService.updateGrade(cycleId, gradeId, fields);
    setExistingGrades(prev => prev.map(g => g.grade_id === gradeId ? { ...g, ...fields } : g));
  }, [cycleId]);

  /** Soft-delete: retire the row so it drops out of isUsableGrade, then land on a valid index. */
  const handleDeleteGrade = useCallback(async (gradeId: number) => {
    if (cycleId == null || !selectedLog) return;
    await ivfService.updateGrade(cycleId, gradeId, { is_active: false });
    const gs = await refreshGrades(cycleId, selectedLog.log_id);
    const idx = Math.min(selectedGradeIdx, Math.max(0, gs.length - 1));
    setSelectedGradeIdx(idx);
    setSearchParams({
      log: String(selectedLog.log_id), step: 'result',
      ...(gs[idx] ? { grade: String(gs[idx].grade_id) } : {}),
    }, { replace: true });
  }, [cycleId, selectedLog, refreshGrades, selectedGradeIdx, setSearchParams]);

  // ── Skip upload → view existing grades ──────────────────────────────────────

  const skipToResult = useCallback(async () => {
    if (cycleId == null || !selectedLog) return;
    try {
      const gs = await ivfService.listGrades(cycleId, selectedLog.log_id);
      const active = gs.filter(isUsableGrade);
      // A grade id in the URL wins, so a restored link opens the same image.
      let idx = urlGradeId ? active.findIndex(g => g.grade_id === urlGradeId) : -1;
      if (idx < 0) {
        idx = active.findIndex(g => g.is_best);
        if (idx < 0) idx = active.reduce((bi, g, i, arr) => (g.ai_score ?? -1) > (arr[bi].ai_score ?? -1) ? i : bi, 0);
      }
      idx = Math.max(0, idx);
      setExistingGrades(active);
      setSelectedGradeIdx(idx);
      setNewGradeIds([]);
      removeAllSlots();
      setStep('result');
      setSearchParams({
        log: String(selectedLog.log_id), step: 'result',
        ...(active[idx] ? { grade: String(active[idx].grade_id) } : {}),
      }, { replace: true });
    } catch (err) {
      console.error('Skip failed:', err);
    }
  }, [cycleId, selectedLog, urlGradeId, removeAllSlots, setSearchParams]);

  /**
   * Re-run the model for a grade whose row and image survived but whose result
   * never landed — the interrupted run is unreachable, but its image is not.
   */
  const resumeGrade = useCallback(async (gradeId: number) => {
    if (cycleId == null || !selectedLog || !his) return;
    const target = existingGrades.find(g => g.grade_id === gradeId);
    const imageUrl = target?.images[0]?.upload_image_url;
    if (!imageUrl) return;

    abortRef.current = new AbortController();
    retriedRef.current = new Set();
    const rec: MlRunRecord = {
      v: 1, his: his.trim().toUpperCase(), cycleId, logId: selectedLog.log_id,
      oocyteNo: selectedLog.oocyte_no, expected: 1, startedAt: Date.now(),
      images: [{
        gradeId, imageUrl,
        fileName: target?.images[0]?.file_name ?? '',
        fileSize: target?.images[0]?.file_size ?? 0,
      }],
    };
    writeMlRun(rec);
    setUploading(true);
    setMlError(null);
    setSkippedFiles([]);
    setActiveGradeId(gradeId);
    try {
      await processPhase(rec);
      await finishRun(rec);
    } catch (err) {
      console.error('Re-running grading failed:', err);
      clearMlRun();
      setMlError(err instanceof Error ? err.message : 'AI grading failed');
    } finally {
      setUploading(false);
    }
  }, [cycleId, selectedLog, his, existingGrades, processPhase, finishRun]);

  /** Keep the URL pointing at whichever graded image is on screen. */
  const selectGradeIdx = useCallback((i: number) => {
    setSelectedGradeIdx(i);
    const g = existingGrades[i];
    if (!g || !selectedLog) return;
    setSearchParams({
      log: String(selectedLog.log_id), step: 'result', grade: String(g.grade_id),
    }, { replace: true });
  }, [existingGrades, selectedLog, setSearchParams]);

  // Point the URL at each grade as soon as its id exists, so a refresh at any
  // moment of a run comes back to that exact image rather than the picker.
  // react-router rebuilds setSearchParams whenever the params change, so writing
  // unconditionally here would re-trigger this effect on its own output.
  useEffect(() => {
    if (!uploading || activeGradeId == null || !selectedLog) return;
    const next = { log: String(selectedLog.log_id), step: 'processing', grade: String(activeGradeId) };
    const unchanged = (Object.keys(next) as (keyof typeof next)[])
      .every(k => searchParams.get(k) === next[k]);
    if (unchanged) return;
    setSearchParams(next, { replace: true });
  }, [uploading, activeGradeId, selectedLog, searchParams, setSearchParams]);

  // Restoring ?step=result from a refresh: the grades still have to be fetched.
  const resultRestoredRef = useRef(false);
  useEffect(() => {
    if (resultRestoredRef.current || resumeRecord) return;
    if ((urlStep !== 'result' && urlStep !== 'processing') || step !== 'result' || existingGrades.length > 0) return;
    if (cycleId == null || !selectedLog) return;
    resultRestoredRef.current = true;
    skipToResult();
  }, [urlStep, step, existingGrades.length, cycleId, selectedLog, resumeRecord, skipToResult]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {step === 'select' && (
        <SelectScreen
          cycle={cycle} his={his} logs={logs} loading={logsLoading} bestImages={bestImages}
          selectedOocyteNo={selectedOocyteNo} onSelect={setSelectedOocyteNo}
          onBack={() => navigate(`/embryo-console/${his}`)}
          onContinue={() => selectedOocyteNo != null && goUpload(selectedOocyteNo)}
        />
      )}

      {step === 'upload' && selectedLog && (
        <UploadScreen
          log={selectedLog} index={logs.findIndex(l => l.log_id === selectedLog.log_id)} cycleId={cycleId}
          imageSlots={imageSlots} onAdd={addImageSlot} onRemove={removeImageSlot} onRemoveAll={removeAllSlots}
          uploading={uploading} onCancel={cancelUpload} onStart={runGrading} onSkip={skipToResult}
          error={mlError}
        />
      )}

      {step === 'processing' && (
        <ProcessingScreen oocyteNo={selectedOocyteNo} progress={mlProgress} stage={mlStage}
          resumed={resumeRecord != null} skipped={skippedFiles} />
      )}

      {step === 'result' && selectedLog && (
        <ResultScreen
          log={selectedLog} cycle={cycle}
          grades={existingGrades} selectedIdx={selectedGradeIdx} onSelectIdx={selectGradeIdx}
          newGradeIds={newGradeIds}
          grade={resultGrade}
          saving={saving}
          onBack={() => { setStep('select'); setSearchParams({}, { replace: true }); }}
          onApprove={handleApprove} onOverride={handleOverride}
          pending={resultGrade && resultGrade.grade_id === activeGradeId
            ? { running: uploading, progress: mlProgress, stage: mlStage }
            : null}
          onResumeGrade={resumeGrade}
          onDeleteGrade={handleDeleteGrade}
        />
      )}
    </div>
  );
}

// ── Screen 1: Select oocyte ────────────────────────────────────────────────────

function WorkflowRail() {
  const steps = [
    { t: 'Select Oocyte', d: 'Choose the embryo/oocyte that requires grading.' },
    { t: 'Review Images', d: 'Verify that the uploaded images are clear and complete.' },
    { t: 'Start Grading', d: 'The AI analyzes expansion, ICM, and TE characteristics.' },
    { t: 'Review Result', d: 'Validate the suggested grade before saving.' },
  ];
  const baseImageSlotRef = useRef<HTMLDivElement>(null);
  const [baseImageFits, setBaseImageFits] = useState(true);

  useEffect(() => {
    const el = baseImageSlotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBaseImageFits(entry.contentRect.height >= 106);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col gap-0 pr-2 overflow-y-auto min-h-0">
      <div className="rounded-t-2xl overflow-hidden shrink-0">
        <img src="/bg_emb.png" alt="" className="w-full h-auto block" />
      </div>
      <div className="relative z-10 -mt-6 shrink-0 flex flex-col gap-4 rounded-2xl bg-[#F3EAF5] border border-primary/10 p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <img src="/microscope_icon.svg" alt="" className="h-6 w-auto shrink-0" />
            <h2 className="text-lg font-black text-primary leading-tight">Embryo Grading</h2>
          </div>
          <p className="text-[11px] text-gray-700 leading-relaxed">
            Grade embryos consistently using AI-assisted analysis. The system evaluates embryo images
            based on morphological features and helps standardize grading according to clinical guidelines.
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-primary" />
            <p className="text-[11px] font-bold text-primary">Workflow</p>
          </div>
          <div className="relative flex flex-col gap-4">
            {steps.map((s, i) => (
              <div key={s.t} className="relative flex gap-3">
                {i < steps.length - 1 && (
                  <div className="absolute left-3 top-6 -bottom-4 w-px bg-primary/15" />
                )}
                <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black z-10 text-white bg-primary">
                  {i + 1}
                </div>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <p className="text-[12px] font-bold leading-none text-gray-900">{s.t}</p>
                  <p className="text-[10px] text-gray-500 leading-snug">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            <FileText size={12} className="text-primary" />
            <p className="text-[11px] font-bold text-primary">Notes</p>
          </div>
          <ul className="flex flex-col gap-2">
            {['AI provides decision support only.', 'Final grading should always be confirmed by an embryologist.', 'High-quality images improve grading accuracy.'].map(n => (
              <li key={n} className="text-[10px] text-gray-700 leading-snug flex gap-2">
                <span className="w-1 h-1 rounded-full bg-primary/40 shrink-0 mt-1.5" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div ref={baseImageSlotRef} className="flex-1 min-h-0">
        {baseImageFits && (
          <img src="/microscope_baseimage.png" alt="" className="w-full h-full max-w-[220px] mx-auto object-contain object-bottom" />
        )}
      </div>
    </aside>
  );
}

function SelectScreen({ cycle, his, logs, loading, bestImages, selectedOocyteNo, onSelect, onBack, onContinue }: {
  cycle: IvfCycle | null; his?: string; logs: IvfCycleLog[]; loading: boolean;
  bestImages: Record<number, string>;
  selectedOocyteNo: number | null; onSelect: (no: number) => void;
  onBack: () => void; onContinue: () => void;
}) {
  return (
    <div className="flex gap-4 flex-1 min-h-0">
      <WorkflowRail />

      <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-2xl border border-line bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 shrink-0 px-5 pt-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Brain size={22} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-gray-800 leading-tight">What would you like to grade?</h1>
              <p className="text-xs text-gray-400 mt-0.5">Select an oocyte to start the AI-assisted embryo grading process.</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-line bg-surface text-xs font-semibold text-gray-700 shrink-0">
            <User size={13} className="text-primary" />
            Patient : {cycle?.patient_name || '—'} {his && <span className="text-gray-400">(ID: {his.toUpperCase()})</span>}
            <ChevronDown size={13} className="text-gray-400 ml-1" />
          </div>
        </div>

        {/* Grid */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto px-5 pb-1">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(n => <OocyteCardSkeleton key={n} />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><ImageIcon size={20} className="text-gray-300" /></div>
              <p className="text-sm font-semibold text-gray-400">No oocytes logged</p>
              <p className="text-[11px] text-gray-300">Add entries on the Development Tracker tab first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
              {logs.map((log, i) => (
                <OocyteCard key={log.log_id} log={log} index={i} bestImageUrl={bestImages[log.log_id] ?? null}
                  selected={selectedOocyteNo === log.oocyte_no} onSelect={() => onSelect(log.oocyte_no)} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line flex items-center justify-between shrink-0 bg-surface/40">
          <button type="button" onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
            <ArrowLeft size={14} /> Go back
          </button>
          <button type="button" onClick={onContinue} disabled={selectedOocyteNo == null}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--gradient-primary)' }}>
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonBar({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-200/90 ${className}`}>
      <div className="absolute -inset-y-4 inset-x-0 -skew-x-[20deg] bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />
    </div>
  );
}

function OocyteCardSkeleton() {
  return (
    <div className="rounded-2xl border-2 border-line bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <SkeletonBar className="h-3.5 w-20 rounded" />
        <SkeletonBar className="h-4 w-24 rounded-full" />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SkeletonBar className="h-2.5 w-14 rounded" />
            <SkeletonBar className="h-5 w-8 rounded-md" />
          </div>
        </div>
        <SkeletonBar className="w-16 h-16 rounded-full shrink-0" />
      </div>

      <div className="rounded-xl px-3 py-2.5 border border-gray-100 bg-gray-50 flex flex-col gap-2">
        <SkeletonBar className="h-2.5 w-24 rounded" />
        <div className="flex items-end justify-between">
          <SkeletonBar className="h-5 w-14 rounded" />
          <SkeletonBar className="h-2.5 w-16 rounded" />
        </div>
        <SkeletonBar className="h-2 w-full rounded mt-1" />
      </div>

      <div className="flex items-center gap-2 border-t border-line-light pt-2.5">
        <SkeletonBar className="w-4 h-4 rounded-full shrink-0" />
        <SkeletonBar className="h-2.5 w-24 rounded" />
      </div>
    </div>
  );
}

function OocyteCard({ log, index, bestImageUrl, selected, onSelect }: {
  log: IvfCycleLog; index: number; bestImageUrl: string | null; selected: boolean; onSelect: () => void;
}) {
  const state = ooState(log);
  const dropNo = log.d3_drop_no || log.d0_drop_no || '—';
  const num = String(index + 1).padStart(2, '0');

  return (
    <button type="button" onClick={onSelect}
      className={`text-left rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all bg-gradient-to-br ${
        selected ? 'border-primary shadow-lg shadow-primary/10 from-primary/[0.12] via-primary/[0.03] to-white' : 'border-line from-primary/[0.05] via-white to-white hover:border-primary/40 hover:shadow-md'
      }`}>
      {/* header */}
      <div className="flex items-start justify-between">
        <span className="text-sm font-black text-gray-800">Oocyte {num}</span>
        {state === 'ai' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold">
            <Sparkle size={9} /> {bestImageUrl ? 'AI Graded' : 'Best image pending'}
          </span>
        )}
        {state === 'final' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold">
            <CheckCircle2 size={10} /> Graded (Final)
          </span>
        )}
        {state === 'none' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[9px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" /> Not Graded
          </span>
        )}
      </div>

      {/* body */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-600">Drop No.</span>
            <span className="text-[11px] font-bold text-gray-700 bg-primary/5 border border-primary/10 rounded-md px-1.5 py-0.5">{dropNo}</span>
          </div>
        </div>
        {bestImageUrl ? (
          <div className={`w-16 h-16 rounded-full shrink-0 border-2 overflow-hidden flex items-center justify-center bg-gray-900 ${
            state === 'final' ? 'border-emerald-300' : 'border-primary/30'
          }`}>
            <img src={bestImageUrl} alt={`Oocyte ${num} best image`} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full shrink-0 border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
            <ImageIcon size={18} className="text-gray-300" />
          </div>
        )}
      </div>

      {/* detail rows or blast box */}
      {state === 'none' ? (
        <div className="rounded-xl px-3 py-2.5 border bg-gray-50 border-gray-100">
          <p className="text-[9px] font-bold mb-1 text-gray-600">Day 3 Grade</p>
          <div className="flex items-end justify-between">
            <span className={`text-xl font-black leading-none ${log.d3_grade ? 'text-primary' : 'text-gray-400'}`}>
              {log.d3_grade || '—'}
            </span>
            <div className="flex items-center gap-1 text-[9px] text-gray-600">
              <ImageIcon size={10} className="text-gray-500" />
              <span>Images</span>
              <span className="font-bold text-gray-800">{log.grade_count ?? 0}</span>
            </div>
          </div>
          <p className="text-[9px] text-gray-600 mt-1.5 pt-1.5 border-t border-gray-100">
            Not graded yet
          </p>
        </div>
      ) : (() => {
        const hasBlast = !!(log.blast_grade || log.d5_grade || log.d6_grade);
        return (
        <div className={`rounded-xl px-3 py-2.5 border ${state === 'final' ? 'bg-emerald-50/60 border-emerald-100' : 'bg-primary/[0.04] border-primary/10'}`}>
          <p className={`text-[9px] font-bold mb-1 ${state === 'final' ? 'text-emerald-600' : 'text-primary/70'}`}>
            {state === 'final' ? 'Final Blast Grade' : hasBlast ? 'Suggested Blast Grade' : 'Day 3 Grade'}
          </p>
          <div className="flex items-end justify-between">
            <span className={`text-xl font-black leading-none ${gradeTextCls(log.blast_grade || log.d5_grade || '')}`}>
              {hasBlast ? (log.blast_grade || log.d5_grade || log.d6_grade) : (log.d3_grade || '—')}
            </span>
            <div className="flex items-center gap-1 text-[9px] text-gray-600">
              <ImageIcon size={10} className="text-gray-500" />
              <span>Images</span>
              <span className="font-bold text-gray-800">{log.grade_count ?? 1}</span>
            </div>
          </div>
          <p className={`text-[9px] text-gray-600 mt-1.5 pt-1.5 border-t ${state === 'final' ? 'border-emerald-100' : 'border-primary/10'}`}>
            {state === 'final'
              ? `Blast confirmed by ${log.meta?.reviewed_by || 'Embryologist'} · ${fmtTime(log.updated_at)}`
              : bestImageUrl
                ? `Day 3 graded by ${log.meta?.d3_graded_by || log.meta?.graded_by || 'Embryologist'} · ${fmtTime(log.updated_at)} · Blast pending`
                : `${log.grade_count ?? 1} image${(log.grade_count ?? 1) === 1 ? '' : 's'} graded · Select the best image to continue`}
          </p>
        </div>
        );
      })()}

      {/* select radio */}
      <div className="mt-auto flex items-center gap-2 border-t border-line-light pt-2.5">
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${selected ? 'border-primary bg-primary' : 'border-gray-300'}`}>
          {selected && <Check size={9} strokeWidth={3.5} className="text-white" />}
        </div>
        <span className={`text-[11px] font-semibold ${selected ? 'text-primary' : 'text-gray-600'}`}>Select to grade</span>
      </div>
    </button>
  );
}

// ── Screen 2: Upload ───────────────────────────────────────────────────────────

function UploadScreen({ log, index, cycleId, imageSlots, onAdd, onRemove, onRemoveAll, uploading, onCancel, onStart, onSkip, error }: {
  log: IvfCycleLog; index: number; cycleId: number | null; imageSlots: ImageSlot[];
  onAdd: (f: File) => void; onRemove: (i: number) => void; onRemoveAll: () => void;
  uploading: boolean; onCancel: () => void; onStart: () => void; onSkip: () => void;
  error?: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const d3 = parseDay3(log.d3_grade);
  const num = String(index + 1).padStart(2, '0');

  // Prior attempts at this oocyte, shown read-only above the requirements so
  // the embryologist can see what's already on file before adding more.
  const [previousGrades, setPreviousGrades] = useState<IvfGrade[]>([]);
  const [previousLoading, setPreviousLoading] = useState(false);
  useEffect(() => {
    if (cycleId == null || (log.grade_count ?? 0) === 0) { setPreviousGrades([]); setPreviousLoading(false); return; }
    let cancelled = false;
    setPreviousLoading(true);
    ivfService.listGrades(cycleId, log.log_id).then(gs => {
      if (!cancelled) setPreviousGrades(gs.filter(isUsableGrade));
    }).catch(() => { if (!cancelled) setPreviousGrades([]); })
      .finally(() => { if (!cancelled) setPreviousLoading(false); });
    return () => { cancelled = true; };
  }, [cycleId, log.log_id, log.grade_count]);

  // Pad the last row out to a full line of skeleton cards so the grid never
  // ends mid-row with dead space — same auto-fill math the CSS grid itself uses.
  const PREV_GRID_MIN = 112, PREV_GRID_GAP = 12;
  const [prevGridRef, prevColumns] = useElementColumns(PREV_GRID_MIN, PREV_GRID_GAP);
  const prevRemainder = previousGrades.length % Math.max(1, prevColumns);
  const prevEmptySlots = previousGrades.length === 0 || prevRemainder === 0 ? 0 : prevColumns - prevRemainder;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(onAdd);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5 flex-1 min-h-0">
      {/* LEFT: selected oocyte */}
      <div className="flex flex-col min-h-0 w-[300px]">
        <div className="rounded-t-2xl overflow-hidden shrink-0">
          <img src="/bg_emb.png" alt="" className="w-full h-auto block" />
        </div>
        <div className="relative z-10 -mt-6 flex-1 flex flex-col min-h-0 rounded-2xl border border-line bg-white p-3 shadow-sm">
        <p className="text-sm font-black text-gray-800">Select Oocyte</p>
        <p className="text-[11px] text-gray-400 mb-2">1 oocyte selected</p>

        <div className="rounded-2xl overflow-hidden flex flex-col min-h-0 bg-[#F3EAF5]">
          {/* header */}
          <div className="p-3 flex items-start justify-between text-primary">
            <div className="flex flex-col gap-2">
              <span className="text-base font-black">Oocyte {num}</span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-primary/60">Drop No.</span>
                <span className="font-bold bg-white text-primary rounded-md px-1.5 py-0.5">{log.d3_drop_no || log.d0_drop_no || '—'}</span>
              </div>
              <div>
                <p className="text-[11px] text-primary/60">Day 3 Grade</p>
                <p className="text-xl font-black">{log.d3_grade || '—'}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="w-14 h-14 rounded-full border-2 border-primary/20 bg-white/60 flex items-center justify-center">
                <ImageIcon size={18} className="text-primary/60" />
              </div>
              <div className="flex items-center gap-1 text-[10px] text-primary/70"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> AI Graded</div>
            </div>
          </div>
          {/* white inner detail */}
          <div className="bg-white m-1.5 rounded-xl p-3 flex flex-col gap-3 overflow-y-auto">
            <DetailBlock title="Day 1 – PN Check" rows={[
              { label: 'PN Status', value: log.d1_pn || '—', ok: !!log.d1_pn },
              { label: 'Zygote Status', value: log.d1_zygote_status || '—' },
            ]} />
            <DetailBlock title="Day 3 – Cleavage" rows={[
              { label: 'Drop No.', value: log.d3_drop_no || '—' },
              { label: 'Cell Count', value: d3.cells || '—' },
              { label: 'Fragmentation', value: d3.frag || '—' },
              { label: 'Symmetry', value: log.d3_symmetry || '—' },
            ]} />
            <div className="flex items-center justify-between border-t border-line-light pt-2">
              <span className="text-sm font-bold text-gray-700">Auto Grade</span>
              <span className="text-xl font-black text-primary">{log.d3_grade || '—'}</span>
            </div>
          </div>
        </div>

        <button type="button" onClick={onCancel}
          className="mt-2 w-auto self-center shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 text-primary text-[11px] font-bold hover:bg-primary/5 transition-colors">
          <RefreshCw size={13} /> Switch Oocyte
        </button>
        </div>
      </div>

      {/* RIGHT: upload */}
      <div className="flex flex-col min-h-0 rounded-2xl border border-line bg-white overflow-hidden">
        <div className="shrink-0 px-5 pt-5">
          <p className="text-sm font-black text-gray-800">Embryo Image Upload</p>
          <p className="text-[11px] text-gray-400">Upload images for the selected oocyte to begin grading.</p>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-4 flex flex-col gap-4 px-5">
          {/* drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-12 transition-all ${
              dragOver ? 'border-primary' : 'border-primary/20'
            }`}
            style={{
              background:
                'radial-gradient(120% 100% at 72% 45%, rgba(216,148,241,0.55) 0%, rgba(216,148,241,0) 60%), ' +
                'linear-gradient(115deg, #eef1fc 0%, #f2e8fd 38%, #ecd4f7 68%, #ded9f8 100%)',
            }}>
            <UploadCloud size={40} className="text-primary" />
            <p className="text-sm font-black text-gray-800">Drag &amp; drop images here</p>
            <span className="text-[11px] text-gray-400">or</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity"
                style={{ background: 'var(--gradient-primary)' }}>
                Choose Files
              </button>
              <button type="button" onClick={() => setCameraOpen(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-primary border border-primary/30 bg-white hover:bg-primary/5 transition-colors">
                <Camera size={14} /> Use Camera
              </button>
            </div>
            <p className="text-[10px] text-gray-400">Supports JPG, PNG, TIFF • Max size 20MB per file</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { Array.from(e.target.files ?? []).forEach(onAdd); e.target.value = ''; }} />
          </div>

          {/* uploaded */}
          {imageSlots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black text-gray-800">Uploaded Images ({imageSlots.length})</p>
                <button type="button" onClick={onRemoveAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-[10px] font-bold hover:bg-red-50 transition-colors">
                  <Trash2 size={11} /> Remove All
                </button>
              </div>
              <div className="flex gap-3 flex-wrap">
                {imageSlots.map((slot, i) => (
                  <div key={slot.url} className="w-32 flex flex-col gap-1">
                    <div className="relative w-32 h-28 rounded-xl overflow-hidden border border-line">
                      <img src={slot.url} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md bg-white/90 text-gray-700 text-[10px] font-black flex items-center justify-center">{imageSlots.length - i}</span>
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><Check size={11} strokeWidth={3} className="text-white" /></span>
                      <button type="button" onClick={() => onRemove(i)}
                        className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500 transition-colors">
                        <X size={10} />
                      </button>
                    </div>
                    <span className="text-[9px] text-gray-400 text-center">{fmtTime(new Date(slot.addedAt).toISOString())}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* previously uploaded */}
          {(log.grade_count ?? 0) > 0 && (
            <div>
              <p className="text-xs font-black text-gray-800 mb-2">
                Previously Uploaded {!previousLoading && `(${previousGrades.length})`}
              </p>
              <div ref={prevGridRef} className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${PREV_GRID_MIN}px, 1fr))` }}>
                {previousLoading ? (
                  Array.from({ length: log.grade_count ?? 0 }).map((_, i) => (
                    <div key={`prev-loading-${i}`} className="flex flex-col gap-1">
                      <div className="w-full h-28 rounded-xl ivf-shimmer" />
                      <div className="h-2.5 w-6 mx-auto rounded-full ivf-shimmer" />
                    </div>
                  ))
                ) : (
                  <>
                    {previousGrades.map(g => (
                      <div key={g.grade_id} className="flex flex-col gap-1">
                        <div className="relative w-full h-28 rounded-xl overflow-hidden border border-line bg-gray-100">
                          {g.images[0]?.upload_image_url
                            ? <img src={g.images[0].upload_image_url} alt={`Oocyte ${log.oocyte_no} prior grade`} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} className="text-gray-300" /></div>}
                          {g.is_best && (
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-primary text-white text-[9px] font-black uppercase tracking-wide shadow-sm">Approved</span>
                          )}
                        </div>
                        <span className={`text-[10px] font-black text-center leading-none ${g.grade ? gradeTextCls(g.grade) : 'text-gray-300'}`}>{g.grade || '—'}</span>
                      </div>
                    ))}
                    {Array.from({ length: prevEmptySlots }).map((_, i) => (
                      <div key={`prev-empty-${i}`} className="flex flex-col gap-1">
                        <div className="w-full h-28 rounded-xl border border-dashed border-gray-200 bg-gray-100" />
                        <div className="h-2.5 w-6 mx-auto rounded-full bg-gray-100" />
                      </div>
                    ))}
                  </>
                )}
              </div>
              <style>{`
                .ivf-shimmer {
                  background: linear-gradient(90deg, #f3f4f6 25%, #e9ebee 37%, #f3f4f6 63%);
                  background-size: 400% 100%;
                  animation: ivf-shimmer-sweep 1.4s ease-in-out infinite;
                }
                @keyframes ivf-shimmer-sweep { 0% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
              `}</style>
            </div>
          )}

          {/* requirements */}
          <div>
            <p className="text-xs font-black text-gray-800 mb-2">Image Requirements</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { Icon: Sun, t: 'Clear & Focused', d: 'Ensure the embryo is well focused and clear.' },
                { Icon: Contrast, t: 'Good Contrast', d: 'Proper lighting and contrast improve analysis accuracy.' },
                { Icon: Monitor, t: 'Single Embryo', d: 'Upload images with one embryo per frame.' },
              ].map(({ Icon, t, d }) => (
                <div key={t} className="rounded-xl border border-line p-3 flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Icon size={14} />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-[11px] font-bold text-gray-800">{t}</p>
                    <p className="text-[10px] text-gray-400 leading-snug">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="mt-4 px-5 py-4 border-t border-line flex items-center justify-between shrink-0 bg-surface/40">
          <button type="button" onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {(log.grade_count ?? 0) > 0 && (
              <button type="button" onClick={onSkip} disabled={uploading}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-primary border border-primary/30 hover:bg-primary/5 transition-colors disabled:opacity-40">
                Skip <ArrowRight size={14} />
              </button>
            )}
            <button type="button" onClick={onStart} disabled={imageSlots.length === 0 || uploading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--gradient-primary)' }}>
              {uploading ? 'Uploading…' : <>Start Grading <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>

      {cameraOpen && (
        <CameraCaptureModal
          onCapture={file => onAdd(file)}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Live camera → capture → review flow. Kept self-contained: it only ever
 * calls `onCapture(file)`, which plugs into the same `onAdd` a picked or
 * dropped file uses — nothing downstream needs to know a photo came from here.
 */
function CameraCaptureModal({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<'starting' | 'live' | 'denied' | 'review'>('starting');
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase('live');
      })
      .catch(() => { if (!cancelled) setPhase('denied'); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      setShot({ blob, url: URL.createObjectURL(blob) });
      setPhase('review');
    }, 'image/jpeg', 0.92);
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setPhase('live');
  };

  const usePhoto = () => {
    if (!shot) return;
    onCapture(new File([shot.blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Camera size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-gray-800 leading-tight">Capture Embryo Image</p>
            <p className="text-[11px] text-gray-400">
              {phase === 'review' ? 'Review the capture before using it' : 'Point the camera at the embryo view'}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-xl border border-line flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-950 flex items-center justify-center">
            {phase === 'denied' ? (
              <div className="flex flex-col items-center gap-2 text-gray-400 px-6 text-center">
                <ImageIcon size={28} />
                <p className="text-xs font-semibold text-gray-300">Camera access is unavailable</p>
                <p className="text-[11px] text-gray-500">Check your browser/device permissions, or use Choose Files instead.</p>
              </div>
            ) : phase === 'review' && shot ? (
              <img src={shot.url} alt="Captured embryo" className="w-full h-full object-contain" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            )}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw size={22} className="text-white/70 animate-spin" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            {phase === 'denied' && (
              <button type="button" onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
                Close
              </button>
            )}
            {phase === 'review' && (
              <>
                <button type="button" onClick={retake}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
                  <RefreshCw size={13} /> Retake
                </button>
                <button type="button" onClick={usePhoto}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--gradient-primary)' }}>
                  <Check size={13} /> Use Photo
                </button>
              </>
            )}
            {phase === 'live' && (
              <button type="button" onClick={capture}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity"
                style={{ background: 'var(--gradient-primary)' }}>
                <Camera size={14} /> Capture
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DetailBlock({ title, rows }: { title: string; rows: { label: string; value: string; ok?: boolean }[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center"><FileText size={9} className="text-primary" /></div>
        <p className="text-[11px] font-bold text-primary">{title}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">{r.label}</span>
            <span className="text-[11px] font-bold text-gray-800 flex items-center gap-1">
              {r.value}{r.ok && <Check size={11} strokeWidth={3} className="text-emerald-500" />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Processing ─────────────────────────────────────────────────────────────────

function ProcessingScreen({ oocyteNo, progress, stage, resumed, skipped }: {
  oocyteNo: number | null; progress: number; stage: string; resumed?: boolean; skipped?: string[];
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-[420px] rounded-2xl border border-line bg-white">
      <div className="relative">
        <div className="w-24 h-24 rounded-full border-4 border-[#E8D5F5] border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain size={22} className="text-primary" />
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-primary">AI Grading in Progress</p>
        <p className="text-xs text-gray-400 mt-1">Analyzing embryo images for Oocyte #{oocyteNo ?? '—'}</p>
        {resumed && (
          <p className="text-[11px] text-primary/70 mt-1.5">Reconnected — this run started before the page reloaded</p>
        )}
        {!!skipped?.length && (
          <p className="text-[11px] font-semibold text-red-500 mt-1.5">
            Skipped {skipped.length} image{skipped.length > 1 ? 's' : ''} — no embryo detected
          </p>
        )}
      </div>

      <div className="w-full max-w-sm flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-500">{stage || 'Starting'}</span>
          <span className="text-[11px] font-black text-primary tabular-nums">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: 'var(--gradient-primary)' }} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {['Expansion grading', 'ICM classification', 'TE scoring', 'Quality assessment'].map((label, i) => (
          <span key={label} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium"
            style={{ opacity: 0, animation: `fade-in 0.3s ease forwards ${0.3 + i * 0.3}s` }}>{label}</span>
        ))}
      </div>
      <style>{`@keyframes fade-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  );
}

// ── Screen 3: Result ───────────────────────────────────────────────────────────

function Gauge({ score }: { score: number | null }) {
  const f = score != null ? Math.max(0, Math.min(1, score / 10)) : 0;
  const GX = 110, GY = 116, GR = 82, GC = 2 * Math.PI * GR, gHalf = GC / 2;
  const polar = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180; return [GX + r * Math.cos(a), GY - r * Math.sin(a)];
  };
  const needleDeg = 180 - f * 180;
  const [nx1, ny1] = polar(GR - 26, needleDeg);
  const [nx2, ny2] = polar(GR + 2, needleDeg);
  const status = score == null ? { t: '—', s: '' }
    : score >= 8.5 ? { t: 'Excellent state', s: 'Top-tier morphology' }
    : score >= 7 ? { t: 'Stable state', s: 'On track' }
    : score >= 5 ? { t: 'Fair state', s: 'Watch closely' }
    : { t: 'Low state', s: 'Needs review' };
  return (
    <div className="relative">
      <svg viewBox="0 0 220 130" className="w-full block">
        <defs>
          <linearGradient id="gauge-fill-r" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#cdb4e6" /><stop offset="100%" stopColor="#6b1176" />
          </linearGradient>
        </defs>
        <circle cx={GX} cy={GY} r={GR} fill="none" stroke="#ece7f4" strokeWidth="22" strokeDasharray={`${gHalf} ${GC}`} strokeLinecap="round" transform={`rotate(180 ${GX} ${GY})`} />
        <circle cx={GX} cy={GY} r={GR} fill="none" stroke="url(#gauge-fill-r)" strokeWidth="22" strokeDasharray={`${f * gHalf} ${GC}`} strokeLinecap="round" transform={`rotate(180 ${GX} ${GY})`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        {Array.from({ length: 11 }, (_, i) => 180 - i * 18).map((deg, i) => {
          const [x1, y1] = polar(GR + 4, deg); const [x2, y2] = polar(GR + 9, deg);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d6cfe4" strokeWidth="1.5" strokeLinecap="round" />;
        })}
        {score != null && <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="#3f3550" strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-x-0 top-[50%] flex flex-col items-center gap-0.5 text-center">
        <span className="text-3xl font-black leading-none text-gray-800">{score != null ? score.toFixed(1) : '—'}</span>
        <span className="text-[11px] font-bold text-gray-700 leading-none">{status.t}</span>
        <span className="text-[9px] text-gray-400">{status.s}</span>
      </div>
    </div>
  );
}

function Donut({ percent }: { percent: number }) {
  const R = 15, C = 2 * Math.PI * R;
  return (
    <div className="relative w-11 h-11">
      <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" stroke="#ece7f4" strokeWidth="5" />
        <circle cx="20" cy="20" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(percent / 100) * C} ${C}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-primary">{percent}%</span>
    </div>
  );
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;

function AnnotatedViewer({ src, resetKey, label, tint }: {
  src: string | null; resetKey: string; label?: string; tint?: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [resetKey]);

  const applyZoom = (next: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    setZoom(z);
    if (z === 1) setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.ox + (e.clientX - drag.current.px), y: drag.current.oy + (e.clientY - drag.current.py) });
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className="relative flex-1 min-h-0 rounded-2xl border border-line bg-gray-950 overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-center touch-none"
        style={{ cursor: zoom === 1 ? 'default' : drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => applyZoom(zoom >= ZOOM_MAX ? 1 : zoom + 1)}>
        {src ? (
          <img src={src} alt="annotated" draggable={false}
            className="w-full h-full object-contain select-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: drag.current ? 'none' : 'transform 150ms ease-out' }} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <ImageIcon size={28} /><span className="text-xs">No annotated image</span>
          </div>
        )}
      </div>

      {src && (
        <>
          {/* zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col items-center gap-1 rounded-xl bg-black/45 backdrop-blur-sm p-1">
            <button type="button" onClick={() => applyZoom(zoom + 0.5)} disabled={zoom >= ZOOM_MAX} title="Zoom in"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ZoomIn size={14} />
            </button>
            <span className="text-[9px] font-black text-white/70 tabular-nums">{zoom.toFixed(1)}×</span>
            <button type="button" onClick={() => applyZoom(zoom - 0.5)} disabled={zoom <= ZOOM_MIN} title="Zoom out"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ZoomOut size={14} />
            </button>
            <span className="w-5 h-px bg-white/20" />
            <button type="button" onClick={() => applyZoom(1)} disabled={zoom === 1} title="Fit to frame"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <Maximize2 size={13} />
            </button>
          </div>

          {/* current view, or the pan hint once it takes the slot */}
          {zoom > 1 ? (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/45 backdrop-blur-sm px-2 py-1 text-white/80">
              <Move size={11} />
              <span className="text-[9px] font-bold">Drag to pan</span>
            </div>
          ) : label && (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/45 backdrop-blur-sm px-2.5 py-1">
              {tint && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} />}
              <span className="text-[9px] font-black uppercase tracking-wider text-white/90">{label}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultScreen({ log, cycle, grades, selectedIdx, onSelectIdx, newGradeIds, grade, saving, onBack, onApprove, onOverride, pending, onResumeGrade, onDeleteGrade }: {
  log: IvfCycleLog; cycle?: IvfCycle | null;
  grades: IvfGrade[]; selectedIdx: number; onSelectIdx: (i: number) => void; newGradeIds: number[];
  grade: IvfGrade | null;
  saving: boolean; onBack: () => void; onApprove: () => void;
  onOverride: (gradeId: number, fields: Record<string, string>) => Promise<void>;
  /** Live state for a grade still being processed, if the selected one is. */
  pending?: { running: boolean; progress: number; stage: string } | null;
  onResumeGrade?: (gradeId: number) => void;
  onDeleteGrade?: (gradeId: number) => Promise<void>;
}) {
  // The row exists with its image from the moment of upload; the grade only
  // lands when the model returns, so this is what "still working" looks like.
  const incomplete = !!grade && grade.grade == null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [ov, setOv] = useState({ grade: '', hatching: '', vacuolization: '', multinucleation: '', zona_pellucida: '', blastocoel: '', cytoplasmic_granularity: '', bridge: '' });
  useEffect(() => {
    if (!grade) return;
    setOv({
      grade: grade.grade ?? '', hatching: grade.hatching ?? '', vacuolization: grade.vacuolization ?? '',
      multinucleation: grade.multinucleation ?? '', zona_pellucida: grade.zona_pellucida ?? '',
      blastocoel: grade.blastocoel ?? '', cytoplasmic_granularity: grade.cytoplasmic_granularity ?? '', bridge: grade.bridge ?? '',
    });
  }, [grade]);
  const img = grade?.images[0];
  const score = grade?.ai_score ?? null;
  const confidence = score != null ? Math.min(99, Math.round(score * 10 + 5)) : 0;
  const [mainTab, setMainTab] = useState<'source' | 'annotated'>('source');
  useEffect(() => { setMainTab('source'); }, [selectedIdx]);
  const mainSrc = (mainTab === 'annotated' ? img?.annotated_img_url : img?.upload_image_url) || null;
  const num = String(log.oocyte_no).padStart(2, '0');
  const d3m = (log.d3_grade || '').match(/^(\d+)\s*C\s*(\d+)/i);
  const cellNum = d3m ? d3m[1] : '—';
  const fragPct = d3m ? (FRAG_PCT[d3m[2]] ?? '—') : '—';

  // Gardner grade splits into expansion / ICM / TE, each with its own model note.
  const gardner = (grade?.grade || '').match(/^(\d)([A-C])([A-C])$/i);

  // Only badge a grade "Best" once the embryologist has actually picked one —
  // no ai_score fallback, so nothing gets badged best by default.
  const bestGradeId = grades.find(g => g.is_best)?.grade_id ?? null;

  const justifications = [
    grade?.exp_inference && { t: `Expansion${gardner ? `: ${gardner[1]}` : ''}`, d: grade.exp_inference },
    grade?.hatching && { t: `Hatching: ${grade.hatching}`, d: grade.hatching === 'Hatching'
      ? 'The blastocyst has begun breaching the zona pellucida.'
      : 'The blastocyst remains fully enclosed within the zona pellucida.' },
    grade?.icm_inference && { t: `Inner cell mass${gardner ? `: ${gardner[2].toUpperCase()}` : ''}`, d: grade.icm_inference },
    grade?.te_inference && { t: `Trophectoderm${gardner ? `: ${gardner[3].toUpperCase()}` : ''}`, d: grade.te_inference },
    grade?.zona_pellucida && { t: `Zona pellucida: ${grade.zona_pellucida}`, d: 'The zona pellucida appearance supports normal embryo integrity.' },
    grade?.blastocoel && { t: `Blastocoel: ${grade.blastocoel}`, d: 'Blastocoel expansion is consistent with healthy development.' },
  ].filter(Boolean) as { t: string; d: string }[];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(440px,1fr)_360px] gap-5 flex-1 min-h-0">

        {/* LEFT */}
        <div className="rounded-2xl border border-line bg-white flex flex-col min-h-0 overflow-hidden">
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto p-4">
          <div>
            <p className="text-sm font-black text-gray-800">Selected Oocyte &amp; Graded Images</p>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4">
            {/* top: image + identity */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 rounded-full p-1" style={{ background: 'radial-gradient(circle, rgba(107,17,118,0.10) 0%, rgba(107,17,118,0) 70%)' }}>
                <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-primary/40 bg-gray-900" style={{ boxShadow: '0 0 0 4px rgba(107,17,118,0.06)' }}>
                  {img?.upload_image_url ? <img src={img.upload_image_url} alt="oocyte" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={22} className="text-gray-600" /></div>}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-gray-800 mb-2 truncate">Oocyte {num}</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <Droplet size={12} className="text-primary shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-500 leading-tight">Drop No.</span>
                  </div>
                  <span className="inline-block text-[11px] font-bold text-primary bg-primary/5 rounded-lg px-2.5 py-0.5 shrink-0">{log.d3_drop_no || '—'}</span>
                </div>
              </div>
            </div>

            {/* bottom: PN + cleavage metrics, two per row */}
            <div className="border-t border-line mt-1 pt-1 grid grid-cols-2">
              {[
                { Icon: ClipboardCheck, label: 'PN Status', value: log.d1_pn || '—', sub: '', check: !!log.d1_pn },
                { Icon: Grid2x2, label: 'Cell Count', value: cellNum, sub: 'cells', check: false },
                { Icon: Percent, label: 'Fragmentation', value: fragPct, sub: '', check: false },
                { Icon: Shield, label: 'Symmetry', value: log.d3_symmetry || '—', sub: '', check: false },
              ].map(({ Icon, label, value, sub, check }, i) => (
                <div key={label}
                  className={`min-w-0 flex items-center gap-2 py-2.5 ${i % 2 === 1 ? 'pl-2 border-l border-line' : 'pr-2'} ${i >= 2 ? 'border-t border-line' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-tight whitespace-nowrap">{label}</span>
                    <div className="flex items-baseline flex-wrap gap-x-1">
                      <span className="text-sm font-black text-gray-800 leading-none break-words">{value}</span>
                      {sub && <span className="text-[9px] text-gray-400 leading-tight break-words">{sub}</span>}
                      {check && (
                        <span className="w-4 h-4 self-center rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Check size={10} strokeWidth={3} className="text-emerald-600" /></span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* graded strip */}
          <div>
            {/* pt-2 on the scroll area reserves room for the Best/Just graded badges,
                which poke above the card via -top-2 — without it the clip cuts them in half */}
            <p className="text-xs font-black text-gray-800 mb-0">Graded Images ({grades.length})</p>
            <div className="flex items-start gap-2 flex-wrap h-[230px] overflow-y-auto pt-2">
              {grades.map((g, i) => {
                const isNew = newGradeIds.includes(g.grade_id);
                const isBest = g.grade_id === bestGradeId;
                return (
                // A plain div (not <button>) so the delete icon below can be a real
                // nested <button> — a <button> can't validly contain another one.
                <div key={g.grade_id} role="button" tabIndex={0}
                  onClick={() => onSelectIdx(i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectIdx(i); } }}
                  className={`relative w-[88px] flex flex-col gap-1 rounded-xl border-2 p-1.5 transition-all cursor-pointer ${
                    i === selectedIdx ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/25 shadow-md shadow-primary/15 -translate-y-0.5'
                    : isNew ? 'border-gray-300 bg-gray-50'
                    : 'border-line hover:border-primary/30'
                  }`}>
                  {isBest ? (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[7px] font-black uppercase tracking-wide shadow-sm whitespace-nowrap">
                      <Award size={7} /> Approved
                    </span>
                  ) : isNew && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-[7px] font-black uppercase tracking-wide shadow-sm whitespace-nowrap">Just graded</span>
                  )}
                  {onDeleteGrade && (
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setDeleteConfirmId(g.grade_id); }}
                      className="absolute top-1 right-1 z-10 w-[18px] h-[18px] rounded-full bg-white/90 border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
                      <Trash2 size={9} />
                    </button>
                  )}
                  <div className="flex items-center px-0.5 min-h-4">
                    <span className={`text-[9px] font-bold ${i === selectedIdx ? 'text-primary' : 'text-gray-500'}`}>Image #{i + 1}</span>
                  </div>
                  <div className="w-full h-14 rounded-lg overflow-hidden bg-gray-100">
                    {g.images[0]?.upload_image_url ? <img src={g.images[0].upload_image_url} alt={`#${i + 1}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={14} className="text-gray-300" /></div>}
                  </div>
                  <span className={`text-[10px] font-black text-center leading-none ${g.grade ? gradeTextCls(g.grade) : 'text-gray-300'}`}>{g.grade || '—'}</span>

                  {/* positioned against the card itself, not the image, so it isn't
                      clipped by the thumbnail's own overflow-hidden */}
                  {i === selectedIdx && (
                    <span className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-sm ring-2 ring-white">
                      <Check size={9} strokeWidth={3} className="text-white" />
                    </span>
                  )}
                </div>
                );
              })}
              {/* pad the strip out to a full row of 6 so it never looks sparsely populated */}
              {Array.from({ length: Math.max(0, 6 - grades.length) }).map((_, i) => (
                <div key={`empty-${i}`}
                  className="w-[88px] flex flex-col gap-1 rounded-xl border-2 border-dashed border-gray-200 p-1.5">
                  <div className="flex items-center px-0.5 min-h-4">
                    <span className="text-[9px] font-bold text-gray-300">Image #{grades.length + i + 1}</span>
                  </div>
                  <div className="w-full h-14 rounded-lg bg-gray-50 flex items-center justify-center">
                    <ImageIcon size={14} className="text-gray-200" />
                  </div>
                  <span className="text-[10px] font-black text-center leading-none text-gray-200">—</span>
                </div>
              ))}
            </div>
          </div>

          {/* cycle info */}
          <div className="rounded-2xl border border-primary/10 bg-primary/[0.03] p-2.5">
            <p className="text-[11px] font-black text-primary uppercase tracking-wide mb-2">Cycle Information</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { Icon: Syringe, label: 'Injection Method', value: cycle?.injection_method || '—' },
                { Icon: Droplet, label: 'Sperm Quality', value: cycle?.sperm_quality || '—' },
                { Icon: Sparkle, label: 'Oocyte Quality', value: cycle?.oocyte_quality || '—' },
                { Icon: Tag, label: 'Type', value: cycle?.cycle_type || '—' },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-white px-2 py-1.5 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Icon size={11} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
                    <span className="text-xs font-bold text-gray-800">{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>

        {/* CENTER */}
        <div className="flex flex-col min-h-0 min-w-0">
          <div className="mb-3">
            <p className="text-sm font-black text-gray-800">Annotated Image (Image #{selectedIdx + 1})</p>
            <p className="text-[11px] text-gray-400">AI annotations for key structures</p>
          </div>

          {/* The panels fill the row in both axes; the images inside are
              object-contain, so each is shown whole whatever shape its panel is. */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex gap-2.5">
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <AnnotatedViewer src={mainSrc} resetKey={`${selectedIdx}-${mainTab}`}
                label={mainTab === 'annotated' ? 'Annotated' : 'Source'} />
            </div>

            {/* what the model produced, beside the source it was given */}
            <div className="w-[30%] max-w-[220px] shrink-0 flex flex-col gap-2.5 min-h-0">
              {ANNOT_VIEWS.map(({ label, url }) => {
                const src = url(img);
                return (
                  <div key={label}
                    className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-line bg-gray-950">
                    {src
                      ? <img src={src} alt={label} className="w-full h-full object-contain" />
                      : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} className="text-gray-600" /></div>}

                    <div className="absolute inset-x-0 bottom-0 px-2 pt-3 pb-1.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
                      <span className="text-[10px] font-black uppercase tracking-wide text-white">{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-line bg-white px-4 py-2.5 flex items-center flex-wrap gap-4 shrink-0">
            {[
              { c: '#eab308', l: 'Zona Pellucida' },
              { c: '#06b6d4', l: 'TE' },
              { c: '#ec4899', l: 'ICM' },
              { c: '#22c55e', l: 'Blastocoel' },
            ].map(x => (
              <div key={x.l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: x.c }} />
                <span className="text-[10px] font-semibold text-gray-600">{x.l}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-gray-100 shrink-0 ml-auto">
              {([['source', 'Source'], ['annotated', 'Annotated']] as const).map(([tab, tabLabel]) => (
                <button key={tab} type="button" onClick={() => setMainTab(tab)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                    mainTab === tab ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tabLabel}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="rounded-2xl border border-line flex flex-col min-h-0 overflow-hidden ">
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto p-4 [&>*]:shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-gray-800">AI Grading Result &amp; Details</p>
              <p className="text-[11px] text-gray-400">
                {incomplete
                  ? (pending?.running ? 'Analysis in progress' : 'Analysis never finished')
                  : `Grading completed ${fmtTime(grade?.created_at)}`}
              </p>
            </div>
            <button type="button" onClick={() => grade && setOverrideOpen(true)} disabled={!grade || incomplete}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/5 transition-colors shrink-0 disabled:opacity-40">
              <Pencil size={11} /> Override
            </button>
          </div>

          {incomplete ? (
            <div className="rounded-2xl border border-primary/15 p-4 flex flex-col gap-3"
              style={{ background: 'linear-gradient(135deg, #faf7ff 0%, #f3ecfb 100%)' }}>
              {pending?.running ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <RefreshCw size={14} className="text-primary animate-spin" />
                    <span className="text-xs font-black text-gray-800">{pending.stage || 'Analysing embryo'}</span>
                    <span className="ml-auto text-[11px] font-black text-primary tabular-nums">{pending.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pending.progress}%`, background: 'var(--gradient-primary)' }} />
                  </div>
                  <p className="text-[10px] text-gray-400">Results appear here as soon as the model finishes.</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5">
                    <Info size={14} className="text-primary shrink-0" />
                    <span className="text-xs font-black text-gray-800">This image was never graded</span>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    The run was interrupted before the model returned a grade. The image is saved, so it can be analysed again.
                  </p>
                  {grade && onResumeGrade && (
                    <button type="button" onClick={() => onResumeGrade(grade.grade_id)}
                      className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white"
                      style={{ background: 'var(--gradient-primary)' }}>
                      <RefreshCw size={12} /> Run AI grading
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
          /* grade + confidence */
          <div className="relative rounded-2xl border border-line-light p-4 flex items-center justify-between overflow-hidden"
            style={{
              background:
                'radial-gradient(120% 140% at 85% 20%, rgba(216,148,241,0.35) 0%, rgba(216,148,241,0) 60%), ' +
                'linear-gradient(115deg, #f5f6fd 0%, #f6f0fc 45%, #f2e6fa 100%)',
            }}>
            <div className="relative flex items-center gap-3.5">
              <div className="relative w-[68px] h-[68px] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/25 shrink-0"
                style={{ background: 'var(--gradient-primary)' }}>
                <Sparkle size={13} className="absolute top-1.5 right-1.5 text-white/70" />
                <span className="text-[26px] font-black leading-none tracking-tight">{grade?.grade || '—'}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-primary/50">AI Grade</span>
                <span className="text-sm font-black text-gray-800 leading-tight">{gradeQuality(grade?.grade || '')}</span>
                <span className="text-[10px] text-gray-400">AI-assisted morphology grade</span>
              </div>
            </div>
            <div className="relative flex flex-col items-center gap-1 shrink-0">
              <Donut percent={confidence} />
              <span className="text-[9px] font-semibold text-gray-400">Confidence</span>
            </div>
          </div>
          )}

          {/* gauge */}
          <div className="rounded-2xl border border-white/60 bg-white/85 backdrop-blur-md p-4 flex justify-center">
            <div className="w-full max-w-[240px]">
              <Gauge score={score} />
            </div>
          </div>

          {/* justification */}
          <div className="rounded-2xl border border-white/60 bg-white/85 backdrop-blur-md p-4">
            <p className="text-xs font-black text-gray-800 mb-3">AI Justification</p>
            <div className="flex flex-col gap-3">
              {justifications.length === 0 ? (
                <p className="text-[11px] text-gray-400">No morphology data available for this grade.</p>
              ) : justifications.map(j => (
                <div key={j.t} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Sparkle size={12} className="text-primary" /></div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-800">{j.t}</p>
                    <p className="text-[10px] text-gray-500 leading-snug">{j.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* guideline / disclaimer */}
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 flex gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><Info size={12} className="text-amber-600" /></div>
            <div>
              <p className="text-[11px] font-bold text-amber-800">Guideline</p>
              <p className="text-[10px] text-amber-700/90 leading-snug">
                This assessment is AI-generated and intended to assist, not replace, clinical judgment.
                Always have an embryologist review and confirm the grade before making any treatment decision.
              </p>
            </div>
          </div>

        </div>
        </div>
      </div>

      {/* footer */}
      <div className="mt-4 pt-4 border-t border-line flex items-center justify-between shrink-0">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
          <ArrowLeft size={14} /> Back to Oocytes
        </button>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={saving || !grade || incomplete}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ background: 'var(--gradient-primary)' }}>
          <CheckCircle2 size={14} /> {saving ? 'Saving…' : 'Approve & Save'}
        </button>
      </div>

      {confirmOpen && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget && !saving) setConfirmOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
            {/* header */}
            <div className="px-6 py-4 border-b border-line flex items-center gap-3 shrink-0">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Award size={20} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-black text-gray-800 leading-tight">Approve Grading</p>
                <p className="text-xs text-gray-400">Confirm the best grade for this oocyte</p>
              </div>
              <button type="button" onClick={() => { if (!saving) setConfirmOpen(false); }}
                className="w-9 h-9 rounded-xl border border-line flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              {/* graded images + summary */}
              <div>
                <p className="text-[11px] font-black text-primary uppercase tracking-widest mb-2">Graded Images ({grades.length})</p>
                <div className="flex gap-4 items-stretch flex-col lg:flex-row">
                  <div className="flex-1 grid gap-2.5 content-start max-h-[280px] overflow-y-auto pr-1"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${grades.length <= 2 ? 150 : grades.length <= 6 ? 116 : 92}px, 1fr))` }}>
                    {grades.map((g, i) => {
                      const sel = i === selectedIdx;
                      const compact = grades.length > 6;
                      return (
                        <div key={g.grade_id}
                          className={`rounded-xl border-2 p-1.5 flex flex-col gap-1.5 transition-all ${sel ? 'border-primary shadow-md shadow-primary/10' : 'border-line'}`}>
                          <div className="relative rounded-lg overflow-hidden bg-gray-100 aspect-[4/3]">
                            {g.images[0]?.upload_image_url ? <img src={g.images[0].upload_image_url} alt={`#${i + 1}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={18} className="text-gray-300" /></div>}
                            <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${sel ? 'bg-primary text-white' : 'bg-white/90 text-gray-600'}`}>#{i + 1}</span>
                            {sel && <span className={`absolute top-1.5 right-1.5 rounded-full bg-primary flex items-center justify-center shadow ${compact ? 'w-5 h-5' : 'w-6 h-6'}`}><Check size={compact ? 11 : 13} strokeWidth={3} className="text-white" /></span>}
                          </div>
                          <span className={`${compact ? 'text-sm' : 'text-lg'} font-black text-center leading-none ${g.grade ? gradeTextCls(g.grade) : 'text-gray-300'}`}>{g.grade || '—'}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="lg:w-[280px] shrink-0 rounded-xl bg-surface/60 border border-line-light p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Info size={14} className="text-primary" /></div>
                      <p className="text-[11px] font-black text-primary uppercase tracking-widest">Summary</p>
                    </div>
                    <div className="text-[13px] text-gray-600 leading-relaxed flex flex-col gap-2.5">
                      <p>You have selected <span className="font-bold text-gray-800">Image #{selectedIdx + 1}</span> for <span className="font-bold text-primary">Oocyte {num}</span>.</p>
                      <p>It will be marked as the <span className="font-bold text-primary">best grade</span> and saved to the clinical record.</p>
                      {grades.length > 1 && <p className="text-gray-400">The other {grades.length - 1} graded image{grades.length - 1 > 1 ? 's' : ''} will be kept as alternatives.</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* selected grade */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Selected Grade</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-4xl font-black leading-none ${gradeTextCls(grade?.grade || '')}`}>{grade?.grade || '—'}</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-line text-[11px] font-bold text-gray-700">
                      <Sparkle size={12} className="text-primary" /> {gradeQuality(grade?.grade || '')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {[
                    { label: 'Image', value: `#${selectedIdx + 1}` },
                    { label: 'AI Score', value: `${score != null ? score.toFixed(1) : '—'}/10` },
                    { label: 'Confidence', value: `${confidence}%` },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl bg-white/70 border border-line px-4 py-2 text-center min-w-[86px]">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
                      <p className="text-base font-black text-gray-800 leading-tight">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* quality flags */}
              <div>
                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Quality Flags</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { Icon: CircleDashed, label: 'Hatching', val: grade?.hatching },
                    { Icon: Shield, label: 'Zona Pellucida', val: grade?.zona_pellucida },
                    { Icon: CircleDot, label: 'Blastocoel', val: grade?.blastocoel },
                  ].map(({ Icon, label, val }) => (
                    <div key={label} className="rounded-lg border border-line bg-surface/40 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={13} className="text-primary/60 shrink-0" />
                        <span className="text-xs text-gray-700 truncate">{label}</span>
                      </div>
                      {val ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${flagBadgeCls(val)}`}>{val}</span> : <span className="text-[11px] text-gray-300">—</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* disclaimer */}
              <div className="rounded-xl bg-surface/50 border border-line-light p-3 flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Sparkles size={15} className="text-primary" /></div>
                <div>
                  <p className="text-xs font-bold text-gray-700">AI grading is decision support only.</p>
                  <p className="text-[11px] text-gray-400">Final grading should be confirmed by an embryologist before saving.</p>
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2 shrink-0">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
              <button type="button" onClick={onApprove} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ background: 'var(--gradient-primary)' }}>
                <CheckCircle2 size={15} /> {saving ? 'Saving…' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {overrideOpen && grade && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget && !overriding) setOverrideOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
            <div className="px-5 py-4 border-b border-line flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Pencil size={15} className="text-primary" /></div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">Override AI Grade</p>
                <p className="text-[11px] text-gray-400">Manually adjust the grade and morphology</p>
              </div>
              <button type="button" onClick={() => { if (!overriding) setOverrideOpen(false); }}
                className="w-8 h-8 rounded-lg border border-line flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"><X size={15} /></button>
            </div>

            <div className="p-5 flex flex-col gap-5 overflow-y-auto">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex-1">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-primary/50 mb-1">Grade</p>
                  <input value={ov.grade} onChange={e => setOv(v => ({ ...v, grade: e.target.value }))}
                    className="text-2xl font-black text-primary bg-transparent outline-none border-b-2 border-primary w-24" placeholder="e.g. 4AA" />
                </div>
                <span className={`text-4xl font-black leading-none ${gradeTextCls(ov.grade)}`}>{ov.grade || '—'}</span>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">Quality Flags</p>
                <div className="flex flex-col gap-2">
                  {([
                    { label: 'Hatching', key: 'hatching', opts: ['Not Hatching', 'Hatching', 'Partially Hatching'] },
                    { label: 'Zona Pellucida', key: 'zona_pellucida', opts: ['Intact', 'Good', 'Thinning'] },
                    { label: 'Blastocoel', key: 'blastocoel', opts: ['Excellent', 'Good', 'Fair', 'Poor'] },
                  ] as const).map(({ label, key, opts }) => (
                    <div key={key} className="flex items-center justify-between py-1 border-b border-gray-50">
                      <span className="text-xs text-gray-600 font-medium">{label}</span>
                      <select value={ov[key]} onChange={e => setOv(v => ({ ...v, [key]: e.target.value }))}
                        className="text-xs font-semibold border border-primary/20 rounded-lg px-2.5 py-1 outline-none text-primary bg-primary/[0.04]">
                        <option value="">—</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-line flex items-center justify-end gap-2 shrink-0">
              <button type="button" onClick={() => setOverrideOpen(false)} disabled={overriding}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors disabled:opacity-40">Cancel</button>
              <button type="button" disabled={overriding || !ov.grade.trim()}
                onClick={async () => {
                  setOverriding(true);
                  try { await onOverride(grade.grade_id, ov); setOverrideOpen(false); }
                  finally { setOverriding(false); }
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ background: 'var(--gradient-primary)' }}>
                <Check size={14} /> {overriding ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteConfirmId != null && (
        <ConfirmDialog
          title="Delete this image?"
          message="It will be removed from this oocyte's graded images."
          confirmLabel="Delete"
          confirmClassName="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={async () => {
            if (!onDeleteGrade) return;
            await onDeleteGrade(deleteConfirmId);
            setDeleteConfirmId(null);
          }}
        />
      )}
    </div>
  );
}
