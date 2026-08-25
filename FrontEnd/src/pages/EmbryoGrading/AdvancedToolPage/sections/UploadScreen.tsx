import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, Camera, Check, Contrast, FileText, ImageIcon,
  Monitor, RefreshCw, Sun, Trash2, UploadCloud, X,
} from 'lucide-react';
import { ivfService, type IvfGrade, type IvfCycleLog } from '../../../../services/ivfService';
import type { ImageSlot } from '../types';
import { ACCEPTED_IMAGE_TYPES, fmtTime, gradeTextCls, isUsableGrade, ooState, parseDay3, useElementColumns } from '../helpers';

// Rendered twice — inside the header row when it is a wide bar, below the card
// in the narrow desktop column — with only one visible per breakpoint.
function SwitchOocyteButton({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 w-auto items-center justify-center gap-1.5 rounded-xl border border-primary/30 text-primary text-[11px] font-bold hover:bg-primary/5 transition-colors ${className}`}>
      <RefreshCw size={13} /> Switch Oocyte
    </button>
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

export default function UploadScreen({ log, cycleId, bestImageUrl, imageSlots, onAdd, onRemove, onRemoveAll, uploading, onCancel, onStart, onSkip, error }: {
  log: IvfCycleLog; cycleId: number | null; bestImageUrl: string | null; imageSlots: ImageSlot[];
  onAdd: (f: File) => void; onRemove: (i: number) => void; onRemoveAll: () => void;
  uploading: boolean; onCancel: () => void; onStart: () => void; onSkip: () => void;
  error?: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const d3 = parseDay3(log.d3_grade);
  const num = String(log.oocyte_no).padStart(2, '0');
  const state = ooState(log);

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
    Array.from(e.dataTransfer.files).filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type)).forEach(onAdd);
  };

  // The screen fills the viewport at every width so the action bar is always on
  // screen; only the upload list scrolls.
  return (
    <div className="grid grid-cols-1 grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[300px_1fr] xl:grid-rows-1 gap-3 xl:gap-5 flex-1 min-h-0">
      {/* LEFT: selected oocyte */}
      <div className="flex flex-col min-h-0 w-full xl:w-[300px]">
        {/* Decorative only — stretched full width below xl it dwarfs the panel. */}
        <div className="hidden xl:block rounded-t-2xl overflow-hidden shrink-0">
          <img src="/emb_select_oocyte.png" alt="" className="w-full h-auto block" />
        </div>
        <div className="relative z-10 xl:-mt-6 flex-1 flex flex-col min-h-0 rounded-2xl border border-line bg-white p-4 xl:p-3 shadow-sm">
        <p className="text-sm font-black text-gray-800 mb-3 xl:mb-0">Select Oocyte</p>
        <p className="hidden xl:block text-[11px] text-gray-400 mb-2">1 oocyte selected</p>

        <div className="rounded-2xl overflow-hidden flex flex-col min-h-0 bg-[#F3EAF5]">
          {/* Stacked full width below xl, so the fields spread across the bar
              instead of stacking in a column against a wall of empty space. */}
          <div className="p-4 xl:p-3 flex items-center xl:items-start gap-5 xl:gap-2 text-primary">
            <div className="order-2 xl:order-none flex-1 min-w-0 flex flex-wrap items-center gap-x-10 gap-y-3 xl:flex-col xl:flex-nowrap xl:items-start xl:gap-2">
              <span className="text-base font-black">Oocyte {num}</span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-primary/60">Drop No.</span>
                <span className="font-bold bg-white text-primary rounded-md px-2 py-1 xl:px-1.5 xl:py-0.5">{log.d3_drop_no || log.d0_drop_no || '—'}</span>
              </div>
              <div>
                <p className="text-[11px] text-primary/60">Final Grade</p>
                <p className="text-xl font-black leading-tight">{log.blast_grade || '—'}</p>
              </div>
            </div>
            <div className="order-1 xl:order-none flex flex-col items-center xl:items-end gap-2 shrink-0">
              {bestImageUrl ? (
                <div className={`w-14 h-14 rounded-full shrink-0 border-2 overflow-hidden flex items-center justify-center bg-gray-900 ${
                  state === 'final' ? 'border-emerald-300' : 'border-primary/30'
                }`}>
                  <img src={bestImageUrl} alt={`Oocyte ${num} best image`} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-full shrink-0 border-2 border-dashed border-primary/20 bg-white/60 flex items-center justify-center">
                  <ImageIcon size={18} className="text-primary/40" />
                </div>
              )}
              <div className="flex items-center gap-1 text-[10px] text-primary/70">
                <span className={`w-1.5 h-1.5 rounded-full ${state === 'final' ? 'bg-emerald-500' : state === 'ai' ? 'bg-blue-400' : 'bg-gray-400'}`} />
                {state === 'final' ? 'Graded' : state === 'ai' ? (bestImageUrl ? 'AI Graded' : 'Best image pending') : 'Not Graded'}
              </div>
            </div>

            <SwitchOocyteButton onClick={onCancel} className="order-3 inline-flex xl:hidden bg-white/70 px-3.5 py-2" />
          </div>
          {/* white inner detail */}
          <div className="hidden xl:flex bg-white m-1.5 rounded-xl p-3 flex-col gap-3 overflow-y-auto">
            <DetailBlock title="Day 1 – PN Check" rows={[
              { label: 'PN Status', value: log.d1_pn || '—', ok: !!log.d1_pn },
              { label: 'Zygote Status', value: log.d1_zygote_status || '—' },
            ]} />
            <DetailBlock title="Day 3 – Cleavage" rows={[
              { label: 'Cell Count', value: d3.cells || '—' },
              { label: 'Fragmentation', value: d3.frag || '—' },
              { label: 'Symmetry', value: log.d3_symmetry || '—' },
            ]} />
          </div>
        </div>

        <SwitchOocyteButton onClick={onCancel} className="hidden xl:inline-flex mt-2 self-center px-3 py-1.5" />
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

        <div className="mt-4 flex flex-col gap-4 px-5 flex-1 min-h-0 overflow-y-auto">
          {/* drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`shrink-0 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-8 transition-all ${
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
            <p className="text-[10px] text-gray-400">Supports JPG, PNG, WebP • Max size 20MB per file</p>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} multiple className="hidden"
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
        <div className="mt-2 px-3 py-2 xl:mt-0 xl:px-4 xl:py-3 border-t border-line flex items-center justify-between shrink-0 bg-surface/40">
          <button type="button" onClick={onCancel}
            className="px-3.5 py-1.5 xl:px-4 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-gray-600 border border-line hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {(log.grade_count ?? 0) > 0 && (
              <button type="button" onClick={onSkip} disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 xl:gap-2 xl:px-4 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-primary border border-primary/30 hover:bg-primary/5 transition-colors disabled:opacity-40">
                Skip <ArrowRight size={14} />
              </button>
            )}
            <button type="button" onClick={onStart} disabled={imageSlots.length === 0 || uploading}
              className="inline-flex items-center gap-2 px-4 py-1.5 xl:px-5 xl:py-2 rounded-xl text-xs xl:text-[13px] font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
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
