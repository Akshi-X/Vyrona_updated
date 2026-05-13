import React, { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw, Maximize2, ChevronRight, Upload, Info, Check } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import EmbryosIcon from '../../assets/DashBoardIcons/Embryos.svg';
import type { IVFTreatment } from '../../types/ivf';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoundingBox {
  id: number; x: number; y: number; width: number; height: number;
}
interface BoxEditState {
  boxId: number; mode: 'move' | 'resize';
  startPoint: { x: number; y: number }; originalBox: BoundingBox;
}
interface EmbryoImageOption { id: string; name: string; src: string; isUploaded?: boolean; }
interface AdvancedEmbryoRouteState { embryo?: IVFTreatment; }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ── Mock static data ──────────────────────────────────────────────────────────

const MOCK_AI = {
  grade: '5AA', expansion: '5', expansionLabel: 'Expanded Blastocyst', expansionConf: 88,
  icm: 'A', icmLabel: 'Many Cells', icmConf: 87,
  te: 'A', teLabel: 'Many Cells', teConf: 85,
  confidence: 86.1, quality: 'High Quality',
};

const DEV_TIMELINE = [
  { time: '16.1 h', event: '2 PN', active: false },
  { time: '40.3 h', event: '4 Cell', active: false },
  { time: '65.2 h', event: '8 Cell', active: false },
  { time: '89.5 h', event: 'Morula', active: false },
  { time: '113.7 h', event: 'Early Blastocyst', active: false },
  { time: '17.57 h (Day 5)', event: 'Expanded Blastocyst', active: true },
];

const AI_JUSTIFICATION =
  'The embryo is a fully expanded blastocyst with a well-defined inner cell mass containing many tightly packed cells and a trophectoderm with many cells forming a cohesive epithelium. Overall characteristics indicate high implantation potential.';

const KEY_OBSERVATIONS = [
  'Blastocoel fully fills the embryo',
  'ICM is dense with many cells',
  'TE is cohesive with many cells',
  'Zona pellucida is intact',
  'No major fragmentation observed',
];

const ANNOTATIONS = [
  { label: 'ICM', x: 68, y: 22, color: 'bg-[#5b8de8] text-white' },
  { label: 'TE', x: 84, y: 52, color: 'bg-[#d94f8c] text-white' },
  { label: 'Expansion', x: 70, y: 78, color: 'bg-[#6b1176] text-white' },
];

// ── Placeholder embryo SVG ────────────────────────────────────────────────────

