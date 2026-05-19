import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Upload, Info, Check } from 'lucide-react';
import type { IVFTreatment } from '../../types/ivf';
import { ivfService, type IvfCycleLog } from '../../services/ivfService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdvancedEmbryoRouteState { embryo?: IVFTreatment; savedLogForm?: unknown; savedEditingLogId?: number | null; }

// ── Mock static data ──────────────────────────────────────────────────────────

const MOCK_AI_DEFAULT = {
  grade: '5AA', expansion: '5', expansionLabel: 'Expanded Blastocyst', expansionConf: 88,
  icm: 'A', icmLabel: 'Many Cells', icmConf: 87,
  te: 'A', teLabel: 'Many Cells', teConf: 85,
  confidence: 86.1, quality: 'High Quality',
  justification: 'The embryo is a fully expanded blastocyst with a well-defined inner cell mass containing many tightly packed cells and a trophectoderm with many cells forming a cohesive epithelium. Overall characteristics indicate high implantation potential.',
  observations: ['Blastocoel fully fills the embryo', 'ICM is dense with many cells', 'TE is cohesive with many cells', 'Zona pellucida is intact', 'No major fragmentation observed'],
};


const DEV_TIMELINE = [
  { day: 'Day 1', time: '16.1 h',  event: '2 PN',               active: false },
  { day: 'Day 2', time: '40.3 h',  event: '4 Cell',             active: false },
  { day: 'Day 3', time: '65.2 h',  event: '8 Cell',             active: false },
  { day: 'Day 4', time: '89.5 h',  event: 'Morula',             active: false },
  { day: 'Day 4', time: '113.7 h', event: 'Early Blastocyst',   active: false },
  { day: 'Day 5', time: '17.57 h', event: 'Expanded Blastocyst', active: true },
];


const ANNOTATION_IMG = '/embryo/annotation.png';


// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedEmbryoGradingPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const routeState = (location.state as AdvancedEmbryoRouteState) || {};
  const embryo = routeState.embryo;

  // Step wizard: 1=upload, 2=processing, 3=result, 4=override
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Override form state (step 4)
  const [overrideExpansion, setOverrideExpansion] = useState('');
  const [overrideIcm, setOverrideIcm] = useState('');
  const [overrideTe, setOverrideTe] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Image state
  const [oocyteImages, setOocyteImages] = useState<Record<number, string>>({});
  const [isDragging, setIsDragging] = useState(false);

  // Oocyte list from log sheet
  const [logs, setLogs] = useState<IvfCycleLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedOocyteNo, setSelectedOocyteNo] = useState<number | null>(null);

  // UI state
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');
  const [notes, setNotes] = useState<string[]>([]);

  // ── Image handlers ────────────────────────────────────────────────────────

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || selectedOocyteNo == null) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    setOocyteImages(prev => {
      if (prev[selectedOocyteNo]) URL.revokeObjectURL(prev[selectedOocyteNo]);
      return { ...prev, [selectedOocyteNo]: url };
    });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeOocyteImage = (oocyteNo: number) => {
    setOocyteImages(prev => {
      if (prev[oocyteNo]) URL.revokeObjectURL(prev[oocyteNo]);
      const next = { ...prev };
      delete next[oocyteNo];
      return next;
    });
  };

  // Auto-advance from step 2 (processing) to step 3 (result)
  useEffect(() => {
    if (step !== 2) return;
    const timer = setTimeout(() => setStep(3), 2800);
    return () => clearTimeout(timer);
  }, [step]);

  // Fetch oocyte logs for this HIS
  useEffect(() => {
    if (!his) return;
    const detailHis = his.trim().toUpperCase();
    let cancelled = false;
    setLogsLoading(true);
    ivfService.listCycles({ his_id: detailHis }).then(async cycles => {
      const matched = cycles.find(c => c.his_id.toUpperCase() === detailHis);
      if (!matched || cancelled) { setLogsLoading(false); return; }
      const full = await ivfService.getCycleWithLogs(matched.cycle_id);
      if (!cancelled) {
        setLogs(full.logs);
        setLogsLoading(false);
      }
    }).catch(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [his]);

  const handleComplete = () => {
    navigate(his ? `/embryo-console/${his}` : '/embryo-console', {
      state: {
        gradeResult: { expansion: mockAI.expansion, icm: mockAI.icm, te: mockAI.te },
        savedLogForm: routeState.savedLogForm,
        savedEditingLogId: routeState.savedEditingLogId,
      },
    });
  };

  const mockAI = MOCK_AI_DEFAULT;
  const currentSrc = selectedOocyteNo != null ? oocyteImages[selectedOocyteNo] : undefined;

  const handleOocyteSelect = (no: number) => {
    if (step === 3 || step === 4) return;
    setSelectedOocyteNo(no);
  };

  const enterOverride = () => {
    setOverrideExpansion(mockAI.expansion);
    setOverrideIcm(mockAI.icm);
    setOverrideTe(mockAI.te);
    setOverrideReason('');
    setStep(4);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedLog = logs.find(l => l.oocyte_no === selectedOocyteNo);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Step progress bar */}
      <StepBar step={step} />

      {/* 3-column grid — left always visible, center/right swap per step */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(320px,1fr)_380px] xl:grid-rows-1 gap-4 min-h-0 flex-1">

          {/* ── LEFT PANEL — hidden on step 2 ── */}
          <aside className={`flex flex-col gap-3 overflow-y-auto pr-0.5 ${step === 2 ? 'hidden' : ''}`} style={{ maxHeight: 'calc(100vh - 14rem)' }}>
            <OocyteList logs={logs} loading={logsLoading} selectedOocyteNo={selectedOocyteNo} oocyteImages={oocyteImages} locked={step === 3 || step === 4} onSelect={handleOocyteSelect} />

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

            {/* Horizontal Development Timeline */}
            <div className="rounded-lg border border-line bg-white p-4">
              <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase mb-4">Development Timeline</p>
              <div className="relative flex items-start justify-between">
                {/* connecting line */}
                <div className="absolute top-[7px] left-0 right-0 h-px bg-[#E8D5F5]" />
                {DEV_TIMELINE.map((item, i) => (
                  <div key={i} className="relative flex flex-col items-center gap-1.5 flex-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center z-10 shrink-0 transition-colors ${item.active ? 'bg-primary border-primary' : 'bg-white border-[#c084fc]'}`}>
                      {item.active && <span className="w-1 h-1 rounded-full bg-white" />}
                    </div>
                    <p className={`text-[9px] font-bold text-center leading-tight ${item.active ? 'text-primary' : 'text-gray-600'}`}>{item.day}</p>
                    <p className={`text-[9px] text-center leading-tight ${item.active ? 'text-primary font-semibold' : 'text-gray-600'}`}>{item.event}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* ── CENTER PANEL ── */}

          {/* Step 1 — Upload */}
          {step === 1 && (
            <section className="rounded-lg border border-line bg-white overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0">
                <p className="text-xs font-bold text-gray-800">Upload Embryo Image</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Select an oocyte from the list, then upload its microscopy image</p>
              </div>
              <div className="flex-1 p-5 flex flex-col gap-4 min-h-0">
                {currentSrc ? (
                  <div className="relative flex-1 rounded-xl overflow-hidden border border-line bg-black">
                    <img src={currentSrc} alt="Oocyte image" className="absolute inset-0 h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => selectedOocyteNo != null && removeOocyteImage(selectedOocyteNo)}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <label className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-white/90 border border-line text-primary text-[10px] font-semibold cursor-pointer hover:bg-white transition-colors">
                      Replace
                      <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                    </label>
                  </div>
                ) : (
                  <label
                    className={`flex-1 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-all cursor-pointer ${isDragging ? 'border-primary bg-primary-bg' : 'border-line hover:border-[#c8b2d1] hover:bg-surface'} ${selectedOocyteNo == null ? 'opacity-50 pointer-events-none' : ''}`}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-primary text-white' : 'bg-primary-bg text-primary'}`}>
                      <Upload size={28} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold text-gray-700">
                        {isDragging ? 'Drop to upload' : selectedOocyteNo == null ? 'Select an oocyte first' : 'Drag & drop image here'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">or click to browse files</p>
                      <p className="text-[10px] text-gray-300 mt-1.5">PNG, JPG, TIFF</p>
                    </div>
                    {selectedOocyteNo != null && (
                      <span className="px-5 py-2 rounded-lg border border-[#D8C7E3] text-primary text-xs font-medium bg-white hover:bg-primary-bg transition-colors">
                        Browse Files
                      </span>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                  </label>
                )}
              </div>
            </section>
          )}

          {/* Step 2 — AI processing (center + right span) */}
          {step === 2 && (
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
                  Analyzing Oocyte #{selectedOocyteNo ?? '—'}
                  {selectedLog?.d0_maturity ? ` · ${selectedLog.d0_maturity}` : ''}
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

          {/* Step 3 — Image viewer (result) */}
          {step === 3 && (
            <section className="rounded-lg border border-line bg-white overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-line flex items-center justify-between bg-white shrink-0">
                <span className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Image Viewer</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setShowAnnotations(true)} className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${showAnnotations ? 'bg-primary text-white' : 'border border-line text-gray-500 hover:bg-gray-50'}`}>Annotations</button>
                  <button type="button" onClick={() => setShowAnnotations(false)} className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${!showAnnotations ? 'bg-primary text-white' : 'border border-line text-gray-500 hover:bg-gray-50'}`}>Original</button>
                </div>
              </div>
              <div className="relative flex-1 bg-black min-h-0">
                <img
                  src={showAnnotations ? ANNOTATION_IMG : currentSrc}
                  alt="Oocyte"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
            </section>
          )}

          {/* Step 4 — Image viewer (center) */}
          {step === 4 && (
            <section className="rounded-lg border border-line bg-white overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-line flex items-center justify-between bg-white shrink-0">
                <span className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">Image Viewer</span>
              </div>
              <div className="relative flex-1 bg-black min-h-0">
                <img src={currentSrc} alt="Oocyte" className="absolute inset-0 h-full w-full object-contain" />
              </div>
            </section>
          )}

          {/* ── RIGHT PANEL — steps 1 & 3 (AI results, placeholder on step 1) ── */}
          <aside className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 14rem)' }}>

            {/* Step 1 — placeholder (same layout as step 3, values dimmed) */}
            {step === 1 && (
              <div className="flex flex-col gap-3">
                {/* AI Grade card — placeholder */}
                <div className="rounded-xl overflow-hidden shrink-0" style={{ height: '205.45px', background: 'var(--gradient-primary)' }}>
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] font-semibold tracking-widest text-white/50 uppercase">AI Grade</p>
                      <button type="button" className="text-white/30"><Info size={13} /></button>
                    </div>
                    <p className="text-5xl font-extrabold text-white/20 leading-none tracking-tight">—</p>
                  </div>
                  <div className="px-4 pb-4" style={{ background: 'rgba(0,0,0,0.15)' }}>
                    <div className="pt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-white/70">Confidence Score</span>
                        <span className="text-xs font-bold text-white/30">—</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }} />
                      <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        <span className="text-[10px] font-semibold text-white/30">—</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Component Grades — placeholder */}
                <div className="rounded-lg border border-line bg-white p-4">
                  <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase mb-3">Component Grades</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Expansion', sub: '—', conf: '—' },
                      { label: 'ICM',       sub: '—', conf: '—' },
                      { label: 'TE',        sub: '—', conf: '—' },
                    ].map(c => (
                      <div key={c.label} className="rounded-lg border border-line bg-[#FCF9FF] p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-semibold text-primary">{c.label}</span>
                          <Info size={11} className="text-gray-300" />
                        </div>
                        <p className="text-xl font-extrabold text-primary opacity-20">—</p>
                        <p className="text-[9px] text-gray-300 mt-0.5 leading-tight">{c.sub}</p>
                        <p className="text-[9px] text-gray-300 mt-1">Confidence: {c.conf}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hint */}
                <div className="rounded-lg border border-dashed border-[#D8C7E3] bg-primary-bg p-6 flex flex-col items-center justify-center gap-2 text-center">
                  <Info size={18} className="text-primary" />
                  <p className="text-[10px] font-semibold text-gray-800">Results will appear here after AI analysis.</p>
                  <p className="text-[10px] text-primary font-medium">Select an oocyte, upload its image, then click Start AI Analysis.</p>
                </div>
              </div>
            )}

            {/* Step 3 — AI results */}
            {step === 3 && (<>
              {/* AI Grade card */}
              <div className="rounded-xl overflow-hidden shrink-0" style={{ height: '205.45px', background: 'var(--gradient-primary)' }}>
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[9px] font-semibold tracking-widest text-white/50 uppercase">AI Grade</p>
                    <button type="button" className="text-white/30 hover:text-white/60"><Info size={13} /></button>
                  </div>
                  <p className="text-5xl font-extrabold text-white leading-none tracking-tight">{mockAI.grade}</p>
                </div>
                <div className="px-4 pb-4" style={{ background: 'rgba(0,0,0,0.15)' }}>
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-white/70">Confidence Score</span>
                      <span className="text-xs font-bold text-white">{mockAI.confidence}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                      <div className="h-full rounded-full bg-white/90" style={{ width: `${mockAI.confidence}%` }} />
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                      <span className="text-[10px] font-semibold text-white/90">{mockAI.quality}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Component Grades */}
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="text-[9px] font-semibold tracking-widest text-gray-500 uppercase mb-3">Component Grades</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Expansion', value: mockAI.expansion, sub: mockAI.expansionLabel, conf: `${mockAI.expansionConf}%` },
                    { label: 'ICM',       value: mockAI.icm,       sub: mockAI.icmLabel,       conf: `${mockAI.icmConf}%` },
                    { label: 'TE',        value: mockAI.te,        sub: mockAI.teLabel,        conf: `${mockAI.teConf}%` },
                  ].map(c => (
                    <div key={c.label} className="rounded-lg border border-line bg-[#FCF9FF] p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-semibold text-primary">{c.label}</span>
                        <Info size={11} className="text-gray-300" />
                      </div>
                      <p className="text-xl font-extrabold text-primary">{c.value}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{c.sub}</p>
                      <p className="text-[9px] text-gray-400 mt-1">Confidence: {c.conf}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Justification */}
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-2">AI Justification</p>
                <p className="text-[10px] leading-relaxed text-gray-700">{mockAI.justification}</p>
              </div>

              {/* Key Observations */}
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Key Observations</p>
                <ul className="space-y-2">
                  {mockAI.observations.map(obs => (
                    <li key={obs} className="flex items-start gap-2 text-[10px] text-gray-600">
                      <Check size={12} className="text-primary mt-0.5 shrink-0" />{obs}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Clinician Notes */}
              <div className="rounded-lg border border-line bg-white p-4 flex flex-col">
                <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Clinician Notes</p>
                {notes.length > 0 && (
                  <ul className="space-y-1.5 mb-3">
                    {notes.map((n, i) => <li key={i} className="text-[10px] text-gray-600 bg-surface rounded px-2.5 py-1.5 border border-[#F0EAF4]">{n}</li>)}
                  </ul>
                )}
                <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add note..." rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[10px] text-gray-700 placeholder:text-gray-300 outline-none resize-none focus:border-primary transition-colors" />
                <div className="flex justify-end mt-2">
                  <button type="button" onClick={() => { if (noteDraft.trim()) { setNotes(n => [...n, noteDraft.trim()]); setNoteDraft(''); } }} className="px-4 py-2 rounded-lg bg-[#3b0764] text-white text-[10px] font-semibold hover:bg-primary transition-colors">Add Note</button>
                </div>
              </div>
            </>)}

            {/* Step 4 — Override panel */}
            {step === 4 && (<>
              {/* AI Suggestion card */}
              <div className="rounded-xl overflow-hidden shrink-0" style={{ background: 'var(--gradient-primary)' }}>
                <div className="px-4 pt-4 pb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  {/* Left — AI Suggestion */}
                  <div>
                    <p className="text-[9px] font-semibold tracking-widest text-white/50 uppercase mb-1">AI Suggestion</p>
                    <p className="text-4xl font-extrabold text-white leading-none tracking-tight">{mockAI.grade}</p>
                  </div>
                  {/* Middle — arrow */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                  {/* Right — Override */}
                  <div className="text-right">
                    <p className="text-[9px] font-semibold tracking-widest text-white/50 uppercase mb-1">Override</p>
                    <p className="text-4xl font-extrabold text-white leading-none tracking-tight">
                      {overrideExpansion || '—'}{overrideIcm}{overrideTe}
                    </p>
                  </div>
                </div>
              </div>

              {/* Override form */}
              <div className="rounded-lg border border-line bg-white p-4 flex flex-col gap-4">
                {(['Expansion', 'ICM', 'TE'] as const).map((field) => {
                  const key = field.toLowerCase() as 'expansion' | 'icm' | 'te';
                  const setter = key === 'expansion' ? setOverrideExpansion : key === 'icm' ? setOverrideIcm : setOverrideTe;
                  const value = key === 'expansion' ? overrideExpansion : key === 'icm' ? overrideIcm : overrideTe;
                  const opts = key === 'expansion' ? ['1','2','3','4','5','6'] : ['A','B','C'];
                  const aiVal = key === 'expansion' ? mockAI.expansion : key === 'icm' ? mockAI.icm : mockAI.te;
                  return (
                    <div key={field}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-gray-700">{field}</p>
                        <span className="text-[9px] text-gray-400">AI: <span className="font-bold text-primary">{aiVal}</span></span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {opts.map(o => (
                          <button key={o} type="button" onClick={() => setter(o)}
                            className={`w-10 h-10 rounded-lg border-2 text-xs font-bold transition-all ${value === o ? 'border-primary bg-primary text-white scale-105' : 'border-line text-gray-500 hover:border-[#c084fc] hover:text-primary'}`}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div>
                  <p className="text-[10px] font-semibold text-gray-700 mb-1.5">Override Reason</p>
                  <textarea
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder="Explain why you are overriding the AI grade..."
                    rows={3}
                    className="w-full rounded-lg border border-line px-3 py-2 text-[10px] text-gray-700 placeholder:text-gray-300 outline-none resize-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="rounded-lg bg-surface border border-line-light px-4 py-3 text-center">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Override Grade</p>
                  <p className="text-3xl font-extrabold text-primary">{overrideExpansion || '—'}{overrideIcm}{overrideTe}</p>
                </div>
              </div>
            </>)}
          </aside>
        </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-line bg-white mt-4 shrink-0 -mx-6 -mb-6">
        {step === 1 && (
          <>
            <p className="text-xs text-gray-400">
              {Object.keys(oocyteImages).length} image{Object.keys(oocyteImages).length !== 1 ? 's' : ''} uploaded
            </p>
            <button
              type="button"
              disabled={selectedOocyteNo == null || !currentSrc}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#3b0764] text-white text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start AI Analysis
              <ChevronRight size={15} />
            </button>
          </>
        )}
        {step === 2 && (
          <p className="text-xs text-gray-400 mx-auto">Analyzing — please wait...</p>
        )}
        {step === 3 && (
          <>
            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors">
              <ArrowLeft size={14} /> Back to Upload
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={enterOverride} className="px-4 py-2 rounded-lg border border-primary text-primary text-xs font-semibold hover:bg-primary-bg transition-colors">
                Override Grade
              </button>
              <button type="button" onClick={handleComplete} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#3b0764] text-white text-xs font-semibold hover:bg-primary transition-colors">
                <Check size={14} />
                Accept &amp; Complete
              </button>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <button type="button" onClick={() => setStep(3)} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors">
              <ArrowLeft size={14} /> Cancel Override
            </button>
            <button
              type="button"
              disabled={!overrideExpansion || !overrideIcm || !overrideTe}
              onClick={handleComplete}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#3b0764] text-white text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={14} />
              Apply Override &amp; Complete
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes ai-progress { from { width: 0% } to { width: 100% } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}

// ── Shared oocyte list panel ──────────────────────────────────────────────────

function OocyteList({ logs, loading, selectedOocyteNo, oocyteImages, locked, onSelect }: {
  logs: IvfCycleLog[];
  loading: boolean;
  selectedOocyteNo: number | null;
  oocyteImages: Record<number, string>;
  locked: boolean;
  onSelect: (no: number) => void;
}) {
  const gradeOf = (log: IvfCycleLog) => log.d5_grade || log.d6_grade || log.d3_grade || null;

  const chipCls = (grade: string | null) => {
    if (!grade) return '';
    const icmTe = grade.slice(1);
    return icmTe === 'AA'
      ? 'bg-green-50 border-green-200 text-green-700'
      : icmTe === 'BB'
      ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
      : grade.includes('C')
      ? 'bg-primary-bg border-[#c084fc]/40 text-primary'
      : 'bg-amber-50 border-amber-200 text-amber-700';
  };

  return (
    <div className={`rounded-xl border bg-white overflow-hidden flex flex-col min-h-[220px] ${locked ? 'border-line opacity-60 pointer-events-none' : 'border-line'}`}>
      <div className="px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-800">Select an oocyte to be graded</p>
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
        <div className="overflow-y-auto">
          {logs.map((log, idx) => {
            const active = log.oocyte_no === selectedOocyteNo;
            const grade = gradeOf(log);
            const hasImage = !!oocyteImages[log.oocyte_no];
            return (
              <button
                key={log.log_id}
                type="button"
                onClick={() => onSelect(log.oocyte_no)}
                className={`w-full flex items-center gap-3 py-2.5 transition-all text-left border-b border-[#F5F0F8] relative ${
                  active
                    ? 'bg-primary-bg pl-3 pr-4'
                    : 'hover:bg-surface pl-4 pr-4'
                }`}
              >
                {/* Active indicator bar */}
                {active && (
                  <span className="absolute left-0 top-0 bottom-0 w-1 rounded-r bg-primary" />
                )}

                <span className={`text-[9px] font-bold w-5 shrink-0 ${active ? 'text-primary' : 'text-gray-300'}`}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-[10px] font-semibold ${active ? 'text-primary' : 'text-gray-700'}`}>
                      Oocyte #{log.oocyte_no}
                    </p>
                    {hasImage && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Image uploaded" />
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">
                    {log.d0_maturity || 'D0 maturity not set'}
                  </p>
                </div>
                {grade ? (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${chipCls(grade)}`}>
                    {grade}
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
                    Ungraded
                  </span>
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

function StepBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1 as const, title: 'Select & Upload', sub: 'Choose oocyte and upload image' },
    { n: 2 as const, title: 'AI Processing',   sub: 'Analysis in progress' },
    { n: 3 as const, title: 'Result',           sub: 'View AI grading result' },
    { n: 4 as const, title: 'Override',         sub: 'Adjust grade manually' },
  ];
  return (
    <div className="flex items-start mb-5 px-1">
      {steps.map((s, i) => {
        const done   = s.n < step;
        const active = s.n === step;
        return (
          <React.Fragment key={s.n}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${done || active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}
                ${active ? 'ring-4 ring-[#E8D5F5]' : ''}`}>
                {done ? <Check size={16} /> : s.n}
              </div>
              <p className={`text-[9px] font-semibold text-center whitespace-nowrap ${active || done ? 'text-primary' : 'text-gray-400'}`}>
                {s.title}
              </p>
              <p className={`text-[9px] text-center whitespace-nowrap ${active || done ? 'text-gray-400' : 'text-gray-300'}`}>
                {s.sub}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-3 mt-4 ${s.n < step ? 'bg-primary' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
