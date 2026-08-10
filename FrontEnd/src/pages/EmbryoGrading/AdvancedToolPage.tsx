import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, Trash2, ImageIcon, Lightbulb, Pencil, X, ShieldCheck, Upload, User, Hash, FlaskConical, Dna, Award, Flag, Egg, Droplets, Layers } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { IVFTreatment } from '../../types/ivf';
import { ivfService, type IvfCycleLog, type IvfGrade } from '../../services/ivfService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'select-best' | 'processing';

interface OverrideVals {
  grade: string; hatching: string; vacuolization: string; multinucleation: string;
  fragmentation: string; symmetry: string; zona_pellucida: string; blastocoel: string;
  cyto_gran: string; bridge: string;
}

interface AdvancedEmbryoRouteState { embryo?: IVFTreatment; savedLogForm?: unknown; savedEditingLogId?: number | null; }

interface ImageSlot { file: File; url: string; }

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_PER_IMAGE = [
  { grade: '4AA', score: 8.7, hatching: 'Not Hatching', vacuolization: 'Minimal',  multinucleation: 'None',    fragmentation: '< 10%', symmetry: 'Good',      zona_pellucida: 'Intact',   blastocoel: 'Good',      cyto_gran: 'Fine',   bridge: 'None',    implantation: 'Good' },
  { grade: '5AA', score: 9.2, hatching: 'Not Hatching', vacuolization: 'None',     multinucleation: 'None',    fragmentation: '< 5%',  symmetry: 'Excellent', zona_pellucida: 'Intact',   blastocoel: 'Excellent', cyto_gran: 'Fine',   bridge: 'None',    implantation: 'Excellent' },
  { grade: '4AB', score: 7.9, hatching: 'Not Hatching', vacuolization: 'Minimal',  multinucleation: 'None',    fragmentation: '< 15%', symmetry: 'Good',      zona_pellucida: 'Thinning', blastocoel: 'Good',      cyto_gran: 'Coarse', bridge: 'Minimal', implantation: 'Good' },
  { grade: '3BB', score: 6.5, hatching: 'Not Hatching', vacuolization: 'Mild',     multinucleation: 'Minimal', fragmentation: '< 20%', symmetry: 'Fair',      zona_pellucida: 'Intact',   blastocoel: 'Fair',      cyto_gran: 'Coarse', bridge: 'Minimal', implantation: 'Fair' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const flagBadgeCls = (val: string) => {
  if (val === 'None')                                                          return 'bg-gray-100 border border-gray-300 text-gray-600';
  if (val === 'Not Hatching' || val === 'Intact' || val === 'Good' || val === 'Fine' || val === 'Excellent')
                                                                               return 'bg-primary/10 border border-primary/20 text-primary';
  if (val === 'Minimal' || val === 'Mild')                                     return 'bg-amber-50 border border-amber-200 text-amber-700';
  return 'bg-gray-50 border border-gray-200 text-gray-600';
};

const gradeTextCls = (grade: string) => {
  const icmTe = grade.slice(1);
  if (grade.startsWith('5') && icmTe === 'AA') return 'text-primary';
  if (icmTe === 'AA') return 'text-emerald-600';
  if (icmTe === 'AB' || icmTe === 'BA') return 'text-amber-600';
  if (icmTe === 'BB') return 'text-orange-500';
  return 'text-gray-700';
};

const scoreBarCls = (score: number) => {
  if (score >= 8.5) return 'bg-emerald-500';
  if (score >= 7)   return 'bg-amber-400';
  return 'bg-orange-400';
};

const scoreTextCls = (score: number) => {
  if (score >= 8.5) return 'text-emerald-500';
  if (score >= 7)   return 'text-amber-400';
  return 'text-orange-400';
};



// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedEmbryoGradingPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const routeState = (location.state as AdvancedEmbryoRouteState) || {};
  const embryo = routeState.embryo;

  const [step, setStep] = useState<Step>('select-best');

  const [overrideVals, setOverrideVals] = useState<OverrideVals | null>(null);

  // Single selected oocyte
  const [selectedOocyteNo, setSelectedOocyteNo] = useState<number | null>(null);

  // Multiple image slots — each becomes its own IvfOocyteGrade
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  // Select Best Grade step
  const [selectedImageIdx, setSelectedImageIdx] = useState<number | null>(null);
  const [deactivateGradeId, setDeactivateGradeId] = useState<number | null>(null);

  // Grade IDs created during analysis (index matches imageSlots)
  const [createdGradeIds, setCreatedGradeIds] = useState<number[]>([]);

  // Oocyte list
  const [logs, setLogs] = useState<IvfCycleLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [gradeCountMap, setGradeCountMap] = useState<Record<number, number>>({});

  // Existing grades for selected oocyte
  const [existingGrades, setExistingGrades] = useState<IvfGrade[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [, setGradesError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'note' | null>(null);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveSelectedIdx, setApproveSelectedIdx] = useState<number | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [maxImagesOpen, setMaxImagesOpen] = useState(false);
  const [noGradeDeleteOpen, setNoGradeDeleteOpen] = useState(false);
  const [noBestGradeOpen, setNoBestGradeOpen] = useState(false);
  const [stagedViewIdx, setStagedViewIdx] = useState(0);
  const [previewStaged, setPreviewStaged] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedLog   = logs.find(l => l.oocyte_no === selectedOocyteNo);
  const selectedGrade = selectedImageIdx != null ? existingGrades[selectedImageIdx] ?? null : null;

  // ── Sync overrideVals when selected grade changes ──────────────────────────

  useEffect(() => {
    if (selectedImageIdx == null) return;
    const g = existingGrades[selectedImageIdx];
    if (!g) return;
    setOverrideVals({
      grade: g.grade ?? '',
      hatching: g.hatching ?? '',
      vacuolization: g.vacuolization ?? '',
      multinucleation: g.multinucleation ?? '',
      fragmentation: '',
      symmetry: '',
      zona_pellucida: g.zona_pellucida ?? '',
      blastocoel: g.blastocoel ?? '',
      cyto_gran: g.cytoplasmic_granularity ?? '',
      bridge: g.bridge ?? '',
    });
    setNoteDraft(g.note ?? '');
    setNoteSaved(false);
  }, [selectedImageIdx, existingGrades]);

  // ── Image slot handlers ───────────────────────────────────────────────────

  const addImageSlot = (file: File) => {
    if (existingGrades.length + imageSlots.length >= 4) return;
    setImageSlots(prev => [...prev, { file, url: URL.createObjectURL(file) }]);
    setPreviewStaged(true);
  };

  const handleOocyteSelect = (no: number) => {
    if (step === 'processing') return;
    if (no === selectedOocyteNo) return;
    imageSlots.forEach(s => URL.revokeObjectURL(s.url));
    setImageSlots([]);
    setExistingGrades([]);
    setGradesLoading(true);
    setGradesError(null);
    setSelectedImageIdx(null);
    setPreviewStaged(false);
    setSelectedOocyteNo(no);
  };

  // ── Auto-advance processing → select-best ────────────────────────────────

  useEffect(() => {
    if (step !== 'processing') return;
    const t = setTimeout(() => setStep('select-best'), 2800);
    return () => clearTimeout(t);
  }, [step]);

  // ── Fetch logs ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!his) return;
    const detailHis = his.trim().toUpperCase();
    let cancelled = false;
    setLogsLoading(true);
    ivfService.listCycles({ his_id: detailHis }).then(async cycles => {
      const matched = cycles.find(c => c.his_id.toUpperCase() === detailHis);
      if (!matched || cancelled) { setLogsLoading(false); return; }
      setCycleId(matched.cycle_id);
      const full = await ivfService.getCycleWithLogs(matched.cycle_id);
      if (cancelled) return;
      setLogs(full.logs);
      setLogsLoading(false);
      if (!cancelled) {
        setGradeCountMap(Object.fromEntries(full.logs.map(l => [l.log_id, l.grade_count])));
        const targetLogId = routeState.savedEditingLogId as number | null | undefined;
        if (targetLogId != null) {
          const target = full.logs.find(l => l.log_id === targetLogId);
          if (target) setSelectedOocyteNo(target.oocyte_no);
        }
      }
    }).catch(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [his]);

  // ── Fetch existing grades for selected oocyte ─────────────────────────────

  useEffect(() => {
    if (selectedOocyteNo == null || cycleId == null || !selectedLog) {
      setExistingGrades([]);
      setSelectedImageIdx(null);
      setGradesLoading(false);
      setGradesError(null);
      return;
    }
    setSelectedImageIdx(null);
    let cancelled = false;
    setGradesLoading(true);
    setGradesError(null);
    ivfService.listGrades(cycleId, selectedLog.log_id)
      .then(g => {
        if (cancelled) return;
        const active = g.filter(gr => gr.is_active !== false);
        setExistingGrades(active);
        if (active.length > 0) {
          let bestIdx = active.findIndex(gr => gr.is_best);
          if (bestIdx < 0) {
            bestIdx = active.reduce((bi, gr, i, arr) => (gr.ai_score ?? -1) > (arr[bi].ai_score ?? -1) ? i : bi, 0);
          }
          setSelectedImageIdx(bestIdx);
        }
        setGradesLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('listGrades failed:', err);
        setGradesError('Failed to load grades. Please try again.');
        setExistingGrades([]);
        setGradesLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedOocyteNo, cycleId, selectedLog?.log_id]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const [completing, setCompleting] = useState(false);

  const handleCompleteAndGo = async (destination: string, state?: Record<string, unknown>) => {
    if (completing) return;
    const gradeId = selectedImageIdx != null
      ? (existingGrades[selectedImageIdx]?.grade_id ?? createdGradeIds[selectedImageIdx])
      : undefined;
    if (gradeId != null && cycleId != null) {
      setCompleting(true);
      try {
        await ivfService.updateGrade(cycleId, gradeId, { is_completed: true, stage: 3 });
      } catch {
        // non-blocking — navigate regardless
      } finally {
        setCompleting(false);
      }
    }
    navigate(destination, { state });
  };

  const handleStartAnalysis = async () => {
    if (selectedOocyteNo == null || cycleId == null || !selectedLog || imageSlots.length === 0) return;
    setUploading(true);
    try {
      const fetchMockFile = async (path: string, name: string) => {
        const blob = await fetch(path).then(r => r.blob());
        return new File([blob], name, { type: 'image/jpeg' });
      };
      const [expFile, teFile, icmFile] = await Promise.all([
        fetchMockFile('/embryo/exp.jpeg', 'exp.jpeg'),
        fetchMockFile('/embryo/te.jpeg',  'te.jpeg'),
        fetchMockFile('/embryo/icm.jpeg', 'icm.jpeg'),
      ]);

      const ids: number[] = [];
      for (let i = 0; i < imageSlots.length; i++) {
        const mock = MOCK_PER_IMAGE[i] ?? MOCK_PER_IMAGE[0];
        const grade = await ivfService.createGrade(cycleId, selectedLog.log_id, {
          stage: 1,
          grade: mock.grade,
          ai_score: mock.score,
          hatching: mock.hatching,
          vacuolization: mock.vacuolization,
          multinucleation: mock.multinucleation,
          zona_pellucida: mock.zona_pellucida,
          blastocoel: mock.blastocoel,
          cytoplasmic_granularity: mock.cyto_gran,
          bridge: mock.bridge,
        });
        await ivfService.uploadImage(cycleId, grade.grade_id, imageSlots[i].file, { expFile, teFile, icmFile });
        ids.push(grade.grade_id);
      }
      setCreatedGradeIds(ids);
      setGradeCountMap(prev => ({ ...prev, [selectedLog.log_id]: (prev[selectedLog.log_id] ?? 0) + ids.length }));
      const refreshed = await ivfService.listGrades(cycleId, selectedLog.log_id);
      setExistingGrades(refreshed.filter(gr => gr.is_active !== false));
      imageSlots.forEach(s => URL.revokeObjectURL(s.url));
      setImageSlots([]);
      setStep('processing');
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmSelection = async (overrideIdx?: number) => {
    const idx = overrideIdx ?? selectedImageIdx;
    if (idx === null || idx == null || cycleId == null || !selectedLog) return;
    const gradeId = existingGrades[idx]?.grade_id ?? createdGradeIds[idx];
    if (gradeId != null) {
      try {
        await ivfService.selectBestGrade(cycleId, selectedLog.log_id, gradeId);
      } catch {
        // non-blocking
      }
    }
    if (overrideVals && cycleId != null) {
      const oid = createdGradeIds[idx] ?? existingGrades[idx]?.grade_id;
      if (oid != null) {
        try {
          await ivfService.updateGrade(cycleId, oid, {
            grade: overrideVals.grade,
            hatching: overrideVals.hatching,
            vacuolization: overrideVals.vacuolization,
            multinucleation: overrideVals.multinucleation,
            zona_pellucida: overrideVals.zona_pellucida,
            blastocoel: overrideVals.blastocoel,
            cytoplasmic_granularity: overrideVals.cyto_gran,
            bridge: overrideVals.bridge,
            stage: 3,
            is_completed: true,
          });
        } catch {
          // silent
        }
      }
    }
    handleCompleteAndGo(his ? `/embryo-console/${his}` : '/embryo-console');
  };

  const locked = step === 'processing';

  const tileGradeStr = selectedGrade?.grade ?? '';
  const expDigit     = tileGradeStr[0] ?? '—';
  const icmLetter    = tileGradeStr[1] ?? '—';
  const teLetter     = tileGradeStr[2] ?? '—';
  const expLabel     = expDigit === '1' ? 'Early Blastocyst' : expDigit === '2' ? 'Blastocyst' : expDigit === '3' ? 'Full Blastocyst' : expDigit === '4' ? 'Expanded' : (expDigit === '5' || expDigit === '6') ? 'Hatching' : null;
  const icmLabel     = icmLetter === 'A' ? 'Many compact cells forming a well-defined mass.' : icmLetter === 'B' ? 'Few cells, loosely grouped inner cell mass.' : icmLetter === 'C' ? 'Very few cells, difficult to discern.' : null;
  const teLabel      = teLetter === 'A' ? 'Many cells forming a cohesive epithelial layer.' : teLetter === 'B' ? 'Few cells, loose or uneven layer.' : teLetter === 'C' ? 'Very few cells, large or irregular.' : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {selectedOocyteNo == null ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <div className="w-full max-w-[360px] max-h-full flex flex-col">
            <OocyteList
              logs={logs}
              loading={logsLoading}
              selectedOocyteNo={selectedOocyteNo}
              imageSlots={imageSlots}
              gradeCountMap={gradeCountMap}
              locked={locked}
              onSelect={handleOocyteSelect}
            />
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(280px,1fr)_300px] xl:grid-rows-1 gap-4 xl:flex-1 xl:overflow-hidden xl:min-h-0">

        {/* ── LEFT PANEL ── hidden during processing spinner ── */}
        <aside className={`xl:overflow-y-auto flex flex-col gap-3 pr-0.5 xl:h-full ${step === 'processing' ? 'hidden' : ''}`}>
          <OocyteList
            logs={logs}
            loading={logsLoading}
            selectedOocyteNo={selectedOocyteNo}
            imageSlots={imageSlots}
            gradeCountMap={gradeCountMap}
            locked={locked}
            onSelect={handleOocyteSelect}
          />
          <div className="rounded-xl border border-line bg-white overflow-hidden shrink-0">
            <div className="px-4 py-2.5 border-b border-line-light bg-gradient-to-r from-surface to-white">
              <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase">AI Justification</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[9px] text-gray-500 leading-snug">
                {[expLabel, icmLabel, teLabel].filter(Boolean).join(' ') || (selectedGrade ? 'No morphology data available for this grade.' : 'Each embryo holds a morphological story. Select a graded image and the AI will narrate it — expansion stage, inner cell mass density, and trophectoderm cohesion — distilled into a single clinical read.')}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {step === 'select-best' && (
            <div className="flex flex-col gap-2 shrink-0">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-0.5">Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => setOverrideModalOpen(true)}
                  className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--gradient-primary)' }}>
                  <Pencil size={13} />
                  Override Grade
                </button>
                <button type="button"
                  onClick={() => setActiveSection(prev => prev === 'note' ? null : 'note')}
                  className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--gradient-primary)', opacity: activeSection === 'note' ? 1 : 0.85 }}>
                  <Lightbulb size={13} />
                  Clinical Note
                </button>
                <button type="button"
                  onClick={() => { setApproveSelectedIdx(selectedImageIdx); setApproveModalOpen(true); }}
                  className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--gradient-primary)' }}>
                  <ShieldCheck size={13} />
                  Approve
                </button>
                {existingGrades.length + imageSlots.length >= 4 ? (
                  <button type="button"
                    onClick={() => setMaxImagesOpen(true)}
                    className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--gradient-primary)' }}>
                    <Upload size={13} />
                    Upload Image
                  </button>
                ) : (
                  <label className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer"
                    style={{ background: 'var(--gradient-primary)' }}>
                    <Upload size={13} />
                    Upload Image
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) { addImageSlot(e.target.files[0]); setStagedViewIdx(imageSlots.length); } e.target.value = ''; }} />
                  </label>
                )}
                <button type="button"
                  onClick={() => {
                    if (selectedImageIdx != null && existingGrades[selectedImageIdx!]) {
                      setDeactivateGradeId(existingGrades[selectedImageIdx!].grade_id);
                    } else {
                      setNoGradeDeleteOpen(true);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--gradient-primary)' }}>
                  <Trash2 size={13} />
                  Delete Grade
                </button>
                <button type="button"
                  onClick={async () => {
                    const g = selectedImageIdx != null ? existingGrades[selectedImageIdx] : null;
                    if (!g || !cycleId || !selectedLog) { setNoBestGradeOpen(true); return; }
                    if (g.is_best) return;
                    try {
                      await ivfService.selectBestGrade(cycleId, selectedLog.log_id, g.grade_id);
                      setExistingGrades(prev => prev.map((eg, i) => ({ ...eg, is_best: i === selectedImageIdx })));
                    } catch { /* silent */ }
                  }}
                  className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white text-left px-4 flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--gradient-primary)' }}>
                  <Check size={13} />
                  Mark as Best
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* ── CENTER PANEL ── */}

        {/* AI Processing spinner (spans all cols) */}
        {step === 'processing' && (
          <div className="col-span-1 xl:col-span-3 flex flex-col items-center justify-center min-h-[420px] gap-6 rounded-lg border border-line bg-white">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-[#E8D5F5] border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary-bg flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 0 1 0 20"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-primary">AI Grading in Progress</p>
              <p className="text-xs text-gray-400 mt-1">
                Analyzing {imageSlots.length} image{imageSlots.length !== 1 ? 's' : ''} for Oocyte #{selectedOocyteNo ?? '—'}
              </p>
            </div>
            <div className="w-72">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-primary animate-[ai-progress_2.8s_ease-out_forwards]" />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-gray-400">Analyzing morphology...</span>
                <span className="text-[9px] text-primary font-semibold">Processing</span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {['Expansion grading', 'ICM classification', 'TE scoring', 'Quality assessment'].map((label, i) => (
                <span key={label} className="px-3 py-1 rounded-full bg-primary-bg text-primary text-[10px] font-medium"
                  style={{ opacity: 0, animation: `fade-in 0.3s ease forwards ${0.4 + i * 0.3}s` }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── COL 2: Large image + image strip ── */}
        {step === 'select-best' && (() => {
          const selGrade   = selectedImageIdx != null ? existingGrades[selectedImageIdx] ?? null : null;
          const mainImgUrl = selGrade?.images[0]?.upload_image_url ?? null;
          const showStaged = imageSlots.length > 0 && (previewStaged || (!mainImgUrl && existingGrades.length < 4));
          return (
            <div className="flex flex-col gap-3 xl:h-full min-h-0">
              <div className="flex gap-3 flex-1 min-h-0">
              {/* Embryo Preview card */}
              <div className="rounded-xl border border-line bg-white overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-4 py-2.5 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0">
                  <p className="text-xs font-bold text-gray-800">Embryo Preview</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">Select a graded image to preview it here.</p>
                </div>
                <div className={`relative flex-1 min-h-[300px] xl:min-h-0 ${(mainImgUrl || imageSlots.length > 0) ? 'bg-black' : 'bg-gray-50'}`}>
                  {(mainImgUrl && !showStaged) ? (
                    <img src={mainImgUrl} alt="Selected oocyte" className="w-full h-full object-contain absolute inset-0" />
                  ) : existingGrades.length >= 4 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <ImageIcon size={20} className="text-gray-300" />
                      </div>
                      <p className="text-[10px] font-semibold text-gray-400">Maximum reached</p>
                      <p className="text-[9px] text-gray-300">4 images already graded for this oocyte</p>
                    </div>
                  ) : imageSlots.length > 0 ? (() => {
                    const si = Math.min(stagedViewIdx, imageSlots.length - 1);
                    return (
                      <>
                        <img src={imageSlots[si].url} alt={`Staged ${si + 1}`} className="w-full h-full object-contain absolute inset-0" />
                        <div className="absolute top-2.5 left-2.5 z-10">
                          <span className="px-2 py-0.5 rounded-lg bg-black/60 text-white text-[9px] font-bold backdrop-blur-sm">
                            Image {si + 1}/{imageSlots.length}
                          </span>
                        </div>
                        {imageSlots.length > 1 && (
                          <>
                            <button type="button" disabled={si === 0}
                              onClick={() => { setPreviewStaged(true); setStagedViewIdx(p => Math.max(0, p - 1)); }}
                              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center disabled:opacity-25 hover:bg-white transition-all">
                              <ChevronLeft size={16} className="text-gray-700" />
                            </button>
                            <button type="button" disabled={si === imageSlots.length - 1}
                              onClick={() => { setPreviewStaged(true); setStagedViewIdx(p => Math.min(imageSlots.length - 1, p + 1)); }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center disabled:opacity-25 hover:bg-white transition-all">
                              <ChevronRight size={16} className="text-gray-700" />
                            </button>
                          </>
                        )}
                      </>
                    );
                  })() : selectedOocyteNo == null ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 select-none">
                      <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* outer glow ring */}
                        <circle cx="70" cy="70" r="64" fill="url(#outerGlow)" />
                        {/* dashed microscope border */}
                        <circle cx="70" cy="70" r="60" stroke="#6b1176" strokeOpacity="0.15" strokeWidth="1.5" strokeDasharray="4 3" />
                        {/* inner field */}
                        <circle cx="70" cy="70" r="50" fill="url(#innerField)" />
                        {/* subtle grid lines */}
                        <line x1="70" y1="20" x2="70" y2="120" stroke="#6b1176" strokeOpacity="0.06" strokeWidth="1" />
                        <line x1="20" y1="70" x2="120" y2="70" stroke="#6b1176" strokeOpacity="0.06" strokeWidth="1" />
                        {/* embryo cell cluster — 4-cell stage */}
                        {/* top-left cell */}
                        <circle cx="57" cy="57" r="16" fill="url(#cell1)" stroke="#6b1176" strokeOpacity="0.18" strokeWidth="1" />
                        <circle cx="57" cy="57" r="7" fill="#6b1176" fillOpacity="0.18" />
                        <circle cx="54" cy="54" r="2.5" fill="#6b1176" fillOpacity="0.35" />
                        {/* top-right cell */}
                        <circle cx="84" cy="57" r="14" fill="url(#cell2)" stroke="#6b1176" strokeOpacity="0.18" strokeWidth="1" />
                        <circle cx="84" cy="57" r="6" fill="#6b1176" fillOpacity="0.15" />
                        <circle cx="81" cy="54" r="2" fill="#6b1176" fillOpacity="0.30" />
                        {/* bottom-left cell */}
                        <circle cx="57" cy="83" r="13" fill="url(#cell3)" stroke="#6b1176" strokeOpacity="0.18" strokeWidth="1" />
                        <circle cx="57" cy="83" r="5.5" fill="#6b1176" fillOpacity="0.15" />
                        <circle cx="55" cy="81" r="2" fill="#6b1176" fillOpacity="0.28" />
                        {/* bottom-right cell */}
                        <circle cx="83" cy="83" r="15" fill="url(#cell4)" stroke="#6b1176" strokeOpacity="0.18" strokeWidth="1" />
                        <circle cx="83" cy="83" r="6.5" fill="#6b1176" fillOpacity="0.18" />
                        <circle cx="80" cy="80" r="2.5" fill="#6b1176" fillOpacity="0.32" />
                        {/* floating accent dots */}
                        <circle cx="31" cy="45" r="2.5" fill="#6b1176" fillOpacity="0.18" />
                        <circle cx="109" cy="55" r="2" fill="#6b1176" fillOpacity="0.14" />
                        <circle cx="36" cy="97" r="1.8" fill="#6b1176" fillOpacity="0.14" />
                        <circle cx="107" cy="95" r="2.5" fill="#6b1176" fillOpacity="0.18" />
                        <circle cx="70" cy="22" r="1.5" fill="#6b1176" fillOpacity="0.20" />
                        <defs>
                          <radialGradient id="outerGlow" cx="50%" cy="40%" r="55%" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#6b1176" stopOpacity="0.07" />
                            <stop offset="100%" stopColor="#6b1176" stopOpacity="0" />
                          </radialGradient>
                          <radialGradient id="innerField" cx="50%" cy="40%" r="55%" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#f3eaf6" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#ede5f4" stopOpacity="0.4" />
                          </radialGradient>
                          <radialGradient id="cell1" cx="35%" cy="35%" r="65%">
                            <stop offset="0%" stopColor="#f9f3fc" />
                            <stop offset="100%" stopColor="#dfc8e8" />
                          </radialGradient>
                          <radialGradient id="cell2" cx="35%" cy="35%" r="65%">
                            <stop offset="0%" stopColor="#f9f3fc" />
                            <stop offset="100%" stopColor="#d8bde4" />
                          </radialGradient>
                          <radialGradient id="cell3" cx="35%" cy="35%" r="65%">
                            <stop offset="0%" stopColor="#f9f3fc" />
                            <stop offset="100%" stopColor="#dbbfe6" />
                          </radialGradient>
                          <radialGradient id="cell4" cx="35%" cy="35%" r="65%">
                            <stop offset="0%" stopColor="#f9f3fc" />
                            <stop offset="100%" stopColor="#d4b8e0" />
                          </radialGradient>
                        </defs>
                      </svg>
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-bold text-gray-700">Select an oocyte</p>
                        <p className="text-[10px] text-gray-400 leading-relaxed">Choose an oocyte from the list on the left<br />to upload an image and begin AI grading</p>
                      </div>
                    </div>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer group">
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 mt-0.5">Upload an embryo image to begin grading.</p>
                      </div>
                      <div className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold group-hover:opacity-90 transition-opacity shadow-sm">
                        <Upload size={13} />
                        Upload Image
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) addImageSlot(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  )}
                  {!showStaged && selGrade && (
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-lg bg-black/60 text-white text-[9px] font-bold backdrop-blur-sm">
                        Image #{selectedImageIdx! + 1}
                      </span>
                      {selGrade.grade && (
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold backdrop-blur-sm ${gradeTextCls(selGrade.grade)} bg-white/90`}>
                          {selGrade.grade}
                        </span>
                      )}
                    </div>
                  )}
                  {!showStaged && selGrade?.is_best && (
                    <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-primary/80 text-white text-[8px] font-bold backdrop-blur-sm">Best</span>
                  )}
                </div>
              </div>

              {/* Expansion / ICM / TE sub-image tiles column */}
              {!showStaged && (selectedGrade?.images[0]?.exp_img_url || selectedGrade?.images[0]?.icm_img_url || selectedGrade?.images[0]?.te_img_url) && (
              <div className="w-[190px] shrink-0 flex flex-col gap-2 min-h-0">
                  {[
                    { label: 'Expansion', grade: expDigit,  src: selectedGrade?.images[0]?.exp_img_url },
                    { label: 'ICM',       grade: icmLetter, src: selectedGrade?.images[0]?.icm_img_url },
                    { label: 'TE',        grade: teLetter,  src: selectedGrade?.images[0]?.te_img_url  },
                  ].map(tile => (
                    <div key={tile.label} className="relative flex-1 min-h-0 bg-gray-50 overflow-hidden rounded-xl border border-line">
                      {tile.src
                        ? <img src={tile.src} alt={tile.label} className="absolute inset-0 w-full h-full object-cover" />
                        : <div className="w-full h-full" />
                      }
                      <div className="absolute top-0 left-0 flex items-center gap-1.5 bg-white pl-2 pr-2.5 py-1.5 rounded-br-[14px]">
                        <span className="text-[7px] font-black uppercase tracking-[0.14em] text-gray-500 leading-none">{tile.label}</span>
                        {tile.grade && tile.grade !== '—' && (
                          <span className="text-[10px] font-black text-primary leading-none bg-primary/8 px-1.5 py-0.5 rounded-md border border-primary/15">{tile.grade}</span>
                        )}
                        <span
                          className="absolute left-full top-0 w-[14px] h-[14px] pointer-events-none"
                          style={{ background: 'radial-gradient(circle 14px at 100% 100%, transparent 97%, #fff 100%)' }}
                        />
                        <span
                          className="absolute top-full left-0 w-[14px] h-[14px] pointer-events-none"
                          style={{ background: 'radial-gradient(circle 14px at 100% 100%, transparent 97%, #fff 100%)' }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
              )}
              </div>

              {/* Instruction Bar */}
              <div className="shrink-0 flex gap-3 items-stretch">
                  {/* ── Graded images (left) ── */}
                  {(gradesLoading || existingGrades.length > 0) ? (
                    <div className={`flex-1 min-w-0 flex flex-col rounded-xl border border-line-light overflow-hidden transition-all ${imageSlots.length > 0 ? 'grayscale bg-gray-100 pointer-events-none' : 'bg-primary-bg'}`}>
                      <div className="px-3 py-2 border-b border-primary/10 flex items-center justify-between">
                        <p className="text-[9px] font-bold text-primary/70 uppercase tracking-widest">Graded Images</p>
                        {!gradesLoading && existingGrades.length > 0 && (
                          <span className="text-[9px] text-gray-400">{existingGrades.length} / 4</span>
                        )}
                      </div>
                      {gradesLoading ? (
                        <div className="flex gap-2 p-3">
                          {[1, 2].map(n => (
                            <div key={n} className="w-16 h-16 rounded-lg bg-primary/10 animate-pulse shrink-0" />
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                          <button type="button"
                            disabled={(selectedImageIdx ?? 0) === 0}
                            onClick={() => { setPreviewStaged(false); setSelectedImageIdx(i => Math.max(0, (i ?? 0) - 1)); }}
                            className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center disabled:opacity-25 hover:bg-primary/20 transition-colors shrink-0">
                            <ChevronLeft size={12} className="text-primary" />
                          </button>
                          <div className="flex gap-2 flex-1 overflow-x-auto pt-1.5 -mt-1.5" style={{ scrollbarWidth: 'none' }}>
                            {existingGrades.map((g, i) => {
                              const imgUrl = g.images[0]?.upload_image_url;
                              return (
                                <div key={g.grade_id} className="relative shrink-0">
                                  <button type="button" onClick={() => { setPreviewStaged(false); setSelectedImageIdx(i); }}
                                    className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${selectedImageIdx === i ? 'border-primary shadow-md' : 'border-primary/20 opacity-60 hover:opacity-100'}`}>
                                    {imgUrl
                                      ? <img src={imgUrl} alt={`Grade ${i + 1}`} className="w-full h-full object-cover" />
                                      : <div className="w-full h-full bg-primary/10 flex items-center justify-center"><ImageIcon size={14} className="text-primary/40" /></div>
                                    }
                                    <div className="absolute bottom-0 inset-x-0 bg-black/50 backdrop-blur-sm text-white text-[8px] font-bold text-center py-0.5 leading-tight">
                                      {g.grade ?? `#${i + 1}`}
                                    </div>
                                  </button>
                                  {g.is_best && (
                                    <div className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-emerald-500 border border-white shadow-sm flex items-center justify-center pointer-events-none">
                                      <Check size={7} strokeWidth={3.5} className="text-white" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <button type="button"
                            disabled={(selectedImageIdx ?? 0) >= existingGrades.length - 1}
                            onClick={() => { setPreviewStaged(false); setSelectedImageIdx(i => Math.min(existingGrades.length - 1, (i ?? 0) + 1)); }}
                            className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center disabled:opacity-25 hover:bg-primary/20 transition-colors shrink-0">
                            <ChevronRight size={12} className="text-primary" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : imageSlots.length === 0 ? (
                    /* ── No oocyte selected / nothing graded ── */
                    <div className="flex-1 rounded-xl border border-line-light bg-primary-bg px-3 py-3 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <ImageIcon size={12} className="text-primary/40" />
                      </div>
                      <p className="text-[9px] text-gray-400 font-medium">Select an oocyte to view graded images</p>
                    </div>
                  ) : null}

                  {/* ── Ready to be graded (right) ── */}
                  {imageSlots.length > 0 && (
                    <div className={`flex flex-col rounded-xl border border-line-light bg-primary-bg overflow-hidden ${(gradesLoading || existingGrades.length > 0) ? 'w-[300px] shrink-0' : 'flex-1'}`}>
                      <div className="px-3 py-2 border-b border-primary/10 flex items-center justify-between">
                        <p className="text-[9px] font-bold text-primary/70 uppercase tracking-widest">Ready to be Graded</p>
                        <span className="text-[9px] text-gray-400">{imageSlots.length} image{imageSlots.length !== 1 ? 's' : ''}</span>
                      </div>
                      {(() => {
                        const si = Math.min(stagedViewIdx, imageSlots.length - 1);
                        return (
                          <div className="flex-1 flex items-center gap-2 px-3 py-2">
                            <button type="button" disabled={si === 0}
                              onClick={() => { setPreviewStaged(true); setStagedViewIdx(p => Math.max(0, p - 1)); }}
                              className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center disabled:opacity-25 hover:bg-primary/20 transition-colors shrink-0">
                              <ChevronLeft size={12} className="text-primary" />
                            </button>
                            <div className="flex gap-1.5 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                              {imageSlots.map((slot, idx) => (
                                <button key={slot.url} type="button" onClick={() => { setPreviewStaged(true); setStagedViewIdx(idx); }}
                                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${idx === si ? 'border-primary shadow-md' : 'border-primary/20 opacity-50 hover:opacity-80'}`}>
                                  <img src={slot.url} alt={`Staged ${idx + 1}`} className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                            <button type="button" disabled={si === imageSlots.length - 1}
                              onClick={() => { setPreviewStaged(true); setStagedViewIdx(p => Math.min(imageSlots.length - 1, p + 1)); }}
                              className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center disabled:opacity-25 hover:bg-primary/20 transition-colors shrink-0">
                              <ChevronRight size={12} className="text-primary" />
                            </button>
                            <button type="button" disabled={uploading || selectedOocyteNo == null}
                              onClick={handleStartAnalysis}
                              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg bg-primary text-white text-[11px] font-bold leading-tight text-center hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                              {uploading ? 'Uploading…' : <span>Start AI<br />Analysis</span>}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
            </div>
          );
        })()}

        {/* ── COL 3: action buttons + panels + embryo details ── */}
        {step === 'select-best' && (() => {
          const panelBg = { background: 'linear-gradient(135deg, #f5f0ff 0%, #ede9fe 100%)' };
          return (
            <div className="xl:overflow-y-auto flex flex-col gap-3 pr-0.5 xl:h-full">

              {/* Clinical Note panel */}
              {activeSection === 'note' && (
                <div className="rounded-xl border border-primary/20 shrink-0" style={panelBg}>
                  <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Lightbulb size={10} className="text-primary" />
                      </div>
                      <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Clinical Note</p>
                    </div>
                    {noteSaved && (
                      <span className="text-[8px] font-semibold text-emerald-600 flex items-center gap-1">
                        <Check size={9} strokeWidth={3} /> Saved
                      </span>
                    )}
                  </div>
                  <div className="px-3 pb-3 flex flex-col gap-2">
                    <textarea
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      placeholder="Add a clinical observation..."
                      rows={3}
                      className="w-full text-[9px] text-gray-700 bg-white/80 border border-primary/20 rounded-xl px-2.5 py-1.5 outline-none resize-none placeholder:text-gray-400 focus:border-primary/50 leading-relaxed"
                    />
                    <button type="button"
                      disabled={!noteDraft.trim() || noteSaving || cycleId == null || selectedGrade == null}
                      onClick={async () => {
                        if (!cycleId || !selectedGrade) return;
                        setNoteSaving(true);
                        setNoteSaved(false);
                        try {
                          await ivfService.updateGrade(cycleId, selectedGrade.grade_id, { note: noteDraft });
                          setExistingGrades(prev => prev.map(g => g.grade_id === selectedGrade.grade_id ? { ...g, note: noteDraft } : g));
                          setNoteSaved(true);
                        } finally {
                          setNoteSaving(false);
                        }
                      }}
                      className="w-full py-1.5 rounded-xl text-[9px] font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
                      style={{ background: 'var(--gradient-primary)' }}>
                      {noteSaving ? 'Saving…' : 'Update Note'}
                    </button>
                    <p className="text-[8px] text-gray-400 text-center leading-relaxed">
                      AI assessment is for reference only and does not replace clinical judgment.
                    </p>
                  </div>
                </div>
              )}

              {/* Result Preview */}
              <div className="rounded-xl border border-line bg-white overflow-hidden shrink-0">
                <div className="px-3 py-2.5 border-b border-line-light bg-gradient-to-r from-surface to-white">
                  <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Result (Preview)</p>
                </div>
                {(() => {
                  const g = selectedGrade;
                  const thumb = g?.images[0]?.upload_image_url ?? null;
                  const score = g?.ai_score ?? null;
                  const f = score != null ? Math.max(0, Math.min(1, score / 10)) : 0;
                  const GX = 110, GY = 116, GR = 82;
                  const GC = 2 * Math.PI * GR;
                  const gHalf = GC / 2;
                  const polar = (r: number, deg: number): [number, number] => {
                    const a = (deg * Math.PI) / 180;
                    return [GX + r * Math.cos(a), GY - r * Math.sin(a)];
                  };
                  const needleDeg = 180 - f * 180;
                  const [nx1, ny1] = polar(GR - 26, needleDeg);
                  const [nx2, ny2] = polar(GR + 2, needleDeg);
                  const gaugeDots: { x: number; y: number; on: boolean }[] = [];
                  for (const r of [79, 72]) {
                    for (let i = 0; i <= 10; i++) {
                      const [x, y] = polar(r, 180 - i * 18);
                      gaugeDots.push({ x, y, on: i / 10 <= f });
                    }
                  }
                  const status = score == null
                    ? { t: 'No score yet', s: 'Run AI analysis to grade' }
                    : score >= 8.5 ? { t: 'Excellent state', s: 'Top-tier morphology' }
                    : score >= 7 ? { t: 'Stable state', s: "Keep going — you're on track" }
                    : score >= 5 ? { t: 'Fair state', s: 'Watch closely' }
                    : { t: 'Low state', s: 'Needs review' };
                  return (
                    <div className="flex flex-col">
                      {/* Identity */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-11 h-11 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                          {thumb
                            ? <img src={thumb} alt="thumb" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={15} className="text-gray-300" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-gray-800 leading-none mb-1">
                            {selectedOocyteNo != null ? `Oocyte #${selectedOocyteNo}` : 'No oocyte selected'}
                          </p>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                              {selectedImageIdx != null ? `Image #${selectedImageIdx + 1}` : '—'}
                            </span>
                            {g?.grade && (
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-current/20 ${gradeTextCls(g.grade)}`}>
                                {g.grade}
                              </span>
                            )}
                            {g?.is_best && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">Best</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AI Score gauge hero */}
                      <div className="mx-2.5 mb-2 rounded-xl overflow-hidden relative pb-4" style={{ background: 'linear-gradient(180deg, #faf8ff 0%, #f3eefb 100%)' }}>
                        <div className="relative pt-2">
                          <svg viewBox="0 0 220 130" className="w-full block">
                            <defs>
                              <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#cdb4e6" />
                                <stop offset="100%" stopColor="#6b1176" />
                              </linearGradient>
                            </defs>
                            {/* track */}
                            <circle cx={GX} cy={GY} r={GR} fill="none" stroke="#ece7f4" strokeWidth="24"
                              strokeDasharray={`${gHalf} ${GC}`} strokeLinecap="round" transform={`rotate(180 ${GX} ${GY})`} />
                            {/* fill */}
                            <circle cx={GX} cy={GY} r={GR} fill="none" stroke="url(#gauge-fill)" strokeWidth="24"
                              strokeDasharray={`${f * gHalf} ${GC}`} strokeLinecap="round" transform={`rotate(180 ${GX} ${GY})`}
                              style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                            {/* dotted texture */}
                            {gaugeDots.map((d, i) => (
                              <circle key={i} cx={d.x} cy={d.y} r={1.2} fill={d.on ? 'rgba(255,255,255,0.75)' : 'rgba(107,17,118,0.14)'} />
                            ))}
                            {/* outer ticks */}
                            {Array.from({ length: 11 }, (_, i) => 180 - i * 18).map((deg, i) => {
                              const [x1, y1] = polar(GR + 4, deg);
                              const [x2, y2] = polar(GR + 10, deg);
                              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d6cfe4" strokeWidth="1.5" strokeLinecap="round" />;
                            })}
                            {/* needle */}
                            {score != null && (
                              <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="#3f3550" strokeWidth="3" strokeLinecap="round" />
                            )}
                          </svg>
                          <div className="absolute inset-x-0 top-[54%] flex flex-col items-center gap-0.5 px-3 text-center">
                            <span className="text-3xl font-black leading-none text-gray-800">
                              {score != null ? score.toFixed(1) : '—'}
                            </span>
                            <span className="text-[11px] font-bold text-gray-700 leading-none">{status.t}</span>
                            <span className="text-[9px] text-gray-400 leading-tight">{status.s}</span>
                          </div>
                        </div>
                      </div>

                      {/* Grade row */}
                      <div className="mx-2.5 mb-2.5 rounded-xl border border-primary/10 bg-primary/[0.04] px-3 py-2.5 flex items-center justify-between">
                        <span className="text-[8px] font-black text-primary/50 uppercase tracking-widest">Grade</span>
                        <span className={`text-lg font-black leading-none ${g?.grade ? gradeTextCls(g.grade) : 'text-gray-300'}`}>
                          {g?.grade || '—'}
                        </span>
                      </div>

                      {g ? (
                        <>
                          {/* Quality Flags */}
                          <div className="px-3 pb-2.5 flex flex-col gap-1.5">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Quality Flags</p>
                            {[
                              { label: 'Hatching',        val: g.hatching,        Icon: Egg      },
                              { label: 'Vacuolization',   val: g.vacuolization,   Icon: Droplets },
                              { label: 'Multinucleation', val: g.multinucleation, Icon: Layers   },
                            ].map(r => {
                              const iconCls = !r.val ? 'text-gray-300'
                                : (r.val === 'None' || r.val === 'Not Hatching') ? 'text-primary/50'
                                : (r.val === 'Minimal' || r.val === 'Mild') ? 'text-amber-400'
                                : 'text-orange-400';
                              return (
                                <div key={r.label} className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <r.Icon size={10} className={`shrink-0 ${iconCls}`} />
                                    <span className="text-[9px] text-gray-600">{r.label}</span>
                                  </div>
                                  {r.val
                                    ? <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-full ${flagBadgeCls(r.val)}`}>{r.val}</span>
                                    : <span className="text-[9px] text-gray-300 font-semibold">—</span>
                                  }
                                </div>
                              );
                            })}
                          </div>

                          {/* Morphology — 2×2 grid */}
                          <div className="px-3 pb-3 pt-2.5 border-t border-[#F8F4FD] flex flex-col gap-1.5">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Morphology</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { label: 'Zona Pellucida', val: g.zona_pellucida },
                                { label: 'Blastocoel',     val: g.blastocoel },
                                { label: 'Cyto. Gran.',    val: g.cytoplasmic_granularity },
                                { label: 'Bridge',         val: g.bridge },
                              ].map(r => (
                                <div key={r.label} className="rounded-lg border border-gray-100 bg-gray-50/60 px-2 py-1.5">
                                  <p className="text-[7px] font-bold text-gray-500 uppercase tracking-wide leading-none mb-1">{r.label}</p>
                                  {r.val
                                    ? <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-md inline-block ${flagBadgeCls(r.val)}`}>{r.val}</span>
                                    : <span className="text-[9px] text-gray-300 font-semibold">—</span>
                                  }
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="px-3 pb-4 flex flex-col items-center justify-center gap-1.5 text-center">
                          <p className="text-[10px] font-semibold text-gray-400">No AI result yet</p>
                          <p className="text-[9px] text-gray-300">Upload an image and run analysis to see grade details.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Embryo Details */}
              <div className="rounded-xl border border-line bg-white overflow-hidden shrink-0">
                <div className="px-3 py-2.5 border-b border-line-light bg-gradient-to-r from-surface to-white">
                  <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Embryo Details</p>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {[
                    { icon: User,         label: 'Patient ID',  value: embryo?.hisNumber || his || '—',                           color: 'text-violet-500',  bg: 'bg-violet-50'  },
                    { icon: Hash,         label: 'Oocyte No.',  value: selectedOocyteNo != null ? String(selectedOocyteNo) : '—', color: 'text-primary',     bg: 'bg-primary/10' },
                    { icon: FlaskConical, label: 'D0 Maturity', value: selectedLog?.d0_maturity || '—',                           color: 'text-cyan-600',    bg: 'bg-cyan-50'    },
                    { icon: Dna,          label: 'D1 PN',       value: selectedLog?.d1_pn || '—',                                 color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { icon: Award,        label: 'D3 Grade',    value: selectedLog?.d3_grade || '—',                              color: 'text-amber-600',   bg: 'bg-amber-50'   },
                    { icon: Flag,         label: 'Fate',        value: selectedLog?.fate || '—',                                  color: 'text-rose-500',    bg: 'bg-rose-50'    },
                  ].map(({ icon: Icon, label, value, color, bg }) => (
                    <div key={label} className="rounded-xl border border-gray-100 bg-white px-2.5 py-2 flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center shrink-0`}>
                        <Icon size={11} className={color} />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">{label}</span>
                        <span className="text-[10px] font-bold text-gray-800 leading-none truncate">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          );
        })()}
      </div>
      )}


      {/* ── Approve Embryo Grading Modal ── */}
      {approveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setApproveModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck size={15} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Approve Embryo Grading</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Select the best graded image to approve for the clinical record</p>
                </div>
              </div>
              <button type="button" onClick={() => setApproveModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <X size={15} />
              </button>
            </div>

            {/* Cards row */}
            <div className="flex gap-4 overflow-x-auto p-5 min-h-0">
              {existingGrades.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <ImageIcon size={18} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-400">No graded images yet</p>
                  <p className="text-[10px] text-gray-300">Run AI analysis first to generate grades</p>
                </div>
              ) : existingGrades.map((grade, idx) => {
                const isSelected = approveSelectedIdx === idx;
                const mock = MOCK_PER_IMAGE[idx] ?? MOCK_PER_IMAGE[0];
                const score = grade.ai_score ?? mock.score;
                const gradeStr = grade.grade ?? mock.grade ?? '';
                const hatching = grade.hatching ?? mock.hatching;
                const vacuolization = grade.vacuolization ?? mock.vacuolization;
                const multinucleation = grade.multinucleation ?? mock.multinucleation;
                const imgUrl = grade.images[0]?.upload_image_url;
                return (
                  <div
                    key={grade.grade_id}
                    onClick={() => setApproveSelectedIdx(idx)}
                    className={`relative flex-shrink-0 w-44 rounded-2xl border-2 cursor-pointer transition-all overflow-hidden bg-white flex flex-col ${
                      isSelected ? 'border-primary shadow-xl shadow-primary/20' : 'border-gray-200 hover:border-primary/40 hover:shadow-md'
                    }`}
                  >
                    {/* YOU SELECTED banner */}
                    {isSelected && (
                      <div className="bg-primary py-1.5 flex justify-center shrink-0">
                        <span className="text-[8px] font-black text-white uppercase tracking-widest">You Selected</span>
                      </div>
                    )}
                    {/* Image */}
                    <div className="relative bg-gray-100 overflow-hidden shrink-0" style={{ height: 156 }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt={`Grade ${idx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon size={20} className="text-gray-300" />
                        </div>
                      )}
                      {/* Index badge */}
                      <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                        <span className="text-[9px] font-black text-white">{idx + 1}</span>
                      </div>
                      {/* X button */}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setApproveModalOpen(false); setDeactivateGradeId(grade.grade_id); }}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm"
                      >
                        <X size={9} />
                      </button>
                    </div>
                    {/* Info */}
                    <div className="flex-1 px-3 pt-2.5 pb-1 flex flex-col gap-2">
                      {/* Image label */}
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 self-start">
                        <ImageIcon size={8} className="text-gray-400" />
                        <span className="text-[8px] font-semibold text-gray-500">Image #{idx + 1}</span>
                      </div>
                      {/* Grade + score */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[8px] font-semibold text-gray-400">Grade</span>
                          <span className={`text-[8px] font-bold ${scoreTextCls(score)}`}>{score.toFixed(1)} / 10</span>
                        </div>
                        <p className={`text-2xl font-black leading-none ${gradeTextCls(gradeStr)}`}>{gradeStr || '—'}</p>
                        <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${scoreBarCls(score)}`} style={{ width: `${(score / 10) * 100}%` }} />
                        </div>
                      </div>
                      {/* Quality flags */}
                      <div className="flex flex-col gap-1">
                        <p className="text-[7px] font-black uppercase tracking-widest text-gray-400">Quality Flags</p>
                        {[
                          { label: 'Hatching',       value: hatching       },
                          { label: 'Vacuolization',  value: vacuolization  },
                          { label: 'Multinucleation',value: multinucleation },
                        ].map(f => (
                          <div key={f.label} className="flex items-center justify-between">
                            <span className="text-[8px] text-gray-500">{f.label}</span>
                            {f.value ? (
                              <span className={`text-[7px] font-semibold px-1.5 py-0.5 rounded-md ${flagBadgeCls(f.value)}`}>{f.value}</span>
                            ) : (
                              <span className="text-[8px] text-gray-300">—</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Radio */}
                    <div className="pb-3 flex justify-center shrink-0">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                      }`}>
                        {isSelected && <Check size={11} strokeWidth={3} className="text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-line flex items-center justify-between shrink-0">
              <p className="text-[10px] text-gray-400">
                {approveSelectedIdx != null
                  ? `Image #${approveSelectedIdx + 1} selected — grade ${existingGrades[approveSelectedIdx]?.grade ?? '—'}`
                  : 'Select an image above to approve'}
              </p>
              <button
                type="button"
                disabled={approveSelectedIdx === null || completing}
                onClick={() => {
                  const idx = approveSelectedIdx!;
                  setSelectedImageIdx(idx);
                  setApproveModalOpen(false);
                  handleConfirmSelection(idx);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <ShieldCheck size={13} />
                {completing ? 'Saving…' : 'Confirm & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Override Grade Modal ── */}
      {overrideModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setOverrideModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Pencil size={14} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Override AI Grade</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Manually adjust grade and morphology fields</p>
                </div>
              </div>
              <button type="button" onClick={() => setOverrideModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <X size={15} />
              </button>
            </div>

            {overrideVals ? (
              <>
                <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto">
                  {/* Grade hero */}
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="flex-1">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-primary/50 mb-1">Grade</p>
                      <input
                        value={overrideVals.grade}
                        onChange={e => setOverrideVals(v => v ? { ...v, grade: e.target.value } : v)}
                        className="text-2xl font-black text-primary bg-transparent outline-none border-b-2 border-primary w-24"
                        placeholder="e.g. 4AA"
                      />
                      <p className="text-[8px] text-primary/40 mt-1">Type directly to edit</p>
                    </div>
                    <div className={`text-5xl font-black leading-none ${gradeTextCls(overrideVals.grade)}`}>
                      {overrideVals.grade || '—'}
                    </div>
                  </div>

                  {/* Quality Flags */}
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-2.5">Quality Flags</p>
                    <div className="flex flex-col gap-2">
                      {([
                        { label: 'Hatching',        key: 'hatching'        as keyof OverrideVals, opts: ['Not Hatching', 'Hatching', 'Partially Hatching'] },
                        { label: 'Vacuolization',   key: 'vacuolization'   as keyof OverrideVals, opts: ['None', 'Mild', 'Moderate', 'Severe'] },
                        { label: 'Multinucleation', key: 'multinucleation' as keyof OverrideVals, opts: ['None', 'Minimal', 'Present'] },
                      ]).map(({ label, key, opts }) => (
                        <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                          <span className="text-xs text-gray-600 font-medium">{label}</span>
                          <select
                            value={overrideVals[key]}
                            onChange={e => setOverrideVals(v => v ? { ...v, [key]: e.target.value } : v)}
                            className="text-xs font-semibold border border-primary/20 rounded-lg px-2.5 py-1 outline-none text-primary bg-primary/[0.04] hover:border-primary/40 transition-colors"
                          >
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Morphology */}
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-2.5">Morphology</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                      {([
                        { label: 'Fragmentation',  key: 'fragmentation'  as keyof OverrideVals, opts: ['< 5%', '< 10%', '< 15%', '< 20%', '> 20%'] },
                        { label: 'Symmetry',       key: 'symmetry'       as keyof OverrideVals, opts: ['Excellent', 'Good', 'Fair', 'Poor'] },
                        { label: 'Zona Pellucida', key: 'zona_pellucida' as keyof OverrideVals, opts: ['Intact', 'Good', 'Thinning'] },
                        { label: 'Blastocoel',     key: 'blastocoel'     as keyof OverrideVals, opts: ['Excellent', 'Good', 'Fair', 'Poor'] },
                        { label: 'Cyto. Gran.',    key: 'cyto_gran'      as keyof OverrideVals, opts: ['Fine', 'Coarse'] },
                        { label: 'Bridge',         key: 'bridge'         as keyof OverrideVals, opts: ['None', 'Minimal', 'Present'] },
                      ]).map(({ label, key, opts }) => (
                        <div key={label} className="flex flex-col gap-1 py-1.5">
                          <span className="text-[9px] text-gray-500 font-medium">{label}</span>
                          <select
                            value={overrideVals[key]}
                            onChange={e => setOverrideVals(v => v ? { ...v, [key]: e.target.value } : v)}
                            className="text-[10px] font-semibold border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-700 bg-white hover:border-primary/40 focus:border-primary transition-colors"
                          >
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-line shrink-0">
                  <button type="button" onClick={() => setOverrideModalOpen(false)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--gradient-primary)' }}>
                    Save Override
                  </button>
                </div>
              </>
            ) : (
              <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <ImageIcon size={18} className="text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-400">No image selected</p>
                <p className="text-[10px] text-gray-300">Select an image from the strip first to override its grade.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {deactivateGradeId !== null && (
        <ConfirmDialog
          title="Remove this grade?"
          message="This grade will be marked inactive and hidden from the grading flow."
          confirmLabel="Remove"
          confirmClassName="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
          onCancel={() => setDeactivateGradeId(null)}
          onConfirm={async () => {
            if (cycleId == null) return;
            await ivfService.updateGrade(cycleId, deactivateGradeId, { is_active: false });
            setExistingGrades(prev => prev.filter(g => g.grade_id !== deactivateGradeId));
            setGradeCountMap(prev => ({
              ...prev,
              ...(selectedLog ? { [selectedLog.log_id]: Math.max(0, (prev[selectedLog.log_id] ?? 1) - 1) } : {}),
            }));
            setDeactivateGradeId(null);
          }}
        />
      )}



      {/* ── No grade selected for best popup ── */}
      {noBestGradeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setNoBestGradeOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold text-gray-800">No grade selected</p>
              <p className="text-xs text-gray-500">Please select a graded image before marking it as best.</p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setNoBestGradeOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── No grade to delete popup ── */}
      {noGradeDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setNoGradeDeleteOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold text-gray-800">No grade selected</p>
              <p className="text-xs text-gray-500">Please select a graded image from the list before deleting.</p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setNoGradeDeleteOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Max images popup ── */}
      {maxImagesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setMaxImagesOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold text-gray-800">Maximum images reached</p>
              <p className="text-xs text-gray-500">You can upload up to 4 images per oocyte. To add a new image, please delete an existing one first.</p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setMaxImagesOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ai-progress { from { width: 0% } to { width: 100% } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}

// ── Oocyte list (single-select) ───────────────────────────────────────────────

function OocyteList({ logs, loading, selectedOocyteNo, imageSlots, gradeCountMap, locked, onSelect }: {
  logs: IvfCycleLog[];
  loading: boolean;
  selectedOocyteNo: number | null;
  imageSlots: ImageSlot[];
  gradeCountMap: Record<number, number>;
  locked: boolean;
  onSelect: (no: number) => void;
}) {
  const gradeOf = (log: IvfCycleLog) => log.blast_grade || log.d3_grade || null;
  const chipCls = (grade: string | null) => {
    if (!grade) return '';
    const icmTe = grade.slice(1);
    return icmTe === 'AA' ? 'bg-green-50 border-green-200 text-green-700'
      : icmTe === 'BB' ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
      : grade.includes('C') ? 'bg-primary-bg border-[#c084fc]/40 text-primary'
      : 'bg-amber-50 border-amber-200 text-amber-700';
  };

  return (
    <div className={`rounded-xl border bg-white flex flex-col min-h-[220px] ${locked ? 'border-line opacity-60 pointer-events-none' : 'animate-glow-pulse'}`}>
      <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0 rounded-t-xl overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-800">Select an oocyte to grade</p>
          {locked && <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Locked</span>}
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {loading ? 'Loading…' : `${logs.length} embryo${logs.length !== 1 ? 's' : ''} in cycle`}
        </p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[10px] text-gray-400">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <p className="text-[10px] font-medium text-gray-400">No oocytes logged</p>
          <p className="text-[9px] text-gray-300 mt-0.5">Add entries on the Log Sheet tab</p>
        </div>
      ) : (
        <div className="overflow-y-auto flex-1 min-h-0">
          {logs.map((log, idx) => {
            const active = log.oocyte_no === selectedOocyteNo;
            const grade = gradeOf(log);
            const savedCount = gradeCountMap[log.log_id] ?? 0;
            const liveCount  = active ? imageSlots.length : 0;
            const imgCount   = liveCount > 0 ? liveCount : savedCount;
            return (
              <button key={log.log_id} type="button" onClick={() => onSelect(log.oocyte_no)}
                className={`w-full flex items-center gap-3 py-2.5 transition-all text-left border-b border-[#F5F0F8] relative ${active ? 'bg-primary-bg pl-3 pr-4' : 'hover:bg-surface pl-4 pr-4'}`}>
                {active && <span className="absolute left-0 top-0 bottom-0 w-1 rounded-r bg-primary" />}
                <span className={`text-[9px] font-bold w-5 shrink-0 ${active ? 'text-primary' : 'text-gray-800'}`}>{String(idx + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-[10px] font-semibold ${active ? 'text-primary' : 'text-gray-700'}`}>Oocyte #{log.oocyte_no}</p>
                    {imgCount > 0 && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{imgCount} img</span>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">{log.d0_maturity || 'D0 maturity not set'}</p>
                </div>
                {grade ? (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${chipCls(grade)}`}>{grade}</span>
                ) : (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 shrink-0">Ungraded</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

