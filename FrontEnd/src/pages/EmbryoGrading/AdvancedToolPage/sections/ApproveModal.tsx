import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Award, Check, CheckCircle2, CircleAlert, CircleDashed, CircleDot, ImageIcon, Info, Link2, Rocket, Shield, Sparkles, X } from 'lucide-react';
import type { IvfGrade } from '../../../../services/ivfService';
import { flagBadgeCls, gradeTextCls } from '../helpers';

interface ApproveModalProps {
  open: boolean;
  onClose: () => void;
  approveStep: 0 | 1;
  setApproveStep: (step: 0 | 1) => void;
  grades: IvfGrade[];
  selectedIdx: number;
  grade: IvfGrade | null;
  score: number | null;
  confidence: number;
  qualityFlags: Record<string, string | null>;
  num: string;
  blastDay: 'Day 5' | 'Day 6';
  setBlastDay: (day: 'Day 5' | 'Day 6') => void;
  defaultBlastDay: 'Day 5' | 'Day 6';
  dayInCycle: number;
  fateValue: string;
  setFateValue: (v: string) => void;
  freezeId: string;
  setFreezeId: (v: string) => void;
  fateNotes: string;
  setFateNotes: (v: string) => void;
  saving: boolean;
  onApprove: (opts: { day: 'Day 5' | 'Day 6'; fate?: string; freezeId?: string; notes?: string }) => void;
}

