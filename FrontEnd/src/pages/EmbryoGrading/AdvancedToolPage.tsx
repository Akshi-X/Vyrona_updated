import React, { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import EmbryosIcon from '../../assets/DashBoardIcons/Embryos.svg';
import type { IVFTreatment } from '../../types/ivf';

interface EmbryologyLogEntry {
  id: number;
  oocyteNo: string;
  day0Dish: string;
  pn: string;
  dropNo: string;
  day3Label?: string;
  day5Label?: string;
  day6Label?: string;
  fate: string;
  fzNo: string;
  notes: string;
}

interface AdvancedEmbryoRouteState {
  embryo?: IVFTreatment;
  logs?: EmbryologyLogEntry[];
}

interface BoundingBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linkedOocyteId?: number;
}

interface BoxEditState {
  boxId: number;
  mode: 'move' | 'resize';
  startPoint: { x: number; y: number };
  originalBox: BoundingBox;
}

interface EmbryoImageOption {
  id: string;
  name: string;
  src: string;
  isUploaded?: boolean;
}

interface GardnerGrade {
  grade: string;
  expansion: string;
  icm: string;
  te: string;
  confidence: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const parseGardnerGrade = (rawGrade?: string | null, confidence = 0): GardnerGrade | null => {
  if (!rawGrade) return null;
  const match = rawGrade.trim().toUpperCase().match(/([1-6])\s*([A-C])\s*([A-C])/);
  if (!match) return null;

  const expansion = match[1];
  const icm = match[2];
  const te = match[3];

  return {
    grade: `${expansion}${icm}${te}`,
    expansion,
    icm,
    te,
    confidence,
  };
};

const pickAiGrade = (candidates: string[]): string => {
  const valid = candidates
    .map((grade) => parseGardnerGrade(grade, 0)?.grade)
    .filter((grade): grade is string => Boolean(grade));

  if (valid.length > 0) {
    return valid[0];
  }

  const fallback = ['4AA', '4AB', '4BA', '3AA', '3AB', '5AA'];
  return fallback[Math.floor(Math.random() * fallback.length)];
};

const createEmbryoPlaceholder = (title: string, palette: { bg1: string; bg2: string; ring: string; core: string }) => {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs>
      <radialGradient id="bg" cx="45%" cy="40%" r="80%">
        <stop offset="0%" stop-color="${palette.bg1}" />
        <stop offset="70%" stop-color="${palette.bg2}" />
      </radialGradient>
      <radialGradient id="core" cx="55%" cy="55%" r="65%">
        <stop offset="0%" stop-color="#cce8f7" />
        <stop offset="100%" stop-color="${palette.core}" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <circle cx="340" cy="300" r="215" fill="none" stroke="${palette.ring}" stroke-width="28" opacity="0.9"/>
    <circle cx="470" cy="305" r="128" fill="url(#core)" stroke="#6f8ca1" stroke-width="3"/>
    <text x="26" y="46" fill="#ffffff" font-size="22" font-family="Arial" opacity="0.9">${title}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const defaultImageOptions: EmbryoImageOption[] = [
  {
    id: 'img-a',
    name: 'Embryo Sample 01',
    src: '/embryo/embryo_01.jpg',
  },
  {
    id: 'img-b',
    name: 'Embryo B',
    src: createEmbryoPlaceholder('Embryo B', { bg1: '#e2f1fa', bg2: '#5f88a5', ring: '#f4f8ff', core: '#5e8ca6' }),
  },
  {
    id: 'img-c',
    name: 'Embryo C',
    src: createEmbryoPlaceholder('Embryo C', { bg1: '#d7eaf6', bg2: '#5d83a0', ring: '#f1f6ff', core: '#688ea5' }),
  },
];

export default function AdvancedEmbryoGradingPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const state = (location.state as AdvancedEmbryoRouteState) || {};
  const selectedEmbryo = state.embryo;
  const selectedEmbryologyLogs = useMemo(() => state.logs || [], [state.logs]);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [draftBox, setDraftBox] = useState<BoundingBox | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [boxEditState, setBoxEditState] = useState<BoxEditState | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isAiGrading, setIsAiGrading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [uploadedImageOption, setUploadedImageOption] = useState<EmbryoImageOption | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string>(defaultImageOptions[0].id);
  const [aiGrade, setAiGrade] = useState<GardnerGrade | null>(() => {
    const primaryEmbryoGrade = selectedEmbryo?.embryoGrading?.split(',')[0]?.trim();
    return parseGardnerGrade(primaryEmbryoGrade, 0);
  });
  const [manualGrade, setManualGrade] = useState<GardnerGrade | null>(null);
  const [showManualOverrideEditor, setShowManualOverrideEditor] = useState(false);
  const [overrideExpansion, setOverrideExpansion] = useState('4');
  const [overrideIcm, setOverrideIcm] = useState('A');
  const [overrideTe, setOverrideTe] = useState('A');

  const availableImageOptions = useMemo(
    () => (uploadedImageOption ? [...defaultImageOptions, uploadedImageOption] : defaultImageOptions),
    [uploadedImageOption],
  );

  const selectedImage = useMemo(
    () => availableImageOptions.find((option) => option.id === selectedImageId) || availableImageOptions[0],
    [availableImageOptions, selectedImageId],
  );

  const pastGrades = useMemo(() => {
    const labels = selectedEmbryologyLogs
      .flatMap((row) => [row.day5Label, row.day6Label])
      .filter((value): value is string => Boolean(value && value !== '—'));

    return Array.from(new Set(labels));
  }, [selectedEmbryologyLogs]);

  const getRelativePercent = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!viewerRef.current) return null;
    const rect = viewerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const adjustedX = (localX - panOffset.x) / zoomLevel;
    const adjustedY = (localY - panOffset.y) / zoomLevel;