const mkPlaceholder = (label: string, c1: string, c2: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><radialGradient id="bg" cx="45%" cy="40%" r="80%"><stop offset="0%" stop-color="${c1}"/><stop offset="70%" stop-color="${c2}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="340" cy="300" r="215" fill="none" stroke="#c0c0c0" stroke-width="28" opacity="0.6"/><circle cx="470" cy="305" r="128" fill="#cce8f7" stroke="#6f8ca1" stroke-width="3"/><text x="26" y="46" fill="#fff" font-size="22" font-family="Arial" opacity="0.9">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const DEFAULT_IMAGES: EmbryoImageOption[] = [
  { id: 'img-a', name: 'Embryo Sample 01', src: '/embryo/embryo_01.jpg' },
  { id: 'img-b', name: 'Embryo B', src: mkPlaceholder('Embryo B', '#e2f1fa', '#5f88a5') },
  { id: 'img-c', name: 'Embryo C', src: mkPlaceholder('Embryo C', '#d7eaf6', '#5d83a0') },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedEmbryoGradingPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const embryo = ((location.state as AdvancedEmbryoRouteState) || {}).embryo;

  // Viewer state
  const viewerRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [draftBox, setDraftBox] = useState<BoundingBox | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [boxEditState, setBoxEditState] = useState<BoxEditState | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);

  // UI state
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [componentGradesOpen, setComponentGradesOpen] = useState(true);
  const [uploadedImage, setUploadedImage] = useState<EmbryoImageOption | null>(null);
  const [selectedImageId, setSelectedImageId] = useState(DEFAULT_IMAGES[0].id);
  const [noteDraft, setNoteDraft] = useState('');
  const [notes, setNotes] = useState<string[]>([]);

  const images = useMemo(
    () => (uploadedImage ? [...DEFAULT_IMAGES, uploadedImage] : DEFAULT_IMAGES),
    [uploadedImage],
  );
  const selectedImage = images.find(i => i.id === selectedImageId) || images[0];

  // ── Viewer interaction ────────────────────────────────────────────────────

  const relPct = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewerRef.current) return null;
    const r = viewerRef.current.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const lx = (e.clientX - r.left - panOffset.x) / zoomLevel;
    const ly = (e.clientY - r.top - panOffset.y) / zoomLevel;
    return { x: clamp((lx / r.width) * 100, 0, 100), y: clamp((ly / r.height) * 100, 0, 100) };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (zoomLevel > 1) { setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }); return; }
    const p = relPct(e); if (!p) return;
    setDragStart(p);
    setDraftBox({ id: Date.now(), x: p.x, y: p.y, width: 0, height: 0 });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (boxEditState) {
      const p = relPct(e); if (!p) return;
      const dx = p.x - boxEditState.startPoint.x, dy = p.y - boxEditState.startPoint.y;
      setBoxes(prev => prev.map(b => {
        if (b.id !== boxEditState.boxId) return b;
        if (boxEditState.mode === 'move') return { ...b, x: clamp(boxEditState.originalBox.x + dx, 0, 100 - boxEditState.originalBox.width), y: clamp(boxEditState.originalBox.y + dy, 0, 100 - boxEditState.originalBox.height) };
        return { ...b, width: clamp(boxEditState.originalBox.width + dx, 2, 100 - boxEditState.originalBox.x), height: clamp(boxEditState.originalBox.height + dy, 2, 100 - boxEditState.originalBox.y) };
      }));
      return;
    }
    if (panStart && zoomLevel > 1) { setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); return; }
    if (!dragStart) return;
    const p = relPct(e); if (!p) return;
    setDraftBox(prev => prev ? { ...prev, x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y), width: Math.abs(p.x - dragStart.x), height: Math.abs(p.y - dragStart.y) } : null);
  };

  const onMouseUp = () => {
    if (boxEditState) { setBoxEditState(null); return; }
    if (panStart) { setPanStart(null); return; }
    if (draftBox && draftBox.width > 2 && draftBox.height > 2) { setBoxes(p => [...p, draftBox]); setSelectedBoxId(draftBox.id); }
    setDraftBox(null); setDragStart(null);
  };

  const onBoxMouseDown = (e: React.MouseEvent<HTMLDivElement>, box: BoundingBox, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const p = relPct(e as React.MouseEvent<HTMLDivElement>); if (!p) return;
    setSelectedBoxId(box.id);
    setBoxEditState({ boxId: box.id, mode, startPoint: p, originalBox: { ...box } });
  };

  const handleZoom = (next: number) => {
    const z = clamp(next, 1, 3); setZoomLevel(z);
    if (z === 1) { setPanOffset({ x: 0, y: 0 }); setPanStart(null); }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const id = `upload-${Date.now()}`;
    setUploadedImage(prev => { if (prev?.isUploaded) URL.revokeObjectURL(prev.src); return { id, name: file.name, src: URL.createObjectURL(file), isUploaded: true }; });
    setSelectedImageId(id); e.target.value = '';
  };

  const capturedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageLayout
      title="Advanced Embryo Grading"
      icon={EmbryosIcon}
      actions={
        <div className="flex items-center gap-2">
          <button type="button" className="p-2 rounded-md border border-[#E7E1E1] bg-white text-gray-500 hover:bg-gray-50">
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={() => navigate(his ? `/embryo-grading/${his}` : '/embryo-grading')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#E7E1E1] bg-white text-sm text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft size={15} />
            Back to Log Sheet
          </button>
        </div>
      }
    >
      {/* Sub-header: patient info */}
      <div className="px-1 pb-3">
        <p className="text-sm font-semibold text-gray-800">{embryo?.hisNumber || his || '—'} | TID —</p>
        <p className="text-xs text-gray-400 mt-0.5">Event | tEB</p>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[440px_minmax(0,1fr)_460px] gap-4 h-full min-h-0">

        {/* ── LEFT PANEL ── */}
        <aside className="flex flex-col gap-3 overflow-y-auto pr-0.5">

          {/* AI Grade */}
          <div className="rounded-lg border border-[#E7E1E1] bg-white p-4">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-2">AI Grade</p>
            <p className="text-5xl font-extrabold text-[#6b1176] leading-none">{MOCK_AI.grade}</p>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Confidence Score</span>
                <button type="button" className="text-gray-300 hover:text-gray-400"><Info size={13} /></button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-[#6b1176]" style={{ width: `${MOCK_AI.confidence}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{MOCK_AI.confidence}%</span>
              </div>
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-semibold text-emerald-700">{MOCK_AI.quality}</span>
              </div>
            </div>
          </div>

          {/* Component Grades */}
          <div className="rounded-lg border border-[#E7E1E1] bg-white">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 text-left"
              onClick={() => setComponentGradesOpen(o => !o)}
            >
              <ChevronRight size={14} className={`text-gray-400 transition-transform ${componentGradesOpen ? 'rotate-90' : ''}`} />
              <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">Component Grades</span>
            </button>
            {componentGradesOpen && (
              <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                {[
                  { label: 'Expansion', value: MOCK_AI.expansion, sub: MOCK_AI.expansionLabel, conf: MOCK_AI.expansionConf },
                  { label: 'ICM', value: MOCK_AI.icm, sub: MOCK_AI.icmLabel, conf: MOCK_AI.icmConf },
                  { label: 'TE', value: MOCK_AI.te, sub: MOCK_AI.teLabel, conf: MOCK_AI.teConf },
                ].map(c => (
                  <div key={c.label} className="rounded-lg border border-[#E7E1E1] bg-[#FCF9FF] p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-[#6b1176]">{c.label}</span>
                      <Info size={11} className="text-gray-300" />
                    </div>
                    <p className="text-2xl font-extrabold text-[#6b1176]">{c.value}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{c.sub}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Confidence: {c.conf}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Justification */}
          <div className="rounded-lg border border-[#E7E1E1] bg-white p-4">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-2">AI Justification</p>
            <p className="text-xs text-gray-700 leading-relaxed">{AI_JUSTIFICATION}</p>
          </div>

          {/* Key Observations */}
          <div className="rounded-lg border border-[#E7E1E1] bg-white p-4">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Key Observations</p>
            <ul className="space-y-2">
              {KEY_OBSERVATIONS.map(obs => (
                <li key={obs} className="flex items-start gap-2 text-xs text-gray-600">
                  <Check size={12} className="text-[#6b1176] mt-0.5 shrink-0" />
                  {obs}
                </li>
              ))}
            </ul>
          </div>

          {/* Embryo Images */}
          <div className="rounded-lg border border-[#E7E1E1] bg-white p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Embryo Images</p>
              <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#E7E1E1] text-[11px] text-[#6b1176] hover:bg-[#F7ECFF] cursor-pointer">
                <Upload size={11} /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">Select image first, then draw boxes in center viewer.</p>
            <div className="grid grid-cols-3 gap-2">
              {images.map(img => {
                const active = img.id === selectedImageId;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelectedImageId(img.id)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${active ? 'border-[#6b1176]' : 'border-[#E7E1E1] hover:border-[#c8b2d1]'}`}
                  >
                    <img src={img.src} alt={img.name} className="h-16 w-full object-cover" />
                    {active && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#6b1176] flex items-center justify-center">
                        <Check size={9} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── CENTER PANEL ── */}
        <section className="rounded-lg border border-[#E7E1E1] bg-white overflow-hidden flex flex-col min-h-[500px]">

          {/* EID tabs */}
          <div className="px-4 py-2.5 border-b border-[#E7E1E1] flex items-center gap-2 bg-[#FDFAFF]">
            <button type="button" className="px-3 py-1 rounded border border-[#6b1176] bg-[#F7ECFF] text-[#6b1176] text-xs font-semibold">EID 1</button>
            <button type="button" className="px-3 py-1 rounded border border-[#E7E1E1] text-gray-500 text-xs">17.57 H</button>
          </div>

          {/* Viewer toolbar */}
          <div className="px-4 py-2 border-b border-[#E7E1E1] flex items-center justify-between bg-white">
            <span className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Viewer</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAnnotations(true)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${showAnnotations ? 'bg-[#6b1176] text-white' : 'border border-[#E7E1E1] text-gray-500 hover:bg-gray-50'}`}
              >
                Annotations
              </button>
              <button
                type="button"
                onClick={() => setShowAnnotations(false)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${!showAnnotations ? 'bg-[#6b1176] text-white' : 'border border-[#E7E1E1] text-gray-500 hover:bg-gray-50'}`}
              >
                Overlay
              </button>
              <button type="button" className="p-1 rounded border border-[#E7E1E1] text-gray-400 hover:bg-gray-50">
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          {/* Viewer body */}
          <div className="flex-1 flex min-h-0">
            {/* Zoom rail */}
            <div className="w-10 shrink-0 border-r border-[#E7E1E1] bg-[#FDFAFF] flex flex-col items-center py-3 gap-1 text-[10px] text-[#6b1176]">
              <button type="button" onClick={() => handleZoom(zoomLevel + 0.25)} className="w-6 h-6 rounded border border-[#D8C7E3] bg-white text-sm leading-none hover:bg-[#F7ECFF]">+</button>
              <span className="font-semibold text-[9px] my-1">{Math.round(zoomLevel * 100)}%</span>
              <button type="button" onClick={() => handleZoom(zoomLevel - 0.25)} className="w-6 h-6 rounded border border-[#D8C7E3] bg-white text-sm leading-none hover:bg-[#F7ECFF]">−</button>
              <div className="flex-1 flex items-center justify-center w-full mt-1">
                <input
                  type="range" min={1} max={3} step={0.25} value={zoomLevel}
                  onChange={e => handleZoom(Number(e.target.value))}
                  className="w-16 -rotate-90 accent-[#6b1176]"
                />
              </div>
            </div>

            {/* Image viewer */}
            <div
              ref={viewerRef}
              className={`relative flex-1 bg-[#1a1a2e] overflow-hidden ${zoomLevel > 1 ? 'cursor-grab' : 'cursor-crosshair'} ${panStart ? 'cursor-grabbing' : ''}`}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <div
                className="absolute inset-0"
                style={{ transform: `translate(${panOffset.x}px,${panOffset.y}px) scale(${zoomLevel})`, transformOrigin: 'center center' }}
              >
                <img src={selectedImage.src} alt={selectedImage.name} className="absolute inset-0 h-full w-full object-cover" />

                {/* Static annotation labels */}
                {showAnnotations && ANNOTATIONS.map(a => (
                  <div
                    key={a.label}
                    className={`absolute px-2.5 py-1 rounded-md text-xs font-bold shadow-lg pointer-events-none ${a.color}`}
                    style={{ left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%,-50%)' }}
                  >
                    {a.label}
                  </div>
                ))}

                {/* User bounding boxes */}
                {boxes.map((box, idx) => (
                  <div
                    key={box.id}
                    className={`absolute border-2 ${box.id === selectedBoxId ? 'border-[#6b1176] bg-[#6b1176]/20' : 'border-[#8E63FF] bg-[#8E63FF]/15'}`}
                    style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
                    onMouseDown={e => onBoxMouseDown(e, box, 'move')}
                    onClick={e => { e.stopPropagation(); setSelectedBoxId(box.id); }}
                  >
                    <span className="absolute -top-5 left-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-[#8E63FF] text-white whitespace-nowrap">
                      Embryo {idx + 1}
                    </span>
                    <button
                      type="button"
                      onMouseDown={e => onBoxMouseDown(e as unknown as React.MouseEvent<HTMLDivElement>, box, 'resize')}
                      className="absolute -bottom-1 -right-1 h-3 w-3 rounded-sm border border-white bg-[#6b1176]"
                    />
                  </div>
                ))}
                {draftBox && (
                  <div
                    className="absolute border-2 border-dashed border-[#8E63FF] bg-[#8E63FF]/15"
                    style={{ left: `${draftBox.x}%`, top: `${draftBox.y}%`, width: `${draftBox.width}%`, height: `${draftBox.height}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Timeline scrubber */}
        </section>

        {/* ── RIGHT PANEL ── */}
        <aside className="flex flex-col gap-0 overflow-y-auto rounded-lg border border-[#E7E1E1] bg-white divide-y divide-[#F0EAF4]">

          {/* Embryo Details */}
          <div className="p-4">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Embryo Details</p>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-[#F8F4FD]">
                {[
                  { label: 'Patient ID', value: embryo?.hisNumber || his || '—' },
                  { label: 'Oocyte No.', value: '12' },
                  { label: 'Day / Time', value: 'Day 5 / 17.57 h' },
                  { label: 'Fertilization', value: 'ICSI' },
                  { label: 'Embryo ID', value: 'EID 1' },
                  { label: 'Captured On', value: capturedOn },
                ].map(r => (
                  <tr key={r.label}>
                    <td className="py-1.5 text-gray-400 font-medium">{r.label}</td>
                    <td className="py-1.5 text-gray-800 text-right">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grading History */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Grading History</p>
              <button type="button" className="text-gray-300 hover:text-[#6b1176]"><RefreshCw size={13} /></button>
            </div>
            <div className="rounded-lg border border-[#E7E1E1] bg-[#FDFAFF] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <RefreshCw size={11} className="text-[#6b1176]" />
                  <span className="font-semibold">Day 5 / 17.57 h</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#F7ECFF] border border-[#D8C7E3] text-[#6b1176] text-[11px] font-bold">{MOCK_AI.grade}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
                <span>AI Grade</span>
                <span>·</span>
                <span>{capturedOn}</span>
              </div>
            </div>
          </div>

          {/* Development Timeline */}
          <div className="p-4">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Development Timeline</p>
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#E8D5F5]" />
              <ul className="space-y-2.5">
                {DEV_TIMELINE.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 pl-0.5">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 z-10 ${item.active ? 'bg-[#6b1176] border-[#6b1176]' : 'bg-white border-[#c084fc]'}`} />
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className={`text-xs ${item.active ? 'text-[#6b1176] font-semibold' : 'text-gray-500'}`}>{item.time}</span>
                      <span className={`text-xs ml-2 text-right ${item.active ? 'text-[#6b1176] font-bold' : 'text-gray-600'}`}>{item.event}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Clinician Notes */}
          <div className="p-4 flex-1 flex flex-col">
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Clinician Notes</p>
            {notes.length > 0 && (
              <ul className="space-y-1.5 mb-3">
                {notes.map((n, i) => (
                  <li key={i} className="text-xs text-gray-600 bg-[#FDFAFF] rounded px-2.5 py-1.5 border border-[#F0EAF4]">{n}</li>
                ))}
              </ul>
            )}
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Add note..."
              rows={3}
              className="w-full rounded-lg border border-[#E7E1E1] bg-white px-3 py-2 text-xs text-gray-700 placeholder:text-gray-300 outline-none resize-none focus:border-[#6b1176] transition-colors"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => { if (noteDraft.trim()) { setNotes(n => [...n, noteDraft.trim()]); setNoteDraft(''); } }}
                className="px-4 py-2 rounded-lg bg-[#3b0764] text-white text-xs font-semibold hover:bg-[#6b1176] transition-colors"
              >
                Add Note
              </button>
            </div>
          </div>
        </aside>
      </div>
    </PageLayout>
  );
}
