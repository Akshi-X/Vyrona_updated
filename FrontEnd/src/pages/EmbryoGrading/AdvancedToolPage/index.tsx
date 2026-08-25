import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { IVFTreatment } from '../../../types/ivf';
import {
  ivfService, MlNoEmbryoError,
  type IvfCycle, type IvfCycleLog, type IvfGrade,
  type MlJobEvent,
} from '../../../services/ivfService';
import {
  isSettled, mlProgressFor, readMlRun, writeMlRun, clearMlRun, rejectionMessage,
  PHASE_LABEL,
  type Step, type ImageSlot, type MlRunRecord, type MlPhase,
} from './types';
import { isUsableGrade } from './helpers';
import SelectScreen from './sections/SelectScreen';
import UploadScreen from './sections/UploadScreen';
import ProcessingScreen from './sections/ProcessingScreen';
import ResultScreen from './sections/ResultScreen';

interface AdvancedEmbryoRouteState { embryo?: IVFTreatment; savedEditingLogId?: number | null; }

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
   *
   * "Unsettled" here means the SSE stream never told this client the job finished —
   * not that the job never finished. The server-side job can complete (and save a
   * real grade/ai_score) after the client already gave up, so before retiring we
   * re-check each grade's current DB state and leave alone anything that already
   * has a result — otherwise a job that finishes just late gets hidden forever.
   */
  const retireIncomplete = useCallback(async (rec: MlRunRecord | null) => {
    if (!rec) return;
    const unsettled = rec.images.filter(im => !isSettled(im));
    if (unsettled.length === 0) return;

    let freshGrades: IvfGrade[] = [];
    try {
      freshGrades = await ivfService.listGrades(rec.cycleId, rec.logId);
    } catch {
      // couldn't check — fall back to retiring everything unsettled, as before
    }
    const alreadyGraded = (gradeId: number) => {
      const g = freshGrades.find(g => g.grade_id === gradeId);
      return !!g && (g.grade != null || g.ai_score != null);
    };

    await Promise.all(unsettled.filter(im => !alreadyGraded(im.gradeId)).map(im =>
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

  const handleApprove = async (opts: { day: 'Day 5' | 'Day 6'; fate?: string; freezeId?: string; notes?: string }) => {
    if (!resultGrade || cycleId == null || !selectedLog) { navigate(his ? `/embryo-console/${his}` : '/embryo-console'); return; }
    setSaving(true);
    try {
      await ivfService.selectBestGrade(cycleId, selectedLog.log_id, resultGrade.grade_id);
      await ivfService.updateGrade(cycleId, resultGrade.grade_id, { is_completed: true, stage: 3 });
      if (resultGrade.grade) {
        // meta is replaced wholesale server-side, so any existing notes (day-by-day
        // comments logged from the Development Tracker) have to be carried forward.
        const mergedMeta = { ...(selectedLog.meta || {}), ...(opts.notes ? { final_notes: opts.notes } : {}) };
        // A grade with an early_blast quality flag set records its stage as
        // 'Early Blast' instead of 'Blastocyst' on whichever day is chosen.
        const stageLabel = resultGrade.quality_flags?.early_blast ? 'Early Blast' : 'Blastocyst';
        await ivfService.upsertLog(cycleId, {
          oocyte_no: selectedLog.oocyte_no,
          // There's one shared blast_grade column (no separate d5/d6 grade
          // columns) — d5_stage/d6_stage just say which day it belongs to.
          // Only one day can ever be set, so recording it on one explicitly
          // clears the other rather than leaving stale data.
          ...(opts.day === 'Day 6'
            ? { d6_stage: stageLabel, d5_stage: null }
            : { d5_stage: stageLabel, d6_stage: null }),
          blast_grade: resultGrade.grade,
          ...(opts.fate && { fate: opts.fate }),
          ...(opts.freezeId && { freeze_no: opts.freezeId }),
          ...(Object.keys(mergedMeta).length > 0 && { meta: mergedMeta }),
        });
      }
    } catch { /* non-blocking */ }
    finally { setSaving(false); }
    navigate(his ? `/embryo-console/${his}` : '/embryo-console');
  };

  const handleOverride = useCallback(async (gradeId: number, fields: Record<string, unknown>) => {
    if (cycleId == null) return;
    const updated = await ivfService.updateGrade(cycleId, gradeId, fields);
    setExistingGrades(prev => prev.map(g => g.grade_id === gradeId ? updated : g));
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
    // Every other step wants min-h-0 unconditionally (bounded card, own
    // internal scroll). The result step's panels now size to their own
    // content below xl, so this wrapper has to be allowed to grow with them
    // instead of clamping to the viewport — otherwise they end up clipped.
    <div className={`flex flex-col flex-1 ${step === 'result' ? 'xl:min-h-0' : 'min-h-0'}`}>
      {step === 'select' && (
        <SelectScreen
          his={his} logs={logs} loading={logsLoading} bestImages={bestImages}
          selectedOocyteNo={selectedOocyteNo} onSelect={setSelectedOocyteNo}
          onBack={() => navigate(`/embryo-console/${his}`)}
          onContinue={() => selectedOocyteNo != null && goUpload(selectedOocyteNo)}
        />
      )}

      {step === 'upload' && selectedLog && (
        <UploadScreen
          log={selectedLog} cycleId={cycleId}
          bestImageUrl={bestImages[selectedLog.log_id] ?? null}
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
