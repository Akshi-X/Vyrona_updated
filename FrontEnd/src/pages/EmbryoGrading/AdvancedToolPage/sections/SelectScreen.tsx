import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Brain, Check, CheckCircle2, ChevronDown,
  FileText, ImageIcon, Sparkle, Sparkles, User,
} from 'lucide-react';
import { ivfService, type IvfCycle, type IvfCycleLog } from '../../../../services/ivfService';
import { fmtTime, gradeTextCls, ooState } from '../helpers';

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
        <img src="/emb_embryo_grading.png" alt="" className="w-full h-auto block" />
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

function OocyteCard({ log, bestImageUrl, selected, onSelect }: {
  log: IvfCycleLog; bestImageUrl: string | null; selected: boolean; onSelect: () => void;
}) {
  const state = ooState(log);
  const dropNo = log.d3_drop_no || log.d0_drop_no || '—';
  const num = String(log.oocyte_no).padStart(2, '0');

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
        const hasBlast = !!log.blast_grade;
        return (
        <div className={`rounded-xl px-3 py-2.5 border ${state === 'final' ? 'bg-emerald-50/60 border-emerald-100' : 'bg-primary/[0.04] border-primary/10'}`}>
          <p className={`text-[9px] font-bold mb-1 ${state === 'final' ? 'text-emerald-600' : 'text-primary/70'}`}>
            {state === 'final' ? 'Final Blast Grade' : hasBlast ? 'Suggested Blast Grade' : 'Day 3 Grade'}
          </p>
          <div className="flex items-end justify-between">
            <span className={`text-xl font-black leading-none ${gradeTextCls(log.blast_grade || '')}`}>
              {hasBlast ? log.blast_grade : (log.d3_grade || '—')}
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

export default function SelectScreen({ his, logs, loading, bestImages, selectedOocyteNo, onSelect, onBack, onContinue }: {
  his?: string; logs: IvfCycleLog[]; loading: boolean;
  bestImages: Record<number, string>;
  selectedOocyteNo: number | null; onSelect: (no: number) => void;
  onBack: () => void; onContinue: () => void;
}) {
  const navigate = useNavigate();
  const [patientOpen, setPatientOpen] = useState(false);
  const [allCycles, setAllCycles] = useState<IvfCycle[] | null>(null);
  const patientRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientRef.current && !patientRef.current.contains(e.target as Node)) setPatientOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetched once, the first time the switcher is opened.
  useEffect(() => {
    if (!patientOpen || allCycles) return;
    ivfService.listCycles().then(setAllCycles).catch(() => setAllCycles([]));
  }, [patientOpen, allCycles]);

  const otherCycles = (allCycles ?? []).filter(c => c.his_id.toUpperCase() !== his?.toUpperCase());

  return (
    <div className="flex gap-4 flex-1 min-h-0">
      <WorkflowRail />

      <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-2xl border border-line bg-white overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 shrink-0 px-5 pt-5">
          {/* basis keeps the heading from being squeezed to one word per line —
              the chip wraps to its own row instead. */}
          <div className="flex items-start gap-3 min-w-0 flex-1 basis-[260px]">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Brain size={22} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg xl:text-xl font-black text-gray-800 leading-tight">What would you like to grade?</h1>
              <p className="text-xs text-gray-400 mt-0.5">Select an oocyte to start the AI-assisted embryo grading process.</p>
            </div>
          </div>
          <div className="relative shrink-0" ref={patientRef}>
            <button type="button" onClick={() => setPatientOpen(v => !v)}
              className="inline-flex items-center gap-2 max-w-full px-4 py-2 rounded-xl border border-line bg-surface text-xs font-semibold text-gray-700 hover:bg-surface/70 transition-colors">
              <User size={13} className="text-primary shrink-0" />
              <span className="truncate">
                Patient ID : {his ? his.toUpperCase() : '—'}
              </span>
              <ChevronDown size={13} className={`text-gray-400 ml-1 shrink-0 transition-transform ${patientOpen ? 'rotate-180' : ''}`} />
            </button>
            {patientOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-xl border border-line bg-white shadow-lg overflow-hidden flex flex-col">
                <div className="max-h-64 overflow-y-auto">
                  {allCycles === null ? (
                    <p className="px-3.5 py-4 text-[11px] text-gray-400 text-center">Loading cycles…</p>
                  ) : otherCycles.length === 0 ? (
                    <p className="px-3.5 py-4 text-[11px] text-gray-400 text-center">No other HIS found.</p>
                  ) : otherCycles.map(c => (
                    <button key={c.cycle_id} type="button"
                      onClick={() => { setPatientOpen(false); navigate(`/embryo-console/${c.his_id}/ai-grading`); }}
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-primary/10 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{c.his_id.toUpperCase()}</p>
                      </div>
                      <ChevronDown size={12} className="text-gray-300 -rotate-90 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              {logs.map((log) => (
                <OocyteCard key={log.log_id} log={log} bestImageUrl={bestImages[log.log_id] ?? null}
                  selected={selectedOocyteNo === log.oocyte_no} onSelect={() => onSelect(log.oocyte_no)} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 px-3 py-2 xl:mt-0 xl:px-4 xl:py-3 border-t border-line flex items-center justify-between shrink-0 bg-surface/40">
          <button type="button" onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 xl:gap-2 xl:px-4 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
            <ArrowLeft size={14} /> Go back
          </button>
          <button type="button" onClick={onContinue} disabled={selectedOocyteNo == null}
            className="inline-flex items-center gap-2 px-4 py-1.5 xl:px-5 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--gradient-primary)' }}>
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