    const x = clamp((adjustedX / rect.width) * 100, 0, 100);
    const y = clamp((adjustedY / rect.height) * 100, 0, 100);
    return { x, y };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    if (zoomLevel > 1) {
      setPanStart({
        x: event.clientX - panOffset.x,
        y: event.clientY - panOffset.y,
      });
      return;
    }

    const point = getRelativePercent(event);
    if (!point) return;

    setDragStart(point);
    setDraftBox({
      id: Date.now(),
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (boxEditState) {
      const point = getRelativePercent(event);
      if (!point) return;

      const deltaX = point.x - boxEditState.startPoint.x;
      const deltaY = point.y - boxEditState.startPoint.y;

      setBoxes((previous) => previous.map((box) => {
        if (box.id !== boxEditState.boxId) return box;

        if (boxEditState.mode === 'move') {
          const nextX = clamp(boxEditState.originalBox.x + deltaX, 0, 100 - boxEditState.originalBox.width);
          const nextY = clamp(boxEditState.originalBox.y + deltaY, 0, 100 - boxEditState.originalBox.height);
          return { ...box, x: nextX, y: nextY };
        }

        const nextWidth = clamp(boxEditState.originalBox.width + deltaX, 2, 100 - boxEditState.originalBox.x);
        const nextHeight = clamp(boxEditState.originalBox.height + deltaY, 2, 100 - boxEditState.originalBox.y);
        return { ...box, width: nextWidth, height: nextHeight };
      }));
      return;
    }

    if (panStart && zoomLevel > 1) {
      setPanOffset({
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y,
      });
      return;
    }

    if (!dragStart) return;
    const point = getRelativePercent(event);
    if (!point) return;

    const x = Math.min(dragStart.x, point.x);
    const y = Math.min(dragStart.y, point.y);
    const width = Math.abs(point.x - dragStart.x);
    const height = Math.abs(point.y - dragStart.y);

    setDraftBox((previous) => previous ? { ...previous, x, y, width, height } : null);
  };

  const handleMouseUp = () => {
    if (boxEditState) {
      setBoxEditState(null);
      return;
    }

    if (panStart) {
      setPanStart(null);
      return;
    }

    if (draftBox && draftBox.width > 2 && draftBox.height > 2) {
      setBoxes((previous) => [...previous, draftBox]);
      setSelectedBoxId(draftBox.id);
    }

    setDraftBox(null);
    setDragStart(null);
  };

  const handleDeleteBox = (boxId: number) => {
    setBoxes((previous) => previous.filter((box) => box.id !== boxId));
    setSelectedBoxId((previous) => (previous === boxId ? null : previous));
    setBoxEditState((previous) => (previous?.boxId === boxId ? null : previous));
  };

  const handleBoxMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
    box: BoundingBox,
    mode: 'move' | 'resize',
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const point = getRelativePercent(event as React.MouseEvent<HTMLDivElement>);
    if (!point) return;

    setSelectedBoxId(box.id);
    setBoxEditState({
      boxId: box.id,
      mode,
      startPoint: point,
      originalBox: { ...box },
    });
  };

