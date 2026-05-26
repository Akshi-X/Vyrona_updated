import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Check, Trash2, ImageIcon, Trophy, Lightbulb, Pencil, X, ShieldCheck, Shield, Minus, Sparkles, AlertCircle } from 'lucide-react';
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
  if (val === 'None' || val === 'Not Hatching') return 'bg-emerald-50 border border-emerald-200 text-emerald-700';
  if (val === 'Minimal' || val === 'Mild')      return 'bg-amber-50 border border-amber-200 text-amber-700';
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

const assessmentValueIcon = (val: string) => {
  const p = { size: 8, strokeWidth: 2.5 };
  if (val === 'Not Hatching') return <ShieldCheck {...p} />;
  if (val === 'Intact')       return <Shield {...p} />;
  if (val === 'Excellent')    return <Sparkles {...p} />;
  if (val === 'Fine')         return <Check {...p} />;
  if (val === 'None')         return <Minus {...p} />;
  if (val === 'Minimal' || val === 'Mild') return <AlertCircle {...p} />;
  return null;
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
  const [slotIndex, setSlotIndex] = useState(0);

  // Select Best Grade step
  const [selectedImageIdx, setSelectedImageIdx] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<'Low' | 'Medium' | 'High' | null>(null);
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
  const [gradesError, setGradesError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [noteDraft, setNoteDraft] = useState('');
  const [activeSection, setActiveSection] = useState<'note' | null>(null);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveSelectedIdx, setApproveSelectedIdx] = useState<number | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);

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
  }, [selectedImageIdx, existingGrades]);

  // ── Image slot handlers ───────────────────────────────────────────────────

  const addImageSlot = (file: File) => {
    if (existingGrades.length + imageSlots.length >= 4) return;
    setImageSlots(prev => [...prev, { file, url: URL.createObjectURL(file) }]);
    setUploadError(null);
  };

  const removeImageSlot = (idx: number) => {
    setImageSlots(prev => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearAll = () => {
    imageSlots.forEach(s => URL.revokeObjectURL(s.url));
    setImageSlots([]);
    setUploadError(null);
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
    setUploadError(null);
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
        } else if (full.logs.length > 0) {
          setSelectedOocyteNo(full.logs[0].oocyte_no);
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
        if (active.length > 0) { setSelectedImageIdx(0); setSlotIndex(0); }
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
    setUploadError(null);
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
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
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

  const tileImg      = selectedGrade?.images[0] ?? null;
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

      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(280px,1fr)_300px] xl:grid-rows-1 gap-4 flex-1 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── LEFT PANEL ── hidden during processing spinner ── */}
        <aside className={`overflow-y-auto flex flex-col gap-3 pr-0.5 h-full ${step === 'processing' ? 'hidden' : ''}`}>
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
            {[
              { label: 'Expansion', color: '#7c3aed', grade: expDigit,  text: expLabel  },
              { label: 'ICM',       color: '#0891b2', grade: icmLetter, text: icmLabel  },
              { label: 'TE',        color: '#059669', grade: teLetter,  text: teLabel   },
            ].map((item, i, arr) => (
              <div key={item.label} className={`px-4 py-3 flex flex-col gap-0.5${i < arr.length - 1 ? ' border-b border-line-light' : ''}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: item.color }}>{item.label}</span>
                  <span className="text-[11px] font-black" style={{ color: item.color }}>{item.grade}</span>
                </div>
                <p className="text-[9px] text-gray-500 leading-snug">{item.text ?? (selectedGrade ? 'No data available.' : 'Select an image to view.')}</p>
              </div>
            ))}
          </div>
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
          const mainImgUrl = selGrade?.images[0]?.upload_image_url ?? (selectedImageIdx == null && imageSlots[0]?.url) ?? null;
          return (
            <div className="flex flex-col gap-3 h-full min-h-0">
              {/* Embryo Preview card */}
              <div className="rounded-xl border border-line bg-white overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-4 py-2.5 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0">
                  <p className="text-xs font-bold text-gray-800">Embryo Preview</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">Select a graded image to preview it here. Click a slot below to switch.</p>
                </div>
                <div className={`relative flex-1 min-h-0 ${mainImgUrl ? 'bg-black' : 'bg-gray-50'}`}>
                  {mainImgUrl ? (
                    <img src={mainImgUrl} alt="Selected oocyte" className="w-full h-full object-contain absolute inset-0" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <ImageIcon size={20} className="text-gray-300" />
                      </div>
                      <p className="text-[10px] font-semibold text-gray-400">No image selected</p>
                      <p className="text-[9px] text-gray-300">Upload images below or select from the strip</p>
                    </div>
                  )}
                  {selGrade && (
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
                  {selGrade?.is_best && (
                    <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-primary/80 text-white text-[8px] font-bold backdrop-blur-sm">Best</span>
                  )}
                </div>
              </div>

              {/* Image Slots card */}
              <div className="rounded-xl border border-line bg-white overflow-hidden shrink-0">
                <div className="p-2">
                  {(() => {
                    const total = existingGrades.length + imageSlots.length;
                    const safeIdx = Math.min(slotIndex, Math.max(0, total - 1));
                    const currentGrade = safeIdx < existingGrades.length ? existingGrades[safeIdx] : null;
                    const isSelected   = selectedImageIdx === safeIdx && currentGrade != null;
                    return (
                      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.max(0, safeIdx - 1);
                            setSlotIndex(next);
                            setSelectedImageIdx(next < existingGrades.length ? next : null);
                          }}
                          disabled={safeIdx === 0}
                          className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-50 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors border-r border-gray-200 shrink-0"
                        >
                          <ChevronLeft size={18} strokeWidth={2.5} />
                        </button>
                        <div className="flex-1 flex flex-col items-center justify-center py-1.5 gap-1">
                          <span className="text-sm font-black text-gray-800 tabular-nums leading-none">
                            {total > 0 ? safeIdx + 1 : 0} / {total}
                          </span>
                          {total > 0 && (
                            <div className="flex items-center gap-1">
                              {currentGrade?.grade && (
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border ${gradeTextCls(currentGrade.grade)} bg-white border-current/20`}>
                                  {currentGrade.grade}
                                </span>
                              )}
                              {currentGrade?.is_best && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                                  Best
                                </span>
                              )}
                              {isSelected && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Selected
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = Math.min(total - 1, safeIdx + 1);
                            setSlotIndex(next);
                            setSelectedImageIdx(next < existingGrades.length ? next : null);
                          }}
                          disabled={total === 0 || safeIdx >= total - 1}
                          className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-50 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors border-l border-gray-200 shrink-0"
                        >
                          <ChevronRight size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {(() => {
                const tiles = [
                  { label: 'Expansion', grade: expDigit,  src: tileImg?.exp_img_url, color: '#7c3aed' },
                  { label: 'ICM',       grade: icmLetter, src: tileImg?.icm_img_url, color: '#0891b2' },
                  { label: 'TE',        grade: teLetter,  src: tileImg?.te_img_url,  color: '#059669' },
                ];
                return (
                  <div className="rounded-xl border border-line bg-white overflow-hidden shrink-0">
                    <div className="grid grid-cols-3 divide-x divide-line-light">
                      {tiles.map(tile => (
                        <div key={tile.label} className="relative bg-gray-50 overflow-hidden" style={{ height: 120 }}>
                          {tile.src ? (
                            <img src={tile.src} alt={tile.label} className="w-full h-full object-cover block" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <ImageIcon size={14} className="text-gray-300" />
                            </div>
                          )}
                          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)' }} />
                          <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5">
                            <p className="text-[7px] font-bold uppercase tracking-widest leading-none mb-0.5 text-white/70">{tile.label}</p>
                            <p className="text-lg font-black text-white leading-none">{tile.grade}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ── COL 3: action buttons + panels + embryo details ── */}
        {step === 'select-best' && (() => {
          const panelBg = { background: 'linear-gradient(135deg, #f5f0ff 0%, #ede9fe 100%)' };
          return (
            <div className="overflow-y-auto flex flex-col gap-3 pr-0.5 h-full">

              {/* Action buttons */}
              <div className="flex flex-col gap-2 shrink-0">
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
                  Approve Embryo Grading
                </button>
              </div>

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
                    {noteDraft.trim() && (
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
                    <button type="button" disabled={!noteDraft.trim()}
                      className="w-full py-1.5 rounded-xl text-[9px] font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
                      style={{ background: 'var(--gradient-primary)' }}>
                      Update Note
                    </button>
                    <p className="text-[8px] text-gray-400 text-center leading-relaxed">
                      AI assessment is for reference only and does not replace clinical judgment.
                    </p>
                  </div>
                </div>
              )}

              {/* Embryo Details */}
              <div className="rounded-xl border border-line bg-white p-4 shrink-0">
                <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase mb-3">Embryo Details</p>
                <table className="w-full text-[10px]">
                  <tbody className="divide-y divide-[#F8F4FD]">
                    {[
                      { label: 'Patient ID',   value: embryo?.hisNumber || his || '—' },
                      { label: 'Oocyte No.',   value: selectedOocyteNo != null ? String(selectedOocyteNo) : '—' },
                      { label: 'D0 Maturity',  value: selectedLog?.d0_maturity || '—' },
                      { label: 'D1 PN',        value: selectedLog?.d1_pn || '—' },
                      { label: 'D3 Grade',     value: selectedLog?.d3_grade || '—' },
                      { label: 'Fate',         value: selectedLog?.fate || '—' },
                    ].map(r => (
                      <tr key={r.label}>
                        <td className="py-1.5 text-gray-600 font-medium">{r.label}</td>
                        <td className="py-1.5 text-gray-900 font-semibold text-right">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Result Preview */}
              <div className="rounded-xl border border-line bg-white overflow-hidden shrink-0">
                <div className="px-3 py-2.5 border-b border-line-light bg-gradient-to-r from-surface to-white">
                  <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Result (Preview)</p>
                </div>
                {selectedGrade ? (() => {
                  const g = selectedGrade;
                  const thumb = g.images[0]?.upload_image_url ?? null;
                  const score = g.ai_score ?? null;
                  return (
                    <div className="flex flex-col divide-y divide-[#F8F4FD]">
                      {/* Identity row */}
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                          {thumb
                            ? <img src={thumb} alt="thumb" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={14} className="text-gray-300" /></div>
                          }
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <p className="text-[10px] font-bold text-gray-800">Oocyte #{selectedOocyteNo ?? '—'}</p>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                              Image #{(selectedImageIdx ?? 0) + 1}
                            </span>
                            {g.grade && (
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-current/20 ${gradeTextCls(g.grade)}`}>
                                {g.grade}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Grade + Score */}
                      <div className="px-3 py-2.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-semibold tracking-widest text-gray-400 uppercase">Grade</span>
                          <span className={`text-base font-black ${g.grade ? gradeTextCls(g.grade) : 'text-gray-400'}`}>{g.grade || '—'}</span>
                        </div>
                        {score != null && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-semibold tracking-widest text-gray-400 uppercase">AI Score</span>
                              <span className={`text-[10px] font-black ${scoreTextCls(score)}`}>{score} / 10</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className={`h-full rounded-full ${scoreBarCls(score)}`} style={{ width: `${(score / 10) * 100}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Quality Flags */}
                      {(g.hatching || g.vacuolization || g.multinucleation) && (
                        <div className="px-3 py-2.5 flex flex-col gap-1.5">
                          <p className="text-[8px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">Quality Flags</p>
                          {[
                            { label: 'Hatching',        val: g.hatching },
                            { label: 'Vacuolization',   val: g.vacuolization },
                            { label: 'Multinucleation', val: g.multinucleation },
                          ].filter(r => r.val).map(r => (
                            <div key={r.label} className="flex items-center justify-between">
                              <span className="text-[9px] text-gray-500">{r.label}</span>
                              <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-full ${flagBadgeCls(r.val!)}`}>{r.val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Morphology */}
                      {(g.zona_pellucida || g.blastocoel || g.cytoplasmic_granularity || g.bridge) && (
                        <div className="px-3 py-2.5 flex flex-col gap-1.5">
                          <p className="text-[8px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">Morphology</p>
                          {[
                            { label: 'Zona Pellucida', val: g.zona_pellucida },
                            { label: 'Blastocoel',     val: g.blastocoel },
                            { label: 'Cyto. Gran.',    val: g.cytoplasmic_granularity },
                            { label: 'Bridge',         val: g.bridge },
                          ].filter(r => r.val).map(r => (
                            <div key={r.label} className="flex items-center justify-between">
                              <span className="text-[9px] text-gray-500">{r.label}</span>
                              <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-full ${flagBadgeCls(r.val!)}`}>{r.val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="px-3 py-6 text-center">
                    <p className="text-[9px] text-gray-400">Select an image to see result preview.</p>
                  </div>
                )}
              </div>

            </div>
          );
        })()}
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-line bg-white mt-4 shrink-0 -mx-6 -mb-6">
        {step === 'processing' && (
          <p className="text-xs text-gray-400 mx-auto">Analyzing — please wait...</p>
        )}
        {step === 'select-best' && (
          <>
            <div className="flex items-center gap-4">
              {imageSlots.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-amber-600">{imageSlots.length} pending upload</p>
                  <button type="button" onClick={clearAll} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={12} /> Clear
                  </button>
                </>
              )}
              {uploadError && <p className="text-[10px] text-red-500 font-medium">{uploadError}</p>}
            </div>
            <div className="flex items-center gap-3">
              {imageSlots.length > 0 && (
                <button type="button" disabled={uploading || selectedOocyteNo == null} onClick={handleStartAnalysis}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg border border-primary text-primary text-xs font-semibold hover:bg-primary-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {uploading ? 'Uploading...' : 'Start AI Analysis'}
                  {!uploading && <ChevronRight size={14} />}
                </button>
              )}
              <button type="button" disabled={selectedImageIdx === null || completing} onClick={handleConfirmSelection}
                className="inline-flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--gradient-primary)' }}>
                <div className="flex flex-col items-start">
                  <span className="text-[8px] font-semibold text-white/60 leading-none mb-0.5 uppercase tracking-widest">
                    {completing ? 'Saving…' : 'Grading complete'}
                  </span>
                  <span className="text-xs font-bold leading-none">Development Tracker</span>
                </div>
                <ArrowRight size={15} className="shrink-0 opacity-80" />
              </button>
            </div>
          </>
        )}
      </div>

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
    <div className={`rounded-xl border bg-white overflow-hidden flex flex-col min-h-[220px] ${locked ? 'border-line opacity-60 pointer-events-none' : 'border-line'}`}>
      <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0">
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
                <span className={`text-[9px] font-bold w-5 shrink-0 ${active ? 'text-primary' : 'text-gray-300'}`}>{String(idx + 1).padStart(2, '0')}</span>
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

