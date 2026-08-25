import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Maximize2, Move, ZoomIn, ZoomOut } from 'lucide-react';

export function Gauge({ score }: { score: number | null }) {
  const f = score != null ? Math.max(0, Math.min(1, score / 10)) : 0;
  const GX = 110, GY = 116, GR = 82, GC = 2 * Math.PI * GR, gHalf = GC / 2;
  const polar = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180; return [GX + r * Math.cos(a), GY - r * Math.sin(a)];
  };
  const needleDeg = 180 - f * 180;
  const [nx1, ny1] = polar(GR - 13, needleDeg);
  const [nx2, ny2] = polar(GR + 2, needleDeg);
  return (
    <div className="relative">
      <svg viewBox="0 12 220 118" className="w-full block">
        <defs>
          <linearGradient id="gauge-fill-r" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#cdb4e6" /><stop offset="100%" stopColor="#6b1176" />
          </linearGradient>
        </defs>
        <circle cx={GX} cy={GY} r={GR} fill="none" stroke="#ece7f4" strokeWidth="22" strokeDasharray={`${gHalf} ${GC}`} strokeLinecap="round" transform={`rotate(180 ${GX} ${GY})`} />
        <circle cx={GX} cy={GY} r={GR} fill="none" stroke="url(#gauge-fill-r)" strokeWidth="22" strokeDasharray={`${f * gHalf} ${GC}`} strokeLinecap="round" transform={`rotate(180 ${GX} ${GY})`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        {Array.from({ length: 11 }, (_, i) => 180 - i * 18).map((deg, i) => {
          const [x1, y1] = polar(GR + 4, deg); const [x2, y2] = polar(GR + 9, deg);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d6cfe4" strokeWidth="1.5" strokeLinecap="round" />;
        })}
        {score != null && <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="#3f3550" strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-x-0 top-[50%] flex flex-col items-center gap-1 text-center">
        <span className="text-3xl font-black leading-none text-gray-800">{score != null ? score.toFixed(1) : '—'}</span>
        <span className="text-sm font-bold text-gray-700 leading-none">AI Score</span>
      </div>
    </div>
  );
}

export function Donut({ percent }: { percent: number }) {
  const R = 15, C = 2 * Math.PI * R;
  return (
    <div className="relative w-11 h-11">
      <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" stroke="#ece7f4" strokeWidth="5" />
        <circle cx="20" cy="20" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(percent / 100) * C} ${C}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-primary">{percent}%</span>
    </div>
  );
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;

export function AnnotThumb({ src, label }: { src: string | null | undefined; label: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(true);
  useEffect(() => { setLoaded(!src || !!imgRef.current?.complete); }, [src]);

  return (
    <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-line bg-gray-950">
      {src
        ? <img ref={imgRef} src={src} alt={label} className="w-full h-full object-contain"
            onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
        : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} className="text-gray-600" /></div>}

      {src && !loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/60">
          <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-2 pt-3 pb-1.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
        <span className="text-[10px] font-black uppercase tracking-wide text-white">{label}</span>
      </div>
    </div>
  );
}

export function AnnotatedViewer({ src, resetKey, label, tint }: {
  src: string | null; resetKey: string; label?: string; tint?: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(true);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [resetKey]);

  // Already-decoded sources (a tab flipped back, a thumbnail revisited) must not
  // flash the spinner, so seed from the element's own complete flag.
  useEffect(() => { setLoaded(!src || !!imgRef.current?.complete); }, [src]);

  const applyZoom = (next: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    setZoom(z);
    if (z === 1) setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.ox + (e.clientX - drag.current.px), y: drag.current.oy + (e.clientY - drag.current.py) });
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className="relative flex-1 min-h-0 rounded-2xl border border-line bg-gray-950 overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-center touch-none"
        style={{ cursor: zoom === 1 ? 'default' : drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => applyZoom(zoom >= ZOOM_MAX ? 1 : zoom + 1)}>
        {src ? (
          <img ref={imgRef} src={src} alt="annotated" draggable={false}
            onLoad={() => setLoaded(true)} onError={() => setLoaded(true)}
            className="w-full h-full object-contain select-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: drag.current ? 'none' : 'transform 150ms ease-out' }} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <ImageIcon size={28} /><span className="text-xs">No annotated image</span>
          </div>
        )}
      </div>

      {src && !loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/60">
          <span className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}

      {src && (
        <>
          {/* zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col items-center gap-1 rounded-xl bg-black/45 backdrop-blur-sm p-1">
            <button type="button" onClick={() => applyZoom(zoom + 0.5)} disabled={zoom >= ZOOM_MAX} title="Zoom in"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ZoomIn size={14} />
            </button>
            <span className="text-[9px] font-black text-white/70 tabular-nums">{zoom.toFixed(1)}×</span>
            <button type="button" onClick={() => applyZoom(zoom - 0.5)} disabled={zoom <= ZOOM_MIN} title="Zoom out"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ZoomOut size={14} />
            </button>
            <span className="w-5 h-px bg-white/20" />
            <button type="button" onClick={() => applyZoom(1)} disabled={zoom === 1} title="Fit to frame"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <Maximize2 size={13} />
            </button>
          </div>

          {/* current view, or the pan hint once it takes the slot */}
          {zoom > 1 ? (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/45 backdrop-blur-sm px-2 py-1 text-white/80">
              <Move size={11} />
              <span className="text-[9px] font-bold">Drag to pan</span>
            </div>
          ) : label && (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/45 backdrop-blur-sm px-2.5 py-1">
              {tint && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} />}
              <span className="text-[9px] font-black uppercase tracking-wider text-white/90">{label}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