  const handleViewerContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = getRelativePercent(event);
    if (!point) return;

    const reversed = [...boxes].reverse();
    const boxToDelete = reversed.find((box) => (
      point.x >= box.x
      && point.x <= box.x + box.width
      && point.y >= box.y
      && point.y <= box.y + box.height
    ));

    if (boxToDelete) {
      handleDeleteBox(boxToDelete.id);
    }
  };

  const handleAssignOocyte = (rowId: number) => {
    if (!selectedBoxId) return;

    setBoxes((previous) => previous.map((box) => {
      if (box.id !== selectedBoxId) return box;
      return { ...box, linkedOocyteId: rowId };
    }));
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const imageId = `upload-${Date.now()}`;
    setUploadedImageOption((previous) => {
      if (previous?.isUploaded) {
        URL.revokeObjectURL(previous.src);
      }
      return {
        id: imageId,
        name: file.name,
        src: objectUrl,
        isUploaded: true,
      };
    });
    setSelectedImageId(imageId);
    event.target.value = '';
  };

  const handleReset = () => {
    setBoxes([]);
    setDraftBox(null);
    setDragStart(null);
    setSelectedBoxId(null);
    setBoxEditState(null);
    setPanStart(null);
    setPanOffset({ x: 0, y: 0 });
    setZoomLevel(1);
  };

  const openManualOverrideEditor = () => {
    const source = manualGrade || aiGrade;
    setOverrideExpansion(source?.expansion || '4');
    setOverrideIcm(source?.icm || 'A');
    setOverrideTe(source?.te || 'A');
    setShowManualOverrideEditor(true);
  };

  const applyManualOverride = () => {
    const parsed = parseGardnerGrade(`${overrideExpansion}${overrideIcm}${overrideTe}`, 100);
    if (parsed) {
      setManualGrade(parsed);
      setShowManualOverrideEditor(false);
    }
  };

  const handleZoomChange = (nextZoom: number) => {
    const normalized = clamp(nextZoom, 1, 3);
    setZoomLevel(normalized);
    if (normalized === 1) {
      setPanOffset({ x: 0, y: 0 });
      setPanStart(null);
    }
  };

  const handleAiGrading = () => {
    setIsAiGrading(true);
    const gradeCandidates = [
      ...pastGrades,
      ...selectedEmbryologyLogs.flatMap((row) => [row.day5Label || '', row.day6Label || '']),
      selectedEmbryo?.embryoGrading || '',
    ];

    window.setTimeout(() => {
      const aiGradeValue = pickAiGrade(gradeCandidates);
      const confidence = Number((86 + Math.random() * 12).toFixed(1));
      const parsed = parseGardnerGrade(aiGradeValue, confidence);
      if (parsed) {
        setAiGrade(parsed);
      }
      setIsAiGrading(false);
    }, 1200);
  };

  const oocyteLinkedMap = useMemo(() => {
    const map = new Map<number, number[]>();
    boxes.forEach((box, index) => {
      if (!box.linkedOocyteId) return;
      const existing = map.get(box.linkedOocyteId) || [];
      map.set(box.linkedOocyteId, [...existing, index + 1]);
    });
    return map;
  }, [boxes]);

  const oocyteNoById = useMemo(() => {
    const map = new Map<number, string>();
    selectedEmbryologyLogs.forEach((row) => {
      map.set(row.id, row.oocyteNo || '—');
    });
    return map;
  }, [selectedEmbryologyLogs]);

  return (
    <PageLayout
      title="Advanced Embryo Grading"
      icon={EmbryosIcon}
      actions={
        <button
          type="button"
          onClick={() => navigate(his ? `/embryo-grading/${his}` : '/embryo-grading')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#E7E1E1] bg-white text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          Back to Log Sheet
        </button>
      }
    >
      <div className="h-full min-h-0 rounded-xl border border-[#E7E1E1] bg-[#FCF9FF] p-3 md:p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 h-full min-h-0 xl:grid-cols-[330px_minmax(0,1fr)_360px]">
          <aside className="h-full min-h-0 rounded-lg border border-[#E7E1E1] bg-white p-3 flex flex-col gap-3 text-gray-900 overflow-y-auto">
            <div className="text-xs text-gray-500">Treatment page</div>

            <div className="rounded-md border border-[#E7E1E1] bg-[#FCF9FF] px-3 py-2">
              <p className="text-sm font-semibold tracking-wide">{selectedEmbryo?.hisNumber || his || '—'} | TID {selectedEmbryo?.cryolockNum || '—'}</p>
              <p className="text-xs text-gray-500 mt-1">Event | tEB</p>
            </div>

            <div className="rounded-md border border-[#E7E1E1] bg-white p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-900">Gardner's Grade</p>
                <span className="text-[11px] text-gray-500">{manualGrade ? 'Manual override active' : 'AI/Manual grading'}</span>
              </div>

              {!(aiGrade || manualGrade) ? (
                <div className="rounded-md border border-dashed border-[#D8C7E3] bg-[#FCF9FF] px-3 py-3 text-xs text-[#6b1176]">
                  Yet to be graded
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-[#E7E1E1] bg-[#FCF9FF] p-2">
                      <p className="text-[10px] text-gray-500 uppercase">Expansion</p>
                      <p className="text-xl font-semibold text-[#6b1176] mt-1">{(manualGrade || aiGrade)?.expansion || '—'}</p>
                    </div>
                    <div className="rounded-md border border-[#E7E1E1] bg-[#FCF9FF] p-2">
                      <p className="text-[10px] text-gray-500 uppercase">ICM</p>
                      <p className="text-xl font-semibold text-[#6b1176] mt-1">{(manualGrade || aiGrade)?.icm || '—'}</p>
                    </div>
                    <div className="rounded-md border border-[#E7E1E1] bg-[#FCF9FF] p-2">
                      <p className="text-[10px] text-gray-500 uppercase">TE</p>
                      <p className="text-xl font-semibold text-[#6b1176] mt-1">{(manualGrade || aiGrade)?.te || '—'}</p>
                    </div>
                  </div>

                  <div className="rounded-md border border-[#E7E1E1] bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-500">Confidence Score</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{(manualGrade || aiGrade)?.confidence ? `${(manualGrade || aiGrade)?.confidence}%` : '—'}</p>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-gray-600">Manual Override</p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={openManualOverrideEditor}
                    className="px-2.5 py-1 rounded border border-[#E7E1E1] text-[11px] text-[#6b1176] hover:bg-[#F7ECFF]"
                  >
                    Override Grade
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualGrade(null)}
                    className="px-2 py-1 rounded border border-[#E7E1E1] text-[11px] text-gray-600 hover:bg-gray-50"
                  >
                    Clear Override
                  </button>
                </div>

                {showManualOverrideEditor && (
                  <div className="rounded-md border border-[#E7E1E1] bg-[#FCF9FF] p-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[10px] text-gray-600 flex flex-col gap-1">
                        Expansion
                        <select
                          value={overrideExpansion}
                          onChange={(event) => setOverrideExpansion(event.target.value)}
                          className="rounded border border-[#E7E1E1] bg-white px-2 py-1 text-[11px]"
                        >
                          {['1', '2', '3', '4', '5', '6'].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] text-gray-600 flex flex-col gap-1">
                        ICM
                        <select
                          value={overrideIcm}
                          onChange={(event) => setOverrideIcm(event.target.value)}
                          className="rounded border border-[#E7E1E1] bg-white px-2 py-1 text-[11px]"
                        >
                          {['A', 'B', 'C'].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] text-gray-600 flex flex-col gap-1">
                        TE
                        <select
                          value={overrideTe}
                          onChange={(event) => setOverrideTe(event.target.value)}
                          className="rounded border border-[#E7E1E1] bg-white px-2 py-1 text-[11px]"
                        >
                          {['A', 'B', 'C'].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowManualOverrideEditor(false)}
                        className="px-2 py-1 rounded border border-[#E7E1E1] text-[11px] text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyManualOverride}
                        className="px-2.5 py-1 rounded bg-[#6b1176] text-white text-[11px] hover:bg-[#5a0f62]"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(aiGrade || manualGrade) && (
                <div className="rounded-md border border-[#E7E1E1] bg-white px-3 py-2 text-[11px] text-gray-600 space-y-1">
                  <p>AI Grade: <span className="font-semibold text-[#6b1176]">{aiGrade?.grade || 'Yet to be graded'}</span></p>
                  <p>Manual Grade: <span className="font-semibold text-[#6b1176]">{manualGrade?.grade || 'Not overridden'}</span></p>
                </div>
              )}
            </div>

            <div className="rounded-md border border-[#E7E1E1] bg-white p-3 mt-auto min-h-24">
              <p className="text-xs font-semibold text-gray-900">AI Insights</p>
              <p className="text-xs text-gray-500 mt-2">Insights about this embryo will appear here as it progresses.</p>
            </div>

            <div className="rounded-md border border-[#E7E1E1] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-900">Embryo Images</p>
                <label className="inline-flex items-center px-2.5 py-1.5 rounded border border-[#E7E1E1] text-xs text-[#6b1176] hover:bg-[#F7ECFF] cursor-pointer">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Select image first, then draw boxes in center viewer.</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {availableImageOptions.map((imageOption) => {
                  const isSelected = selectedImageId === imageOption.id;

                  return (
                    <button
                      key={imageOption.id}
                      type="button"
                      onClick={() => setSelectedImageId(imageOption.id)}
                      className={`rounded-md border overflow-hidden text-left ${isSelected ? 'border-[#6b1176] ring-1 ring-[#6b1176]' : 'border-[#E7E1E1] hover:border-[#c8b2d1]'}`}
                    >
                      <img src={imageOption.src} alt={imageOption.name} className="h-16 w-full object-cover" />
                      <div className="px-2 py-1 text-[10px] text-gray-600 truncate" title={imageOption.name}>{imageOption.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {!selectedEmbryo && (
              <div className="rounded-md border border-[#f1d7a3] bg-[#fff8e8] px-3 py-2 text-xs text-[#926019]">
                Opened without selected embryo context. Some details are placeholders.
              </div>
            )}
          </aside>

          <section className="h-full min-h-[560px] rounded-lg border border-[#E7E1E1] bg-white overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-[#E7E1E1] flex items-center justify-between gap-2 text-gray-600 text-xs bg-[#FCF9FF]">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded border border-[#E7E1E1] bg-white">EID 1</span>
                <span className="px-2 py-1 rounded border border-[#E7E1E1] bg-white">17.57 H</span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded border border-[#E7E1E1] px-2 py-1 hover:bg-[#F7ECFF] text-[#6b1176]"
              >
                <Trash2 size={13} />
                Clear Boxes
              </button>
            </div>

            <div className="flex-1 min-h-0 p-3">
              <div className="relative h-full min-h-[430px] rounded-md border border-[#E7E1E1] bg-[#f8fbff] overflow-hidden flex isolate">
                <div className="w-11 shrink-0 border-r border-[#E7E1E1] bg-[#F7ECFF] flex flex-col items-center py-2 text-[10px] text-[#6b1176] relative z-20">
                  <span className="mb-2">Zoom</span>
                  <button
                    type="button"
                    onClick={() => handleZoomChange(zoomLevel + 0.25)}
                    className="h-5 w-5 rounded border border-[#D8C7E3] bg-white text-[11px]"
                  >
                    +
                  </button>
                  <span className="my-1 text-[10px] font-semibold">{Math.round(zoomLevel * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => handleZoomChange(zoomLevel - 0.25)}
                    className="h-5 w-5 rounded border border-[#D8C7E3] bg-white text-[11px]"
                  >
                    -
                  </button>
                  <div className="mt-2 h-24 w-full flex items-center justify-center">
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.25}
                      value={zoomLevel}
                      onChange={(event) => handleZoomChange(Number(event.target.value))}
                      className="w-20 -rotate-90 accent-[#6b1176]"
                    />
                  </div>
                </div>

                <div
                  ref={viewerRef}
                  className={`relative flex-1 overflow-hidden z-0 ${zoomLevel > 1 ? 'cursor-grab' : 'cursor-crosshair'} ${panStart ? 'cursor-grabbing' : ''}`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onContextMenu={handleViewerContextMenu}
                >
                  <div
                    className="absolute inset-0 z-0"
                    style={{
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <img src={selectedImage.src} alt={selectedImage.name} className="absolute inset-0 h-full w-full object-cover" />

                    {boxes.map((box, index) => (
                      <div
                        key={box.id}
                        className={`absolute border-2 ${box.id === selectedBoxId ? 'border-[#6b1176] bg-[#6b1176]/30' : 'border-[#8E63FF] bg-[#8E63FF]/20'}`}
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                        onMouseDown={(event) => handleBoxMouseDown(event, box, 'move')}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedBoxId(box.id);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDeleteBox(box.id);
                        }}
                      >
                        <span className="absolute -top-6 left-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#8E63FF] text-white">
                          Embryo {index + 1}{box.linkedOocyteId ? ` → Oocyte ${oocyteNoById.get(box.linkedOocyteId) || box.linkedOocyteId}` : ''}
                        </span>
                        <button
                          type="button"
                          onMouseDown={(event) => handleBoxMouseDown(event as unknown as React.MouseEvent<HTMLDivElement>, box, 'resize')}
                          className="absolute -bottom-1 -right-1 h-3 w-3 rounded-sm border border-white bg-[#6b1176]"
                          title="Resize box"
                        />
                      </div>
                    ))}

                    {draftBox && (
                      <div
                        className="absolute border-2 border-dashed border-[#8E63FF] bg-[#8E63FF]/20"
                        style={{
                          left: `${draftBox.x}%`,
                          top: `${draftBox.y}%`,
                          width: `${draftBox.width}%`,
                          height: `${draftBox.height}%`,
                        }}
                      />
                    )}
                  </div>

                  {isAiGrading && (
                    <div className="absolute inset-0 z-20 bg-white/75 backdrop-blur-[1px] flex items-center justify-center">
                      <div className="rounded-md border border-[#E7E1E1] bg-white px-4 py-3 text-center">
                        <div className="h-5 w-5 border-2 border-[#D8C7E3] border-t-[#6b1176] rounded-full animate-spin mx-auto" />
                        <p className="text-xs text-gray-700 mt-2">AI grading in progress...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 border-t border-[#E7E1E1] flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 bg-[#FCF9FF]">
              <div className="flex items-center gap-2">
                <button type="button" className="px-2.5 py-1.5 rounded border border-[#E7E1E1] bg-white hover:bg-[#F7ECFF]">Download Image</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAiGrading}
                  disabled={isAiGrading}
                  className="px-3 py-1.5 rounded bg-[#6b1176] text-white font-medium hover:bg-[#5a0f62] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  Grade with AI
                </button>
              </div>
            </div>
          </section>

          <section className="h-full min-h-[560px] rounded-lg border border-[#E7E1E1] bg-white overflow-hidden flex flex-col text-gray-900">
            <div className="px-3 py-2 border-b border-[#E7E1E1] text-xs flex items-center gap-2 bg-[#FCF9FF]">
              <span className="px-2 py-1 rounded border border-[#E7E1E1] bg-[#F7ECFF] text-[#6b1176]">Embryology Log Sheet</span>
              <span className="px-2 py-1 rounded border border-[#E7E1E1] text-gray-500">Live Data</span>
            </div>

            <div className="px-3 py-2 border-b border-[#E7E1E1] flex items-center gap-2 text-xs bg-white">
              <span className="px-2 py-1 rounded-md bg-[#F7ECFF] border border-[#EAD4F8] text-[#6b1176]">Rows: {selectedEmbryologyLogs.length}</span>
              <span className="px-2 py-1 rounded-md border border-[#E7E1E1] text-gray-500">Patient: {selectedEmbryo?.hisNumber || his || '—'}</span>
              <span className="px-2 py-1 rounded-md border border-[#E7E1E1] text-gray-500">Selected Box: {selectedBoxId ? `Embryo ${boxes.findIndex((box) => box.id === selectedBoxId) + 1}` : 'None'}</span>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-[920px] w-full text-xs">
                <thead className="text-gray-500 bg-[#FCF9FF] sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">S.No</th>
                    <th className="px-2 py-2 text-left font-medium">Oocyte No</th>
                    <th className="px-2 py-2 text-left font-medium">Day 0 Dish</th>
                    <th className="px-2 py-2 text-left font-medium">PN</th>
                    <th className="px-2 py-2 text-left font-medium">Drop No</th>
                    <th className="px-2 py-2 text-left font-medium">Day 3</th>
                    <th className="px-2 py-2 text-left font-medium">Day 5</th>
                    <th className="px-2 py-2 text-left font-medium">Day 6</th>
                    <th className="px-2 py-2 text-left font-medium">Fate</th>
                    <th className="px-2 py-2 text-left font-medium">FZ No</th>
                    <th className="px-2 py-2 text-left font-medium">Mapped Box</th>
                    <th className="px-2 py-2 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEmbryologyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-8 text-center text-gray-500">
                        No log rows available. Open this page from an embryo detail log sheet.
                      </td>
                    </tr>
                  ) : (
                    selectedEmbryologyLogs.map((row, index) => (
                      <tr
                        key={row.id || index}
                        onClick={() => handleAssignOocyte(row.id)}
                        className={`border-t border-[#F1F1F1] hover:bg-[#FCF9FF] ${selectedBoxId ? 'cursor-pointer' : ''}`}
                      >
                        <td className="px-2 py-2">{index + 1}</td>
                        <td className="px-2 py-2">{row.oocyteNo || '—'}</td>
                        <td className="px-2 py-2">{row.day0Dish || '—'}</td>
                        <td className="px-2 py-2">{row.pn || '—'}</td>
                        <td className="px-2 py-2">{row.dropNo || '—'}</td>
                        <td className="px-2 py-2">{row.day3Label || '—'}</td>
                        <td className="px-2 py-2 font-semibold text-[#6b1176]">{row.day5Label || '—'}</td>
                        <td className="px-2 py-2 font-semibold text-[#6b1176]">{row.day6Label || '—'}</td>
                        <td className="px-2 py-2">{row.fate || '—'}</td>
                        <td className="px-2 py-2">{row.fzNo || '—'}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(oocyteLinkedMap.get(row.id) || []).length > 0 ? (
                              (oocyteLinkedMap.get(row.id) || []).map((embryoNo) => (
                                <span key={`${row.id}-${embryoNo}`} className="px-1.5 py-0.5 rounded bg-[#F7ECFF] text-[#6b1176] text-[10px] font-medium">
                                  E{embryoNo}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-400 text-[10px]">Unmapped</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 max-w-[180px] truncate" title={row.notes || '—'}>{row.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-auto border-t border-[#E7E1E1] bg-white px-3 py-2">
              <p className="text-[11px] text-[#6b1176] mb-2">
                Past grades: {pastGrades.length > 0 ? pastGrades.join(', ') : 'No grade labels available'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Add note..."
                  className="w-full rounded-full border border-[#E7E1E1] bg-white px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setNoteDraft('')}
                  className="rounded-full px-3 py-1.5 text-xs bg-[#6b1176] text-white font-semibold hover:bg-[#5a0f62]"
                >
                  Add
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
