import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Award, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck,
  Droplet, Grid2x2, ImageIcon, Info, Pencil, Percent, RefreshCw, Shield, Sparkle, Syringe, Tag, Trash2,
} from 'lucide-react';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { type IvfCycle, type IvfCycleLog, type IvfGrade } from '../../../../services/ivfService';
import { ANNOT_VIEWS, FRAG_PCT, fmtTime, gradeQuality, gradeTextCls, parseUtc } from '../helpers';
import ApproveModal from './ApproveModal';
import OverrideModal from './OverrideModal';
import { AnnotThumb, AnnotatedViewer, Donut, Gauge } from './ResultAtoms';

export default function ResultScreen({ log, cycle, grades, selectedIdx, onSelectIdx, newGradeIds, grade, saving, onBack, onApprove, onOverride, pending, onResumeGrade, onDeleteGrade }: {
  log: IvfCycleLog; cycle?: IvfCycle | null;
  grades: IvfGrade[]; selectedIdx: number; onSelectIdx: (i: number) => void; newGradeIds: number[];
  grade: IvfGrade | null;
  saving: boolean; onBack: () => void; onApprove: (opts: { day: 'Day 5' | 'Day 6'; fate?: string; freezeId?: string; notes?: string }) => void;
  onOverride: (gradeId: number, fields: Record<string, unknown>) => Promise<void>;
  /** Live state for a grade still being processed, if the selected one is. */
  pending?: { running: boolean; progress: number; stage: string } | null;
  onResumeGrade?: (gradeId: number) => void;
  onDeleteGrade?: (gradeId: number) => Promise<void>;
}) {
  // The row exists with its image from the moment of upload; the grade only
  // lands when the model returns, so this is what "still working" looks like.
  const incomplete = !!grade && grade.grade == null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approveStep, setApproveStep] = useState<0 | 1>(0);
  const [blastDay, setBlastDay] = useState<'Day 5' | 'Day 6'>('Day 5');
  const [fateValue, setFateValue] = useState('');
  const [freezeId, setFreezeId] = useState('');
  const [fateNotes, setFateNotes] = useState('');

  // Days elapsed since retrieval decide which day this grade is being logged
  // against — mirrors the "Current Day" card on the Development Tracker.
  const dayInCycle = (() => {
    const base = cycle?.opu_date || cycle?.created_at;
    if (!base) return 0;
    const days = Math.floor((Date.now() - parseUtc(base).getTime()) / 86_400_000);
    return days > 0 ? days : 0;
  })();
  const defaultBlastDay: 'Day 5' | 'Day 6' = dayInCycle >= 6 ? 'Day 6' : 'Day 5';

  const openApproveModal = () => {
    setApproveStep(0);
    setBlastDay(defaultBlastDay);
    // Pre-fill from whatever's already on the log, so re-opening this after a
    // fate was already recorded doesn't reset back to "— Select fate —".
    setFateValue(log.fate || '');
    setFreezeId(log.freeze_no || '');
    setFateNotes(log.meta?.final_notes || '');
    setConfirmOpen(true);
  };

  // Below xl the graded strip is a single horizontally-scrolling row (no room
  // to wrap), so it gets arrow buttons instead of the xl+ wrapping grid.
  const gradedStripRef = useRef<HTMLDivElement>(null);
  const scrollGradedStrip = (dir: 1 | -1) => {
    gradedStripRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [showOriginalGrade, setShowOriginalGrade] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  useEffect(() => {
    if (!grade) return;
    setShowOriginalGrade(false);
  }, [grade]);
  const img = grade?.images[0];
  const score = grade?.ai_score ?? null;
  const confidence = score != null ? Math.min(99, Math.round(score * 10 + 5)) : 0;
  const [mainTab, setMainTab] = useState<'source' | 'annotated'>('annotated');
  useEffect(() => { setMainTab('annotated'); }, [selectedIdx]);
  const mainSrc = (mainTab === 'annotated' ? img?.annotated_img_url : img?.upload_image_url) || null;
  const num = String(log.oocyte_no).padStart(2, '0');
  const d3m = (log.d3_grade || '').match(/^(\d+)\s*C\s*(\d+)/i);
  const cellNum = d3m ? d3m[1] : '—';
  const fragPct = d3m ? (FRAG_PCT[d3m[2]] ?? '—') : '—';

  // Gardner grade splits into expansion / ICM / TE, each with its own model note.
  // Parsed from the AI's original grade, not the (possibly overridden) current grade,
  // since these letters label the AI's own justification below.
  const gardner = (grade?.ai_grade || grade?.grade || '').match(/^(\d)([A-C])([A-C])$/i);

  // Only badge a grade "Best" once the embryologist has actually picked one —
  // no ai_score fallback, so nothing gets badged best by default.
  const bestGradeId = grades.find(g => g.is_best)?.grade_id ?? null;

  const qualityFlags = grade?.quality_flags ?? {};

  // AI's own reasoning for the grade it assigned — not meaningful while viewing a human override.
  const aiGradeJustifications = [
    grade?.exp_inference && { t: `Expansion${gardner ? `: ${gardner[1]}` : ''}`, d: grade.exp_inference },
    qualityFlags.hatching && { t: `Hatching: ${qualityFlags.hatching}`, d: qualityFlags.hatching === 'Hatching'
      ? 'The blastocyst has begun breaching the zona pellucida.'
      : 'The blastocyst remains fully enclosed within the zona pellucida.' },
    grade?.icm_inference && { t: `Inner cell mass${gardner ? `: ${gardner[2].toUpperCase()}` : ''}`, d: grade.icm_inference },
    grade?.te_inference && { t: `Trophectoderm${gardner ? `: ${gardner[3].toUpperCase()}` : ''}`, d: grade.te_inference },
  ].filter(Boolean) as { t: string; d: string }[];

  // Direct morphology observations from the image — valid regardless of any override.
  const morphologyJustifications = [
    qualityFlags.zona_pellucida && { t: `Zona pellucida: ${qualityFlags.zona_pellucida}`, d: 'The zona pellucida appearance supports normal embryo integrity.' },
    qualityFlags.blastocoel && { t: `Blastocoel: ${qualityFlags.blastocoel}`, d: 'Blastocoel expansion is consistent with healthy development.' },
  ].filter(Boolean) as { t: string; d: string }[];

  return (
    <div className="flex flex-col flex-1 xl:min-h-0">
      {/* 320/440/360 (+ gaps, the tab rail, and page padding) needs ~1276px to
          avoid clipping, which a maximized 1280–1366px laptop window doesn't
          reliably have — so xl starts narrower and only widens back out to
          the full column sizes once 2xl (1536px+) guarantees the room. */}
      {/* Row heights are set explicitly (not via auto-rows) because LEFT and
          RIGHT are plain stacked content with no min-height needs of their
          own — a shared floor just left dead space under their shorter
          content. Only CENTER's image viewer genuinely needs one, since its
          flex-1 layout has nothing to size against without it. */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(340px,1fr)_300px] 2xl:grid-cols-[320px_minmax(440px,1fr)_360px] grid-rows-[auto_minmax(420px,55vh)_auto] xl:grid-rows-none gap-5 flex-1 xl:min-h-0">

        {/* LEFT */}
        <div className="rounded-2xl border border-line bg-white flex flex-col xl:min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 p-4 xl:min-h-0 xl:overflow-y-auto">
            <div>
          <p className="text-xs font-black text-gray-800 mb-2">Selected Oocyte</p>

          <div className="rounded-2xl border border-line-light p-4"
            style={{
              background:
                'radial-gradient(120% 140% at 85% 20%, rgba(216,148,241,0.08) 0%, rgba(216,148,241,0) 60%), ' +
                'linear-gradient(115deg, #fcfcfe 0%, #fdfbfd 45%, #fcfafd 100%)',
            }}>
            {/* identity — no image, kept to a single compact row */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-black text-gray-800 truncate">Oocyte {num}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <Droplet size={12} className="text-primary shrink-0" />
                <span className="text-[10px] font-semibold text-gray-500 leading-tight whitespace-nowrap">Drop No.</span>
                <span className="text-[11px] font-bold text-primary bg-primary/5 rounded-lg px-2.5 py-0.5">{log.d3_drop_no || '—'}</span>
              </div>
            </div>

            {/* bottom: PN + cleavage metrics, two per row — dropped on smaller screens to save space */}
            <div className="hidden xl:grid border-t border-primary/25 mt-1 pt-1 grid-cols-2">
              {[
                { Icon: ClipboardCheck, label: 'PN Status', value: log.d1_pn || '—', sub: '', check: !!log.d1_pn },
                { Icon: Grid2x2, label: 'Cell Count', value: cellNum, sub: 'cells', check: false },
                { Icon: Percent, label: 'Fragmentation', value: fragPct, sub: '', check: false },
                { Icon: Shield, label: 'Symmetry', value: log.d3_symmetry || '—', sub: '', check: false },
              ].map(({ Icon, label, value, sub, check }, i) => (
                <div key={label}
                  className={`min-w-0 flex items-center gap-2 py-2.5 ${i % 2 === 1 ? 'pl-2 border-l border-primary/25' : 'pr-2'} ${i >= 2 ? 'border-t border-primary/25' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide leading-tight truncate">{label}</span>
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
            </div>

          {/* graded strip */}
          <div>
            {/* pt-2 on the scroll area reserves room for the Best/Just graded badges,
                which poke above the card via -top-2 — without it the clip cuts them in half */}
            <p className="text-xs font-black text-gray-800 mb-0">Graded Images ({grades.length})</p>
            <div className="relative">
              {/* below xl this is a single scrolling row instead of a wrapping
                  grid, so it needs its own scroll affordance */}
              <button type="button" onClick={() => scrollGradedStrip(-1)}
                className="xl:hidden absolute left-0.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white border border-line shadow-sm flex items-center justify-center text-gray-500 hover:text-primary transition-colors">
                <ChevronLeft size={14} />
              </button>
              <div ref={gradedStripRef}
                className="flex xl:grid content-start gap-2 h-auto xl:h-[230px] overflow-x-auto xl:overflow-x-visible overflow-y-hidden xl:overflow-y-auto pt-2 px-8 xl:px-0 scroll-smooth"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
              {grades.map((g, i) => {
                const isNew = newGradeIds.includes(g.grade_id);
                const isBest = g.grade_id === bestGradeId;
                return (
                // A plain div (not <button>) so the delete icon below can be a real
                // nested <button> — a <button> can't validly contain another one.
                <div key={g.grade_id} role="button" tabIndex={0}
                  onClick={() => onSelectIdx(i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectIdx(i); } }}
                  className={`relative flex flex-col gap-1 rounded-xl border-2 p-1.5 transition-all cursor-pointer w-[88px] shrink-0 xl:w-auto ${
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
                    <span className={`text-[9px] font-bold ${i === selectedIdx ? 'text-primary' : 'text-gray-600'}`}>Image #{i + 1}</span>
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
                  className="flex flex-col gap-1 rounded-xl border-2 border-dashed border-gray-200 p-1.5 w-[88px] shrink-0 xl:w-auto">
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
              <button type="button" onClick={() => scrollGradedStrip(1)}
                className="xl:hidden absolute right-0.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white border border-line shadow-sm flex items-center justify-center text-gray-500 hover:text-primary transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* cycle info — dropped on smaller screens to save space; the left
              panel is already tight below xl once the layout stacks */}
          <div className="hidden xl:block rounded-2xl border border-primary/10 bg-primary/[0.03] p-2.5">
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
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
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
              object-contain, so each is shown whole whatever shape its panel is.
              Below sm there isn't room for a 70/30 split, so the annotation
              thumbnails move under the main image as a horizontal strip. */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <AnnotatedViewer src={mainSrc} resetKey={`${selectedIdx}-${mainTab}`}
                label={mainTab === 'annotated' ? 'Annotated' : 'Source'} />
            </div>

            {/* what the model produced, beside the source it was given */}
            <div className="flex flex-row sm:flex-col gap-2.5 h-24 sm:h-auto shrink-0 sm:w-[30%] sm:max-w-[220px] sm:min-h-0">
              {ANNOT_VIEWS.map(({ label, url }) => (
                <AnnotThumb key={label} src={url(img)} label={label} />
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-line bg-white px-4 py-2.5 flex items-center flex-wrap gap-4 shrink-0">
            {[
              { c: '#eab308', l: 'Zona Pellucida' },
              { c: '#06b6d4', l: 'TE' },
              { c: '#22c55e', l: 'ICM' },
              { c: '#ec4899', l: 'Blastocoel' },
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
        <div className="rounded-2xl border border-line flex flex-col xl:min-h-0 overflow-hidden ">
        <div className="flex flex-col gap-4 p-4 xl:min-h-0 xl:overflow-y-auto [&>*]:shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-gray-800">AI Grading Result &amp; Details</p>
              <p className="text-[11px] text-gray-400">
                {incomplete
                  ? (pending?.running ? 'Analysis in progress' : 'Analysis never finished')
                  : `Grading completed ${fmtTime(grade?.created_at)}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => grade && setOverrideOpen(true)} disabled={!grade || incomplete}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/5 transition-colors disabled:opacity-40">
                <Pencil size={11} /> Override
              </button>
            </div>
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
                <span className="text-[26px] font-black leading-none tracking-tight">
                  {(showOriginalGrade && grade?.ai_grade ? grade.ai_grade : grade?.grade) || '—'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${!showOriginalGrade && grade?.ai_grade && grade.ai_grade !== grade.grade ? 'text-primary/80' : 'text-primary/50'}`}>
                  {showOriginalGrade && grade?.ai_grade
                    ? 'Original AI Grade'
                    : grade?.ai_grade && grade.ai_grade !== grade.grade ? 'Overridden Grade' : 'AI Grade'}
                </span>
                <span className="text-sm font-black text-gray-800 leading-tight">
                  {gradeQuality((showOriginalGrade && grade?.ai_grade ? grade.ai_grade : grade?.grade) || '')}
                </span>
                <span className="text-[10px] text-gray-400">AI embryo grading</span>
              </div>
            </div>
            <div className="relative flex flex-col items-center gap-1 shrink-0">
              <Donut percent={confidence} />
              <span className="text-[9px] font-semibold text-gray-400">Confidence</span>
            </div>
          </div>
          )}

          {grade?.ai_grade && grade.ai_grade !== grade.grade && (
            <div className="flex justify-center -mt-2">
              <button type="button" onClick={() => setShowOriginalGrade(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line text-gray-600 text-[10px] font-bold hover:bg-gray-50 transition-colors">
                <RefreshCw size={11} /> {showOriginalGrade ? 'Show current grade' : 'Show original AI grade'}
              </button>
            </div>
          )}

          {/* gauge */}
          <div className="rounded-2xl border border-white/60 bg-white/85 backdrop-blur-md p-4 flex justify-center">
            <div className="w-full max-w-[240px]">
              <Gauge score={score} />
            </div>
          </div>

          {/* justification — AI's own grade reasoning is hidden while showing the human-overridden grade; morphology observations always stand */}
          {(() => {
            const isShowingOverride = !!(grade?.ai_grade && grade.ai_grade !== grade.grade && !showOriginalGrade);
            const visibleJustifications = isShowingOverride ? morphologyJustifications : [...aiGradeJustifications, ...morphologyJustifications];
            return (
          <div className="rounded-2xl border border-white/60 bg-white/85 backdrop-blur-md p-4">
            <p className="text-xs font-black text-gray-800 mb-3">AI Justification</p>
            <div className="flex flex-col gap-3">
              {visibleJustifications.length === 0 ? (
                <p className="text-[11px] text-gray-400">No morphology data available for this grade.</p>
              ) : visibleJustifications.map(j => (
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
            );
          })()}

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
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 xl:gap-2 xl:px-4 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
          <ArrowLeft size={14} /> Back to Oocytes
        </button>
        <button type="button" onClick={openApproveModal} disabled={saving || !grade || incomplete}
          className="inline-flex items-center gap-2 px-4 py-1.5 xl:px-5 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ background: 'var(--gradient-primary)' }}>
          <CheckCircle2 size={14} /> {saving ? 'Saving…' : 'Approve & Save'}
        </button>
      </div>

      <ApproveModal
        open={confirmOpen} onClose={() => setConfirmOpen(false)}
        approveStep={approveStep} setApproveStep={setApproveStep}
        grades={grades} selectedIdx={selectedIdx} grade={grade}
        score={score} confidence={confidence} qualityFlags={qualityFlags}
        num={num} blastDay={blastDay} setBlastDay={setBlastDay}
        defaultBlastDay={defaultBlastDay} dayInCycle={dayInCycle}
        fateValue={fateValue} setFateValue={setFateValue}
        freezeId={freezeId} setFreezeId={setFreezeId}
        fateNotes={fateNotes} setFateNotes={setFateNotes}
        saving={saving} onApprove={onApprove}
      />

      {overrideOpen && grade && (
        <OverrideModal grade={grade} onClose={() => setOverrideOpen(false)} onOverride={onOverride} />
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
