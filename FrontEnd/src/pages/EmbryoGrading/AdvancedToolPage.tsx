import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, Upload, Info, Check, Trash2, ImageIcon, Zap, Focus, Calendar, Trophy, Lightbulb, Pencil, X, Maximize2, ShieldCheck, Shield, Minus, Sparkles, AlertCircle } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { IVFTreatment } from '../../types/ivf';
import { ivfService, type IvfCycleLog, type IvfGrade } from '../../services/ivfService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'select-best' | 'processing' | 'result';

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

const ANNOTATION_IMG = '/embryo/annotation.png';

const KEY_STRENGTHS = [
  'Excellent inner cell mass quality',
  'Well-organized trophectoderm cells',
  'Fully expanded blastocyst',
  'Intact zona pellucida',
  'Minimal fragmentation',
];

const TRANSFER_RANK = 2;

const IMAGE_GUIDELINES = [
  { icon: ImageIcon, title: 'High-quality microscopy',  desc: 'Use images from calibrated time-lapse or inverted microscopes' },
  { icon: Focus,     title: 'Clear focus & lighting',   desc: 'Ensure the embryo is in sharp focus with minimal noise or glare' },
  { icon: Zap,       title: 'Correct file format',      desc: 'PNG, JPG, or TIFF at minimum 400 × 400 pixels' },
  { icon: Calendar,  title: 'Match development day',    desc: 'Upload the image captured on the relevant development day' },
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

// ── Step order for bar ────────────────────────────────────────────────────────

const stepBarOrder = (s: Step): number => {
  if (s === 'upload')      return 1;
  if (s === 'select-best' || s === 'processing') return 2;
  if (s === 'result')      return 3;
  return 0;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedEmbryoGradingPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const routeState = (location.state as AdvancedEmbryoRouteState) || {};
  const embryo = routeState.embryo;

  const [step, setStep] = useState<Step>('upload');

  // Override mode (inline in result step)
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideVals, setOverrideVals] = useState<OverrideVals | null>(null);

  // Single selected oocyte
  const [selectedOocyteNo, setSelectedOocyteNo] = useState<number | null>(null);

  // Multiple image slots — each becomes its own IvfOocyteGrade
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);

  // Select Best Grade step
  const [selectedImageIdx, setSelectedImageIdx] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<'Low' | 'Medium' | 'High' | null>(null);
  const [deactivateConfirmIdx, setDeactivateConfirmIdx] = useState<number | null>(null);
  const [deactivateGradeId, setDeactivateGradeId] = useState<number | null>(null);

  // Grade IDs created during analysis (index matches imageSlots)
  const [createdGradeIds, setCreatedGradeIds] = useState<number[]>([]);
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Oocyte list
  const [logs, setLogs] = useState<IvfCycleLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [gradeCountMap, setGradeCountMap] = useState<Record<number, number>>({});

  // Existing grades for selected oocyte
  const [existingGrades, setExistingGrades] = useState<IvfGrade[]>([]);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Result step UI
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedLog   = logs.find(l => l.oocyte_no === selectedOocyteNo);
  const currentSrc    = selectedImageIdx != null ? imageSlots[selectedImageIdx]?.url : imageSlots[0]?.url;
  const selectedGrade = selectedImageIdx != null ? existingGrades[selectedImageIdx] ?? null : null;

  const rsScore     = selectedGrade?.ai_score ?? 0;
  const rsGrade     = overrideVals?.grade ?? selectedGrade?.grade ?? '—';
  const rsRingColor = rsScore >= 8.5 ? '#34d399' : rsScore >= 7 ? '#fbbf24' : '#fb923c';

  // ── Image slot handlers ───────────────────────────────────────────────────

  const addImageSlot = (file: File) => {
    if (existingGrades.length + imageSlots.length >= 4) return;
    setImageSlots(prev => [...prev, { file, url: URL.createObjectURL(file) }]);
    setUploadError(null);
  };

  const replaceImageSlot = (idx: number, file: File) => {
    setImageSlots(prev => {
      URL.revokeObjectURL(prev[idx].url);
      const next = [...prev];
      next[idx] = { file, url: URL.createObjectURL(file) };
      return next;
    });
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
    if (step !== 'upload') return;
    if (no === selectedOocyteNo) return;
    imageSlots.forEach(s => URL.revokeObjectURL(s.url));
    setImageSlots([]);
    setExistingGrades([]);
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
      if (!cancelled) setGradeCountMap(Object.fromEntries(full.logs.map(l => [l.log_id, l.grade_count])));
    }).catch(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [his]);

  // ── Fetch existing grades for selected oocyte ─────────────────────────────

  useEffect(() => {
    if (selectedOocyteNo == null || cycleId == null || !selectedLog) {
      setExistingGrades([]);
      return;
    }
    let cancelled = false;
    ivfService.listGrades(cycleId, selectedLog.log_id)
      .then(g => { if (!cancelled) setExistingGrades(g.filter(gr => gr.is_active !== false)); })
      .catch(() => { if (!cancelled) setExistingGrades([]); });
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

  const handleConfirmSelection = async () => {
    if (selectedImageIdx === null || cycleId == null || !selectedLog) return;
    const gradeId = existingGrades[selectedImageIdx]?.grade_id ?? createdGradeIds[selectedImageIdx];
    if (gradeId != null) {
      try {
        await ivfService.selectBestGrade(cycleId, selectedLog.log_id, gradeId);
      } catch {
        // non-blocking — proceed to result even if select-best fails
      }
    }
    setStep('result');
  };

  const toggleOverride = () => {
    if (!overrideMode && selectedGrade) {
      setOverrideVals({
        grade: selectedGrade.grade ?? '',
        hatching: selectedGrade.hatching ?? '',
        vacuolization: selectedGrade.vacuolization ?? '',
        multinucleation: selectedGrade.multinucleation ?? '',
        fragmentation: '',
        symmetry: '',
        zona_pellucida: selectedGrade.zona_pellucida ?? '',
        blastocoel: selectedGrade.blastocoel ?? '',
        cyto_gran: selectedGrade.cytoplasmic_granularity ?? '',
        bridge: selectedGrade.bridge ?? '',
      });
    }
    setOverrideMode(v => !v);
  };

  const locked = step !== 'upload';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <StepBar currentStep={step} />

      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(320px,1fr)_320px] xl:grid-rows-1 gap-4 min-h-0 flex-1">

        {/* ── LEFT PANEL ── hidden during processing spinner ── */}
        <aside className={`flex flex-col gap-3 overflow-y-auto pr-0.5 ${step === 'processing' ? 'hidden' : ''}`} style={{ maxHeight: 'calc(100vh - 14rem)' }}>
          <OocyteList
            logs={logs}
            loading={logsLoading}
            selectedOocyteNo={selectedOocyteNo}
            imageSlots={imageSlots}
            gradeCountMap={gradeCountMap}
            locked={locked}
            onSelect={handleOocyteSelect}
          />
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase mb-3">Embryo Details</p>
            <table className="w-full text-[10px]">
              <tbody className="divide-y divide-[#F8F4FD]">
                {[
                  { label: 'Patient ID',  value: embryo?.hisNumber || his || '—' },
                  { label: 'Oocyte No.', value: selectedOocyteNo != null ? String(selectedOocyteNo) : '—' },
                  { label: 'D0 Maturity', value: selectedLog?.d0_maturity || '—' },
                  { label: 'D1 PN',      value: selectedLog?.d1_pn || '—' },
                  { label: 'D3 Grade',   value: selectedLog?.d3_grade || '—' },
                  { label: 'Fate',       value: selectedLog?.fate || '—' },
                ].map(r => (
                  <tr key={r.label}>
                    <td className="py-1.5 text-gray-600 font-medium">{r.label}</td>
                    <td className="py-1.5 text-gray-900 font-semibold text-right">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>

        {/* ── CENTER PANEL ── */}

        {/* Upload */}
        {step === 'upload' && (
          <section className="rounded-lg border border-line bg-white overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0">
              <p className="text-xs font-bold text-gray-800">Upload Embryo Images</p>
              {selectedOocyteNo == null ? (
                <p className="text-[10px] text-gray-400 mt-0.5">Select an oocyte from the left panel to begin</p>
              ) : (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                    Oocyte #{selectedOocyteNo}
                  </span>
                  <span className="text-[10px] text-gray-400">each image creates a separate grade record</span>
                </div>
              )}
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {selectedOocyteNo == null ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-line min-h-[260px]">
                  <div className="w-14 h-14 rounded-full bg-primary-bg flex items-center justify-center text-primary">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-gray-500">Select an oocyte first</p>
                    <p className="text-[10px] text-gray-400 mt-1">Pick an oocyte from the panel on the left to begin</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {/* Already graded records */}
                  {existingGrades.map((grade, idx) => {
                    const imgUrl = grade.images[0]?.upload_image_url;
                    const icmTe = (grade.grade ?? '').slice(1);
                    const gradeChipCls = icmTe === 'AA' ? 'bg-emerald-500' : icmTe === 'BB' ? 'bg-yellow-500' : 'bg-amber-500';
                    return (
                      <div key={grade.grade_id} className="relative rounded-xl border border-line overflow-hidden aspect-square bg-black">
                        {imgUrl
                          ? <img src={imgUrl} alt="" className="w-full h-full object-contain" />
                          : <div className="absolute inset-0 flex items-center justify-center"><ImageIcon size={28} className="text-gray-600" /></div>
                        }
                        {/* Graded badge top-left */}
                        <div className="absolute top-2 left-2 flex items-center gap-0.5 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full z-10">
                          <Check size={8} />
                          <span>Graded</span>
                        </div>
                        {/* Deactivate top-right */}
                        <button type="button" onClick={() => setDeactivateGradeId(grade.grade_id)}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors z-10">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                        {/* Bottom gradient */}
                        <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/75 to-transparent z-10">
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-[9px] font-bold text-white leading-tight">Image #{idx + 1}</p>
                              {grade.ai_score != null && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-white/20 text-white text-[8px] font-semibold">
                                  AI {grade.ai_score.toFixed(1)}
                                </span>
                              )}
                            </div>
                            {grade.grade && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${gradeChipCls}`}>{grade.grade}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* New upload slots */}
                  {imageSlots.map((slot, idx) => (
                    <ImageSlotCard
                      key={idx}
                      slotIndex={idx}
                      url={slot.url}
                      log={selectedLog ?? null}
                      onReplace={file => replaceImageSlot(idx, file)}
                      onRemove={() => removeImageSlot(idx)}
                    />
                  ))}
                  {existingGrades.length + imageSlots.length < 4 && (
                    <label className="rounded-xl border-2 border-dashed border-line aspect-square flex flex-col items-center justify-center gap-2.5 cursor-pointer bg-gray-50 hover:bg-primary-bg hover:border-primary/30 transition-all group">
                      <div className="w-9 h-9 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-primary/40 group-hover:text-primary transition-colors">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                      <div className="text-center px-3">
                        <p className="text-[9px] font-semibold text-gray-500 group-hover:text-primary transition-colors">
                          {existingGrades.length + imageSlots.length === 0 ? 'Add image' : 'Add another image'}
                        </p>
                        <p className="text-[9px] text-gray-400 mt-0.5">PNG, JPG, TIFF</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) addImageSlot(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* AI Processing spinner (spans all 3 cols) */}
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

        {/* Select Best Grade */}
        {step === 'select-best' && (
          <section className="rounded-lg border border-line bg-white overflow-hidden flex flex-col min-h-0">
            {/* Header */}
            <div className="px-5 py-4 border-b border-line-light flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
                  <Trophy size={15} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Which image has the better grade?</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Select the image that you believe has higher implantation potential.</p>
                </div>
              </div>
              <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-[10px] font-semibold text-primary hover:bg-primary-bg transition-colors shrink-0">
                <Lightbulb size={12} /> View comparison tips
              </button>
            </div>

            {/* Image cards */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {existingGrades.map((grade, idx) => {
                  const imgUrl = grade.images[0]?.upload_image_url;
                  const score = grade.ai_score ?? 0;
                  const gradeVal = grade.grade ?? '—';
                  const isSelected = selectedImageIdx === idx;
                  return (
                    <button
                      key={grade.grade_id}
                      type="button"
                      onClick={() => setSelectedImageIdx(idx)}
                      className={`relative rounded-xl border-2 overflow-hidden aspect-square flex flex-col text-left transition-all ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-line hover:border-primary/40'
                      }`}
                    >
                      {/* YOU SELECTED banner */}
                      {isSelected && (
                        <div className="absolute top-0 left-0 right-0 z-20 flex justify-center pointer-events-none">
                          <span className="px-3 py-0.5 bg-primary text-white text-[9px] font-bold tracking-wide rounded-b-lg">
                            YOU SELECTED
                          </span>
                        </div>
                      )}

                      {/* Number badge */}
                      <span className="absolute top-2 left-2 z-10 w-5 h-5 rounded bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>

                      {/* Deactivate x */}
                      <button type="button" onClick={e => { e.stopPropagation(); setDeactivateGradeId(grade.grade_id); }}
                        className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors">
                        <X size={9} />
                      </button>

                      {/* Prev. Best badge */}
                      {grade.is_best && (
                        <span className="absolute bottom-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-white/80 border border-primary/30 text-primary/60 text-[8px] font-bold leading-none backdrop-blur-sm">
                          Prev. Best
                        </span>
                      )}

                      {/* Image */}
                      <div className="aspect-[4/3] bg-black shrink-0">
                        {imgUrl ? (
                          <img src={imgUrl} alt={`Image ${idx + 1}`} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon size={24} className="text-gray-600" />
                          </div>
                        )}
                      </div>

                      {/* Card body */}
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        <div className="flex items-center gap-1.5 pb-2 border-b border-line-light">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/[0.07] border border-primary/10 text-primary text-[9px] font-bold tracking-wide leading-none">
                            <ImageIcon size={9} />
                            image #{idx + 1}
                          </span>
                        </div>

                        {/* Grade + score */}
                        <div>
                          <div className="flex items-baseline justify-between">
                            <div>
                              <p className="text-[9px] text-gray-400 font-medium mb-0.5">Grade</p>
                              <p className={`text-xl font-extrabold leading-none ${gradeTextCls(gradeVal)}`}>{gradeVal}</p>
                            </div>
                            <p className="text-[10px] font-bold text-gray-600">{score.toFixed(1)} / 10</p>
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full ${scoreBarCls(score)}`} style={{ width: `${(score / 10) * 100}%` }} />
                          </div>
                        </div>

                        {/* Quality flags */}
                        <div>
                          <p className="text-[8px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Quality Flags</p>
                          <div className="flex flex-col gap-1">
                            {[
                              { label: 'Hatching',        val: grade.hatching },
                              { label: 'Vacuolization',   val: grade.vacuolization },
                              { label: 'Multinucleation', val: grade.multinucleation },
                            ].map(f => (
                              <div key={f.label} className="flex items-center justify-between">
                                <span className="text-[8px] text-gray-500">{f.label}</span>
                                <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${flagBadgeCls(f.val ?? '')}`}>{f.val ?? '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Radio */}
                        <div className="mt-auto pt-2 flex justify-center">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                            {isSelected && <Check size={9} className="text-white" strokeWidth={3} />}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selection summary bar */}
            {selectedImageIdx !== null && (() => {
              const gradeStr = existingGrades[selectedImageIdx]?.grade ?? '';
              const icmTe = gradeStr.slice(1);
              return (
                <div className="px-5 py-2.5 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={9} className="text-white" strokeWidth={3} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[10px] text-gray-600">You have selected:</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/[0.07] border border-primary/10 text-primary text-[9px] font-bold leading-none">
                        <ImageIcon size={9} />
                        image #{selectedImageIdx + 1}
                      </span>
                      {gradeStr && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          icmTe === 'AA' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : icmTe === 'BB' ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>{gradeStr}</span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-400">You can change your selection before confirming.</p>
                  </div>
                  <button type="button" onClick={() => setSelectedImageIdx(null)}
                    className="flex items-center gap-1 text-[9px] font-semibold text-gray-500 hover:text-red-500 transition-colors">
                    <Trash2 size={11} /> Clear selection
                  </button>
                </div>
              );
            })()}


          </section>
        )}

        {/* Result — main assessment panel */}
        {step === 'result' && (
          <section className="rounded-lg border border-line bg-white overflow-hidden flex flex-col min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-line bg-white shrink-0 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <Trophy size={13} className="text-amber-500" />
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 flex-1">Best Image Used for Grading</p>
              <div className="flex items-center gap-2 shrink-0">
                {selectedImageIdx != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/[0.07] border border-primary/10 text-primary text-[9px] font-bold leading-none">
                    <ImageIcon size={8} /> Image {selectedImageIdx + 1}
                  </span>
                )}
              </div>
            </div>

            {/* Image + AI grade split */}
            <div className="flex gap-5 px-5 pt-5 pb-6 border-b border-line-light shrink-0">
              {/* Embryo image */}
              <div className="relative w-[220px] shrink-0 rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4 / 3' }}>
                <img src={showAnnotations ? ANNOTATION_IMG : currentSrc} alt="Best oocyte"
                  className="absolute inset-0 w-full h-full object-contain" />
                <button type="button" onClick={() => setShowAnnotations(v => !v)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
                  <Maximize2 size={11} />
                </button>
              </div>

              {/* AI grade info */}
              <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
                <div className="flex items-center gap-5">
                  {/* Score ring */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="relative" style={{ width: 80, height: 80 }}>
                      <svg viewBox="0 0 80 80" width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="7" />
                        <circle cx="40" cy="40" r="32" fill="none" stroke={rsRingColor} strokeWidth="7"
                          strokeLinecap="round" strokeDasharray={`${(2 * Math.PI * 32) * (rsScore / 10)} ${2 * Math.PI * 32}`} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-xl font-black leading-none ${scoreTextCls(rsScore)}`}>{rsScore}</span>
                      </div>
                    </div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">AI Score</span>
                  </div>

                  <div className="w-px self-stretch bg-gray-100 shrink-0" />

                  {/* Grade */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">AI Grade</span>
                    <p className={`text-6xl font-black leading-none tracking-tight ${gradeTextCls(rsGrade)}`}>{rsGrade}</p>
                  </div>
                </div>

                {/* Description — sits at bottom */}
                {selectedGrade?.note && <p className="text-[10px] text-gray-400 leading-relaxed">{selectedGrade.note}</p>}
              </div>
            </div>

            {/* Detailed Assessment */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-4 pb-2 pt-4 shrink-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-700">Detailed Assessment</p>
              </div>

              {/* ICM / TE / Expansion — image tiles */}
              {(() => {
                const g = selectedGrade;
                const gradeStr = g?.grade ?? '';
                const expDigit = gradeStr[0] ?? '—';
                const icmLetter = gradeStr[1] ?? '—';
                const teLetter  = gradeStr[2] ?? '—';
                const icmLabel = icmLetter === 'A' ? 'Many Cells' : icmLetter === 'B' ? 'Few Cells' : icmLetter === 'C' ? 'Very Few' : '—';
                const teLabel  = teLetter  === 'A' ? 'Many Cells' : teLetter  === 'B' ? 'Few Cells' : teLetter  === 'C' ? 'Very Few' : '—';
                const expLabel = expDigit === '1' ? 'Early Blastocyst' : expDigit === '2' ? 'Blastocyst' : expDigit === '3' ? 'Full Blastocyst' : expDigit === '4' ? 'Expanded' : expDigit === '5' ? 'Expanded' : expDigit === '6' ? 'Hatching' : '—';
                const img = g?.images[0];
                const tiles = [
                  { label: 'Expansion',   grade: expDigit, sub: expLabel, img: img?.exp_img_url, desc: 'Blastocyst expansion stage' },
                  { label: 'ICM Quality', grade: icmLetter, sub: icmLabel, img: img?.icm_img_url, desc: 'Inner cell mass appearance and compactness' },
                  { label: 'TE Quality',  grade: teLetter,  sub: teLabel,  img: img?.te_img_url,  desc: 'Trophectoderm cell number and organization' },
                ];
                return (
                  <div className="mx-4 grid grid-cols-3 gap-2.5 mb-2">
                    {tiles.map(tile => (
                      <div key={tile.label} className="rounded-xl overflow-hidden flex flex-col"
                        style={{ border: '1px solid rgba(139,92,246,0.18)', boxShadow: '0 2px 10px rgba(109,40,217,0.07)' }}>
                        <div className="relative w-full aspect-square bg-black overflow-hidden">
                          {tile.img && <img src={tile.img} alt={tile.label} className="absolute inset-0 w-full h-full object-contain" />}
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(30,10,94,0.92) 0%, rgba(45,18,128,0.3) 55%, transparent 100%)' }} />
                          <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5">
                            <p className="text-[8px] font-bold text-white/60 uppercase tracking-widest leading-none mb-1">{tile.label}</p>
                            <p className="text-3xl font-black text-white leading-none drop-shadow-sm">{tile.grade}</p>
                            {tile.sub && <p className="text-[7px] text-white/50 font-medium mt-1 leading-tight">{tile.sub}</p>}
                          </div>
                        </div>
                        <div className="px-2.5 py-2" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, #ffffff 70%)' }}>
                          <p className="text-[7.5px] text-gray-400 leading-snug">{tile.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}


              {/* Assessment rows from DB grade */}
              <div className="mx-4 mb-3 grid grid-cols-2 gap-2">
                {[
                  { label: 'Hatching',        desc: 'Active zona pellucida breaching',    value: selectedGrade?.hatching },
                  { label: 'Vacuolization',   desc: 'Cytoplasmic vacuole presence',       value: selectedGrade?.vacuolization },
                  { label: 'Multinucleation', desc: 'Multiple nuclei in blastomeres',     value: selectedGrade?.multinucleation },
                  { label: 'Zona Pellucida',  desc: 'Zona thickness and integrity',       value: selectedGrade?.zona_pellucida },
                  { label: 'Blastocoel',      desc: 'Fluid-filled cavity expansion',      value: selectedGrade?.blastocoel },
                  { label: 'Cyto. Gran.',     desc: 'Cytoplasmic granularity texture',    value: selectedGrade?.cytoplasmic_granularity },
                  { label: 'Bridge',          desc: 'Cytoplasmic bridging between cells', value: selectedGrade?.bridge },
                ].map(row => {
                  const val = row.value ?? '—';
                  const good = ['Intact', 'None', 'Fine', 'Excellent', 'Not Hatching'].includes(val);
                  const warn = ['Minimal', 'Mild', 'Moderate', 'Hatching', 'Partially Hatching'].includes(val);
                  const badgeStyle = good
                    ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(52,211,153,0.08) 100%)', border: '1px solid rgba(16,185,129,0.3)', color: '#065f46' }
                    : warn
                      ? { background: 'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(245,158,11,0.08) 100%)', border: '1px solid rgba(245,158,11,0.3)', color: '#78350f' }
                      : { background: 'linear-gradient(135deg, rgba(156,163,175,0.15) 0%, rgba(209,213,219,0.08) 100%)', border: '1px solid rgba(156,163,175,0.3)', color: '#374151' };
                  return (
                    <div key={row.label} className="rounded-xl p-3 flex flex-col gap-1.5"
                      style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.05) 0%, #fff 100%)', border: '1px solid rgba(109,40,217,0.12)' }}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold text-gray-700 leading-tight">{row.label}</span>
                        <span className="inline-flex items-center gap-1 text-[8px] font-bold px-2 py-1 rounded-lg leading-none shrink-0" style={badgeStyle}>
                          {assessmentValueIcon(val)}
                          {val}
                        </span>
                      </div>
                      <p className="text-[7.5px] text-gray-400 leading-snug">{row.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* AI Insight banner */}
              <div className="mx-4 mb-4 mt-1 flex items-stretch rounded-xl overflow-hidden" style={{ border: '1px solid rgba(109,40,217,0.18)' }}>
                <div className="w-1 shrink-0" style={{ background: 'linear-gradient(to bottom, #7c3aed, #c084fc)' }} />
                <div className="flex-1 flex items-center gap-3 px-3 py-2.5" style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.05) 0%, #fff 100%)' }}>
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap size={10} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-0.5">AI Insight</p>
                    <p className="text-[9px] text-gray-500 leading-snug line-clamp-2">{selectedGrade?.note ?? 'AI grading complete. Review the assessment above and apply an override if needed.'}</p>
                  </div>
                  <button type="button" className="inline-flex items-center gap-1 text-[8px] font-bold text-primary shrink-0 hover:underline whitespace-nowrap">
                    More <Info size={8} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── RIGHT PANEL ── */}
        <aside className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 14rem)' }}>

          {/* Upload step — guidelines */}
          {step === 'upload' && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white">
                  <p className="text-xs font-bold text-gray-800">Image Guidelines</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Follow these tips for best AI results</p>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {IMAGE_GUIDELINES.map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5"><Icon size={13} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-800">{title}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {(() => {
                const gradedCount = existingGrades.length;
                const newCount    = imageSlots.length;
                const total       = gradedCount + newCount;
                const remaining   = 4 - total;
                const full        = total >= 4;
                return (
                  <div className="rounded-xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase">Grade Slots</p>
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${full ? 'text-emerald-600' : 'text-primary'}`}>
                        {full && <Check size={11} />}
                        {total} / 4
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all flex overflow-hidden" style={{ width: `${Math.min((total / 4) * 100, 100)}%` }}>
                        <div className="h-full bg-emerald-500" style={{ width: gradedCount > 0 ? `${(gradedCount / total) * 100}%` : '0%' }} />
                        <div className={`h-full ${full ? 'bg-emerald-400' : 'bg-primary'}`} style={{ flex: 1 }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      {gradedCount > 0 && (
                        <span className="flex items-center gap-1 text-[9px] text-emerald-600 font-semibold">
                          <Check size={9} /> {gradedCount} graded
                        </span>
                      )}
                      {newCount > 0 && (
                        <span className="text-[9px] text-primary font-semibold">{newCount} pending upload</span>
                      )}
                      {total === 0 && <span className="text-[9px] text-gray-400">No images yet</span>}
                      {!full && total > 0 && (
                        <span className="text-[9px] text-gray-400 ml-auto">{remaining} slot{remaining !== 1 ? 's' : ''} left</span>
                      )}
                      {full && <span className="text-[9px] text-emerald-600 ml-auto">All slots filled</span>}
                    </div>
                  </div>
                );
              })()}
              <div className="rounded-lg border border-dashed border-[#D8C7E3] bg-primary-bg p-5 flex flex-col items-center justify-center gap-2 text-center">
                <Info size={18} className="text-primary" />
                <p className="text-[10px] font-semibold text-gray-800">Results will appear here after AI analysis.</p>
                <p className="text-[10px] text-primary font-medium">Select an oocyte, upload images, then click Start AI Analysis.</p>
              </div>
            </div>
          )}

          {/* Select Best Grade step — result preview */}
          {step === 'select-best' && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white">
                  <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase">Result (Preview)</p>
                </div>
                {selectedImageIdx === null ? (
                  <div className="p-6 flex flex-col items-center gap-2 text-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <ImageIcon size={16} className="text-gray-400" />
                    </div>
                    <p className="text-[10px] font-semibold text-gray-500">No image selected</p>
                    <p className="text-[9px] text-gray-400">Select an image from the cards to see its preview.</p>
                  </div>
                ) : (() => {
                  const g = existingGrades[selectedImageIdx];
                  if (!g) return null;
                  const gradeVal = g.grade ?? '—';
                  const score = g.ai_score ?? 0;
                  const imgUrl = g.images[0]?.upload_image_url;
                  const gradeSuffix = gradeVal.slice(1);
                  const gradeChipCls = gradeSuffix === 'AA'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : gradeSuffix === 'AB' || gradeSuffix === 'BA'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-orange-50 border-orange-200 text-orange-700';
                  const qualityFlags = [
                    { label: 'Hatching',        value: g.hatching },
                    { label: 'Vacuolization',   value: g.vacuolization },
                    { label: 'Multinucleation', value: g.multinucleation },
                  ];
                  const morphology = [
                    { label: 'Zona Pellucida', value: g.zona_pellucida },
                    { label: 'Blastocoel',     value: g.blastocoel },
                    { label: 'Cyto. Gran.',    value: g.cytoplasmic_granularity },
                    { label: 'Bridge',         value: g.bridge },
                  ];
                  return (
                    <div className="flex flex-col divide-y divide-line-light">
                      <div className="px-4 py-3 flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-line bg-black shrink-0">
                          {imgUrl && <img src={imgUrl} alt="Selected" className="w-full h-full object-contain" />}
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-[10px] font-bold text-gray-700 leading-none">Oocyte #{selectedOocyteNo}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/[0.07] border border-primary/10 text-primary text-[9px] font-bold leading-none">
                              <ImageIcon size={8} /> image #{selectedImageIdx + 1}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border leading-none ${gradeChipCls}`}>{gradeVal}</span>
                          </div>
                        </div>
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Grade</span>
                          <span className={`text-lg font-extrabold leading-none ${gradeTextCls(gradeVal)}`}>{gradeVal}</span>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">AI Score</span>
                            <span className="text-[10px] font-bold text-gray-700">{score.toFixed(1)} / 10</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${scoreBarCls(score)}`} style={{ width: `${(score / 10) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-2">
                        <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Quality Flags</p>
                        <div className="flex flex-col gap-1.5">
                          {qualityFlags.map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500">{label}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${flagBadgeCls(value ?? '')}`}>{value ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-2">
                        <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Morphology</p>
                        <div className="flex flex-col gap-1.5">
                          {morphology.map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500">{label}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${flagBadgeCls(value ?? '')}`}>{value ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <p className="text-[9px] text-gray-400 text-center italic px-2">AI assessment is for reference only and does not replace clinical judgment.</p>
            <div className="rounded-xl border border-line bg-white px-3 py-2.5 flex items-center gap-3">
              <p className="text-[9px] font-semibold text-gray-400 shrink-0">Confidence</p>
              <div className="flex gap-1.5 flex-1">
                {(['Low', 'Medium', 'High'] as const).map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setConfidence(lvl)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg border text-[9px] font-semibold transition-all ${
                      confidence === lvl
                        ? 'border-primary bg-primary/[0.07] text-primary'
                        : 'border-line text-gray-400 hover:border-primary/30 hover:text-primary/70'
                    }`}
                  >
                    <span className="text-[11px] leading-none">{lvl === 'Low' ? '😞' : lvl === 'Medium' ? '😊' : '😄'}</span>
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Result right panel */}
          {step === 'result' && (
            overrideMode && overrideVals && selectedGrade ? (
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white">
                  <p className="text-[9px] font-semibold tracking-widest text-primary uppercase">Editing Override Values</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">Adjust fields then complete</p>
                </div>
                <div className="flex flex-col divide-y divide-line-light">
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg overflow-hidden border border-line bg-black shrink-0">
                      {selectedImageIdx != null && imageSlots[selectedImageIdx] && (
                        <img src={imageSlots[selectedImageIdx].url} alt="" className="w-full h-full object-contain" />
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-bold text-gray-700 leading-none">Oocyte #{selectedOocyteNo}</span>
                      <span className="text-[9px] text-gray-400">image #{selectedImageIdx != null ? selectedImageIdx + 1 : 1}</span>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Grade</span>
                    <input value={overrideVals.grade}
                      onChange={e => setOverrideVals(v => v ? { ...v, grade: e.target.value } : v)}
                      className="text-sm font-extrabold text-right border-b-2 border-primary outline-none w-14 text-primary bg-transparent" />
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-1.5">
                    <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">Quality Flags</p>
                    {([
                      { label: 'Hatching',        key: 'hatching'        as keyof OverrideVals, opts: ['Not Hatching', 'Hatching', 'Partially Hatching'] },
                      { label: 'Vacuolization',   key: 'vacuolization'   as keyof OverrideVals, opts: ['None', 'Mild', 'Moderate', 'Severe'] },
                      { label: 'Multinucleation', key: 'multinucleation' as keyof OverrideVals, opts: ['None', 'Minimal', 'Present'] },
                    ]).map(({ label, key, opts }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">{label}</span>
                        <select value={overrideVals[key]}
                          onChange={e => setOverrideVals(v => v ? { ...v, [key]: e.target.value } : v)}
                          className="text-[9px] font-bold border border-primary/30 rounded-md px-1.5 py-0.5 outline-none text-primary bg-primary/[0.04] max-w-[130px]">
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-1.5">
                    <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">Morphology</p>
                    {([
                      { label: 'Fragmentation',  key: 'fragmentation'  as keyof OverrideVals, opts: ['< 5%', '< 10%', '< 15%', '< 20%', '> 20%'] },
                      { label: 'Symmetry',       key: 'symmetry'       as keyof OverrideVals, opts: ['Excellent', 'Good', 'Fair', 'Poor'] },
                      { label: 'Zona Pellucida', key: 'zona_pellucida' as keyof OverrideVals, opts: ['Intact', 'Good', 'Thinning'] },
                      { label: 'Blastocoel',     key: 'blastocoel'     as keyof OverrideVals, opts: ['Excellent', 'Good', 'Fair', 'Poor'] },
                      { label: 'Cyto. Gran.',    key: 'cyto_gran'      as keyof OverrideVals, opts: ['Fine', 'Coarse'] },
                      { label: 'Bridge',         key: 'bridge'         as keyof OverrideVals, opts: ['None', 'Minimal', 'Present'] },
                    ]).map(({ label, key, opts }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">{label}</span>
                        <select value={overrideVals[key]}
                          onChange={e => setOverrideVals(v => v ? { ...v, [key]: e.target.value } : v)}
                          className="text-[9px] font-bold border border-primary/30 rounded-md px-1.5 py-0.5 outline-none text-primary bg-primary/[0.04] max-w-[130px]">
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-4">
                    <button type="button" disabled={overrideSaving}
                      onClick={async () => {
                        if (!overrideVals || cycleId == null) { setOverrideMode(false); return; }
                        const gradeId = selectedImageIdx != null ? createdGradeIds[selectedImageIdx] : undefined;
                        if (gradeId != null) {
                          setOverrideSaving(true);
                          try {
                            await ivfService.updateGrade(cycleId, gradeId, {
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
                            // silent — override values are already reflected in UI
                          } finally {
                            setOverrideSaving(false);
                          }
                        }
                        setOverrideMode(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[11px] font-bold tracking-wide hover:opacity-90 transition-opacity disabled:opacity-60"
                      style={{ background: 'var(--gradient-primary)' }}>
                      <Check size={13} strokeWidth={2.5} />
                      {overrideSaving ? 'Saving…' : 'Apply Override'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">

                {/* Override toggle */}
                <button type="button" onClick={toggleOverride}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Pencil size={12} className="text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-bold text-primary">Override AI Result</p>
                      <p className="text-[8px] text-gray-400 mt-0.5">Adjust grade and morphology fields</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-primary/40 group-hover:text-primary transition-colors" />
                </button>

                {/* Transfer Recommendation */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e8d5f0', background: 'linear-gradient(150deg, #faf4ff 0%, #f3e8ff 100%)' }}>
                  {/* Rank row */}
                  <div className="px-3.5 py-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--gradient-primary)' }}>
                      <span className="text-xs font-black text-white leading-none">#{TRANSFER_RANK}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-[10px] font-black text-[#3b0764] leading-none">
                          Oocyte #{selectedOocyteNo ?? '—'} · Rank #{TRANSFER_RANK}
                        </p>
                        <Trophy size={8} className="text-amber-400 shrink-0" />
                      </div>
                      <p className="text-[8px] text-[#6b1176]/55 mt-0.5">Recommended for transfer</p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[8px] font-bold">
                      <Check size={7} strokeWidth={3} /> Priority
                    </span>
                  </div>

                  {/* Confidence bar */}
                  <div className="px-3.5 pb-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-semibold text-[#6b1176]/50 uppercase tracking-widest">AI Confidence</span>
                      <span className="text-[9px] font-black text-primary">86%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e8d5f0' }}>
                      <div className="h-full rounded-full" style={{ width: '86%', background: 'var(--gradient-primary)' }} />
                    </div>
                  </div>

                  <div className="mx-3.5 border-t" style={{ borderColor: '#e8d5f0' }} />

                  {/* Why */}
                  <div className="px-3.5 py-2.5">
                    <p className="text-[8px] font-bold text-[#3b0764] uppercase tracking-widest mb-1">Why Transfer?</p>
                    <p className="text-[9px] leading-relaxed" style={{ color: '#6b1176' }}>
                      5AA grade — strong ICM and cohesive TE, both primary implantation predictors. No vacuolization or multinucleation. Highest-scoring candidate in this cycle.
                    </p>
                  </div>

                  <div className="mx-3.5 border-t" style={{ borderColor: '#e8d5f0' }} />

                  {/* Strengths */}
                  <div className="px-3.5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {KEY_STRENGTHS.map(s => (
                        <span key={s} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-semibold" style={{ borderColor: '#c084fc', background: '#f3e8ff', color: '#6b1176' }}>
                          <Check size={7} strokeWidth={3} className="shrink-0" />
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mx-3.5 border-t" style={{ borderColor: '#e8d5f0' }} />

                  {/* Compare button */}
                  <div className="px-3.5 py-2.5">
                    <button type="button" disabled={completing}
                      onClick={() => handleCompleteAndGo(
                        his ? `/embryo-console/${his}/compare` : '/embryo-console',
                        { embryo },
                      )}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-primary text-[10px] font-semibold hover:bg-primary/5 transition-colors disabled:opacity-60">
                      <Trophy size={11} />
                      Compare with other oocytes
                    </button>
                  </div>
                </div>

                {/* Clinical note */}
                <div className="rounded-xl border border-primary/20 overflow-hidden" style={{ background: 'linear-gradient(135deg, #f5f0ff 0%, #ede9fe 100%)' }}>
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Lightbulb size={11} className="text-primary" />
                      </div>
                      <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Clinical Note</p>
                    </div>
                    {noteDraft.trim() && (
                      <span className="text-[8px] font-semibold text-emerald-600 flex items-center gap-1">
                        <Check size={9} strokeWidth={3} /> Saved
                      </span>
                    )}
                  </div>
                  <div className="px-4 pb-4 flex flex-col gap-2">
                    <textarea
                      value={noteDraft}
                      onChange={e => setNoteDraft(e.target.value)}
                      placeholder="Add a clinical observation for this grade..."
                      rows={3}
                      className="w-full text-[10px] text-gray-700 bg-white/80 border border-primary/20 rounded-xl px-3 py-2 outline-none resize-none placeholder:text-gray-400 focus:border-primary/50 leading-relaxed"
                    />
                    <button
                      type="button"
                      disabled={!noteDraft.trim()}
                      className="w-full py-2 rounded-xl text-[10px] font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
                      style={{ background: 'var(--gradient-primary)' }}>
                      Update Note
                    </button>
                  </div>
                </div>

              </div>
            )
          )}
        </aside>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-line bg-white mt-4 shrink-0 -mx-6 -mb-6">
        {step === 'upload' && (
          <>
            <div className="flex items-center gap-4">
              <p className={`text-xs font-semibold flex items-center gap-1.5 ${imageSlots.length === 4 ? 'text-emerald-600' : 'text-gray-400'}`}>
                {imageSlots.length === 4 && <Check size={13} className="text-emerald-500" />}
                {imageSlots.length} / 4 image{imageSlots.length !== 1 ? 's' : ''} uploaded
              </p>
              {imageSlots.length > 0 && (
                <button type="button" onClick={clearAll} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={12} /> Clear all
                </button>
              )}
              {uploadError && <p className="text-[10px] text-red-500 font-medium">{uploadError}</p>}
            </div>
            <button type="button" disabled={imageSlots.length === 0 || uploading} onClick={handleStartAnalysis}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#3b0764] text-white text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {uploading ? 'Uploading...' : 'Start AI Analysis'}
              {!uploading && <ChevronRight size={15} />}
            </button>
          </>
        )}
        {step === 'processing' && (
          <p className="text-xs text-gray-400 mx-auto">Analyzing — please wait...</p>
        )}
        {step === 'select-best' && (
          <>
            <button type="button" onClick={() => setStep('upload')} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors">
              <ArrowLeft size={14} /> Back to Upload
            </button>
            <button type="button" disabled={selectedImageIdx === null} onClick={handleConfirmSelection}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#3b0764] text-white text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Confirm selection <ChevronRight size={15} />
            </button>
          </>
        )}
        {step === 'result' && (
          <>
            <button type="button" onClick={() => setStep('select-best')}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors shrink-0">
              <ArrowLeft size={14} /> Back to Best Grade
            </button>
            {!overrideMode && (
              <button type="button" disabled={completing}
                onClick={() => handleCompleteAndGo(
                  his ? `/embryo-console/${his}` : '/embryo-console',
                )}
                className="inline-flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ background: 'var(--gradient-primary)' }}>
                <div className="flex flex-col items-start">
                  <span className="text-[8px] font-semibold text-white/60 leading-none mb-0.5 uppercase tracking-widest">
                    {completing ? 'Saving…' : 'Grading complete'}
                  </span>
                  <span className="text-xs font-bold leading-none">Development Tracker</span>
                </div>
                <ArrowRight size={15} className="shrink-0 opacity-80" />
              </button>
            )}
          </>
        )}
      </div>

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

      {deactivateConfirmIdx !== null && (
        <ConfirmDialog
          title="Remove this grade?"
          message={`Image #${deactivateConfirmIdx + 1} will be excluded from grading.`}
          confirmLabel="Remove"
          confirmClassName="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
          onCancel={() => setDeactivateConfirmIdx(null)}
          onConfirm={() => {
            removeImageSlot(deactivateConfirmIdx);
            if (selectedImageIdx === deactivateConfirmIdx) setSelectedImageIdx(null);
            setDeactivateConfirmIdx(null);
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

// ── Image slot card (upload grid) ─────────────────────────────────────────────

function ImageSlotCard({ slotIndex, url, log, onReplace, onRemove }: {
  slotIndex: number;
  url: string;
  log: IvfCycleLog | null;
  onReplace: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative rounded-xl border border-line overflow-hidden aspect-square bg-black">
      <img src={url} alt={`Image ${slotIndex + 1}`} className="w-full h-full object-contain" />
      <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/60 text-white text-[9px] font-bold flex items-center justify-center z-10">{slotIndex + 1}</span>
      <button type="button" onClick={onRemove}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors z-10">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/75 to-transparent z-10">
        <div className="flex items-end justify-between">
          <p className="text-[9px] font-bold text-white leading-tight">Image #{slotIndex + 1}</p>
          {log?.d0_maturity && (
            <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[8px] font-semibold">{log.d0_maturity}</span>
          )}
        </div>
      </div>
      <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 transition-opacity z-[5] flex items-center justify-center bg-black/30">
        <span className="px-3 py-1.5 rounded-lg bg-white/90 text-primary text-[9px] font-semibold">Replace</span>
        <input type="file" accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.[0]) onReplace(e.target.files[0]); e.target.value = ''; }} />
      </label>
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

// ── Step progress bar ─────────────────────────────────────────────────────────

function StepBar({ currentStep }: { currentStep: Step }) {
  const steps = [
    { id: 'upload' as Step,      title: 'Select & Upload',   sub: 'Choose oocyte and upload images'        },
    { id: 'select-best' as Step, title: 'Select Best Grade', sub: 'Choose the image with better quality'   },
    { id: 'result' as Step,      title: 'Result & Override', sub: 'Review and adjust AI grading result'    },
  ];
  const currentOrder = stepBarOrder(currentStep);
  return (
    <div className="flex items-center mb-5 px-1">
      {steps.map((s, i) => {
        const order  = stepBarOrder(s.id);
        const done   = order < currentOrder;
        const active = order === currentOrder;
        return (
          <React.Fragment key={s.id}>
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Number badge */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black transition-all shrink-0
                ${done   ? 'bg-primary text-white'
                : active ? 'bg-primary text-white ring-4 ring-primary/20'
                :          'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                {done ? <Check size={13} /> : `0${i + 1}`}
              </div>
              {/* Label + description */}
              <div className="flex flex-col">
                <span className={`text-[11px] font-bold leading-tight whitespace-nowrap
                  ${active || done ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s.title}
                </span>
                <span className={`text-[9px] leading-tight whitespace-nowrap mt-0.5
                  ${active ? 'text-gray-400' : 'text-gray-300'}`}>
                  {s.sub}
                </span>
              </div>
            </div>
            {/* Arrow connector */}
            {i < steps.length - 1 && (
              <div className="flex items-center flex-1 mx-3 gap-0">
                <div className={`flex-1 h-px ${order < currentOrder ? 'bg-primary/40' : 'bg-gray-200'}`} />
                <ChevronRight size={12} className={`shrink-0 -ml-0.5 ${order < currentOrder ? 'text-primary/50' : 'text-gray-300'}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