export default function ApproveModal({
  open, onClose, approveStep, setApproveStep, grades, selectedIdx, grade, score, confidence,
  qualityFlags, num, blastDay, setBlastDay, defaultBlastDay, dayInCycle,
  fateValue, setFateValue, freezeId, setFreezeId, fateNotes, setFateNotes, saving, onApprove,
}: ApproveModalProps) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* header */}
        <div className="px-6 py-4 border-b border-line flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Award size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-black text-gray-800 leading-tight">
              {approveStep === 0 ? 'Approve Grading' : 'Embryo Fate'}
            </p>
            <p className="text-xs text-gray-400">
              {approveStep === 0 ? 'Confirm the best grade for this oocyte' : 'Optional — record what happens to this embryo next'}
            </p>
          </div>
          <span className="text-[10px] font-bold text-gray-400 shrink-0">Step {approveStep + 1} of 2</span>
          <button type="button" onClick={() => { if (!saving) onClose(); }}
            className="w-9 h-9 rounded-xl border border-line flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {approveStep === 0 ? (
        <div className="p-6 flex flex-col gap-5 overflow-y-auto min-h-0 [&>*]:shrink-0">
          {/* graded images + summary */}
          <div>
            <p className="text-[11px] font-black text-primary uppercase tracking-widest mb-2">Graded Images ({grades.length})</p>
            <div className="flex gap-4 items-start flex-col lg:flex-row">
              <div className="flex-1 rounded-xl border border-line p-3 max-h-[280px] overflow-y-auto">
                {grades.length === 0 ? (
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={`grade-skeleton-${i}`} className="rounded-xl border-2 border-line p-1.5 flex flex-col gap-1.5" style={{ maxWidth: 150 }}>
                        <div className="rounded-lg aspect-[4/3] ivf-shimmer" />
                        <div className="h-4 w-10 mx-auto rounded-full ivf-shimmer" />
                      </div>
                    ))}
                  </div>
                ) : (
                <div className="grid gap-2.5 content-start pr-1"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${grades.length <= 2 ? 150 : grades.length <= 6 ? 116 : 92}px, 1fr))` }}>
                  {grades.map((g, i) => {
                    const sel = i === selectedIdx;
                    const compact = grades.length > 6;
                    return (
                      <div key={g.grade_id} style={{ maxWidth: grades.length <= 2 ? 150 : grades.length <= 6 ? 116 : 92 }}
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
                )}
                <style>{`
                  .ivf-shimmer {
                    background: linear-gradient(90deg, #f3f4f6 25%, #e9ebee 37%, #f3f4f6 63%);
                    background-size: 400% 100%;
                    animation: ivf-shimmer-sweep 1.4s ease-in-out infinite;
                  }
                  @keyframes ivf-shimmer-sweep { 0% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
                `}</style>
              </div>

              <div className="w-full lg:w-[280px] shrink-0 rounded-xl overflow-hidden border border-line-light flex flex-col">
                {/* grade header, merged in from the old standalone "Selected Grade" card */}
                <div className="p-4 flex flex-col gap-3" style={{ background: 'var(--gradient-primary)' }}>
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Selected Grade</span>
                  <span className="text-4xl font-black leading-none text-white">{grade?.grade || '—'}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Image', value: `#${selectedIdx + 1}` },
                      { label: 'AI Score', value: `${score != null ? score.toFixed(1) : '—'}/10` },
                      { label: 'Confidence', value: `${confidence}%` },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg bg-white/20 px-2 py-1.5 text-center">
                        <p className="text-[8px] font-bold text-white/85 uppercase tracking-widest">{s.label}</p>
                        <p className="text-xs font-black text-white leading-tight">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-surface/60 flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Info size={14} className="text-primary" /></div>
                    <p className="text-[11px] font-black text-primary uppercase tracking-widest">Summary</p>
                  </div>
                  <p className="text-[13px] text-gray-600 leading-relaxed">
                    <span className="font-bold text-gray-800">Image #{selectedIdx + 1}</span> will be saved as the <span className="font-bold text-primary">best grade</span> for <span className="font-bold text-primary">Oocyte {num}</span>
                    {grades.length > 1 && <span className="text-gray-400"> — the other {grades.length - 1} kept as alternatives</span>}.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* quality flags */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { Icon: CircleDashed, label: 'Hatching', val: qualityFlags.hatching },
                { Icon: Shield, label: 'Zona Pellucida', val: qualityFlags.zona_pellucida },
                { Icon: CircleDot, label: 'Blastocoel', val: qualityFlags.blastocoel },
                { Icon: Link2, label: 'Bridge', val: qualityFlags.bridge },
                { Icon: CircleAlert, label: 'Blackspot', val: qualityFlags.blackspot },
                { Icon: Rocket, label: 'Early Blast', val: qualityFlags.early_blast },
              ].map(({ Icon, label, val }) => (
                <div key={label} className="rounded-lg border border-line bg-surface/40 px-3 py-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={13} className="text-primary/60 shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{label}</span>
                  </div>
                  {/* AI descriptions can run long, so this wraps instead of a
                      single-line pill that would overflow the card. */}
                  {val ? <span className={`text-[10px] font-semibold px-2 py-1 rounded-md self-start break-words ${flagBadgeCls(val)}`}>{val}</span> : <span className="text-[11px] text-gray-300">—</span>}
                </div>
              ))}
            </div>
          </div>

          {/* development day */}
          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-primary/10 bg-primary/5 flex items-center justify-between">
              <p className="text-[10px] font-semibold tracking-widest text-primary/70 uppercase">Development Day</p>
            </div>
            <div className="px-4 py-3">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">This grade was assessed on</label>
              <select
                className="w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-muted/30 focus:border-primary-muted bg-white"
                value={blastDay} onChange={e => setBlastDay(e.target.value as 'Day 5' | 'Day 6')}>
                <option value="Day 5">Day 5</option>
                <option value="Day 6">Day 6</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Defaulted to {defaultBlastDay} — this cycle is on day {dayInCycle}.
              </p>
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
        ) : (
        <div className="p-6 flex flex-col gap-5 overflow-y-auto min-h-0 [&>*]:shrink-0">
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
              <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Fate</p>
              {fateValue && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fateValue === 'Discard' ? 'bg-red-50 text-red-500 border border-red-200' : fateValue === 'Freeze' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                  {fateValue}
                </span>
              )}
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div className={fateValue === 'Freeze' ? '' : 'col-span-2'}>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Embryo Fate</label>
                <select
                  className="w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-muted/30 focus:border-primary-muted bg-white"
                  value={fateValue} onChange={e => setFateValue(e.target.value)}>
                  <option value="">— Select fate —</option>
                  <option value="Freeze">❄️ Freeze</option>
                  <option value="Transfer">🧬 Transfer</option>
                  <option value="Discard">❌ Discard</option>
                </select>
              </div>
              {fateValue === 'Freeze' && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Freeze ID</label>
                  <input
                    className="w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-muted/30 focus:border-primary-muted bg-white"
                    placeholder="#1, #2…" value={freezeId} onChange={e => setFreezeId(e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <input
                  className="w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-muted/30 focus:border-primary-muted bg-white"
                  placeholder="Add notes…" value={fateNotes} onChange={e => setFateNotes(e.target.value)} />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Not ready yet? Skip this — the fate can be recorded later from the Development Tracker.
          </p>
        </div>
        )}

        {/* footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-2 shrink-0">
          {approveStep === 0 ? (
            <>
              <button type="button" onClick={onClose} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
              <button type="button" onClick={() => setApproveStep(1)} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ background: 'var(--gradient-primary)' }}>
                Next <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setApproveStep(0)} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors disabled:opacity-40">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onApprove({ day: blastDay })} disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors disabled:opacity-40">
                  Fill Later
                </button>
                <button type="button" onClick={() => onApprove({
                  day: blastDay, fate: fateValue || undefined,
                  freezeId: fateValue === 'Freeze' ? (freezeId || undefined) : undefined,
                  notes: fateNotes || undefined,
                })}
                  disabled={saving || !fateValue}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--gradient-primary)' }}>
                  <CheckCircle2 size={15} /> {saving ? 'Saving…' : 'Confirm & Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
