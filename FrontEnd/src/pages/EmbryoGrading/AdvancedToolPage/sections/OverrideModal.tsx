import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Pencil, X } from 'lucide-react';
import FloatingSelect from '../../../../components/FloatingSelect';
import type { IvfGrade } from '../../../../services/ivfService';

type QualityFlagKey = 'hatching' | 'zona_pellucida' | 'blastocoel' | 'bridge' | 'blackspot' | 'early_blast';

const QUALITY_FLAG_FIELDS: { label: string; key: QualityFlagKey; opts: readonly string[] }[] = [
  { label: 'Hatching', key: 'hatching', opts: ['Not Hatched', 'Hatching', 'Hatched'] },
  { label: 'Zona Pellucida', key: 'zona_pellucida', opts: ['Split Formation', 'Intact', 'Thinning'] },
  { label: 'Blastocoel', key: 'blastocoel', opts: ['Early Expansion', 'Fully Expanded', 'Over-Expanded'] },
  { label: 'Bridge', key: 'bridge', opts: ['Absent', 'Present'] },
  { label: 'Blackspot', key: 'blackspot', opts: ['Absent', 'Present'] },
  { label: 'Early Blast', key: 'early_blast', opts: ['EB1', 'EB2', 'EB3'] },
];

/**
 * Mounted only while open (the parent gates on `overrideOpen && grade`), so
 * every field below is safe to seed straight from `grade` at construction —
 * no reset effect needed, a fresh mount already starts clean.
 */
export default function OverrideModal({ grade, onClose, onOverride }: {
  grade: IvfGrade;
  onClose: () => void;
  onOverride: (gradeId: number, fields: Record<string, unknown>) => Promise<void>;
}) {
  const qf = grade.quality_flags ?? {};
  const qfr = grade.quality_flag_reasons ?? {};
  const [ov, setOv] = useState({
    grade: grade.grade ?? '', hatching: qf.hatching ?? '', zona_pellucida: qf.zona_pellucida ?? '',
    blastocoel: qf.blastocoel ?? '', bridge: qf.bridge ?? '',
    blackspot: qf.blackspot ?? '', early_blast: qf.early_blast ?? '',
  });
  const [ovReasons, setOvReasons] = useState({
    hatching: qfr.hatching ?? '', zona_pellucida: qfr.zona_pellucida ?? '', blastocoel: qfr.blastocoel ?? '',
    bridge: qfr.bridge ?? '', blackspot: qfr.blackspot ?? '', early_blast: qfr.early_blast ?? '',
  });
  const [reason, setReason] = useState(grade.override_reason ?? '');
  const [overriding, setOverriding] = useState(false);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !overriding) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="px-5 py-4 border-b border-line flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Pencil size={15} className="text-primary" /></div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">Override AI Grade</p>
            <p className="text-[11px] text-gray-400">Manually adjust the grade and morphology</p>
          </div>
          <button type="button" onClick={() => { if (!overriding) onClose(); }}
            className="w-8 h-8 rounded-lg border border-line flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"><X size={15} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto min-h-0 [&>*]:shrink-0">
          <div className="rounded-2xl border border-primary/10 overflow-hidden">
            <div className="px-4 py-3 bg-primary/5 border-b border-primary/10">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-0.5">Grade</p>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">AI Original</span>
                  <span className="text-2xl font-black text-gray-400 leading-none">{grade.ai_grade || grade.grade || '—'}</span>
                </div>
                <ArrowRight size={16} className="text-gray-300 shrink-0 self-end mb-1.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-primary/50">New Grade</span>
                  <input value={ov.grade} onChange={e => setOv(v => ({ ...v, grade: e.target.value }))} autoFocus
                    className="text-2xl font-black text-primary bg-transparent outline-none border-b-2 border-primary w-24" placeholder="e.g. 4AA" />
                </div>
                <div className="flex flex-col items-end gap-1 ml-auto">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Final Grade</span>
                  <span className="text-4xl font-black leading-none text-white rounded-xl px-4 py-1.5"
                    style={{ background: 'var(--gradient-primary)' }}>{ov.grade || '—'}</span>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Reason for override</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-muted/30 focus:border-primary-muted"
                  placeholder="Why are you changing the AI's grade?" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {QUALITY_FLAG_FIELDS.map(({ label, key, opts }) => {
              const aiValue = grade.ai_quality_flags?.[key];
              return (
              <div key={key} className="rounded-xl border border-primary/10 overflow-hidden">
                <div className="px-3 py-1.5 bg-primary/5 border-b border-primary/10 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{label}</p>
                  <FloatingSelect value={ov[key]} onChange={v => setOv(prev => ({ ...prev, [key]: v }))} options={opts} />
                </div>
                <div className="px-3 py-1.5">
                  {aiValue && aiValue !== ov[key] && (
                    <span className="text-[9px] text-gray-400">AI: {aiValue}</span>
                  )}
                  <input value={ovReasons[key]} onChange={e => setOvReasons(v => ({ ...v, [key]: e.target.value }))}
                    placeholder="Reason (optional)"
                    className={`w-full rounded-md border border-gray-100 px-2 py-0.5 text-[10px] text-gray-600 outline-none focus:ring-1 focus:ring-primary-muted/30 focus:border-primary-muted ${aiValue && aiValue !== ov[key] ? 'mt-1' : ''}`} />
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-line flex items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} disabled={overriding}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors disabled:opacity-40">Cancel</button>
          <button type="button" disabled={overriding || !ov.grade.trim() || !reason.trim()}
            onClick={async () => {
              setOverriding(true);
              try {
                const { grade: newGrade, hatching, zona_pellucida, blastocoel, bridge, blackspot, early_blast } = ov;
                await onOverride(grade.grade_id, {
                  grade: newGrade,
                  quality_flags: { hatching, zona_pellucida, blastocoel, bridge, blackspot, early_blast },
                  quality_flag_reasons: ovReasons,
                  override_reason: reason,
                });
                onClose();
              }
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
  );
}
