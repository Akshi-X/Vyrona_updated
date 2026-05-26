import React, { useState, useRef, useEffect } from 'react';
import { X, Trophy, GitCompare, Star, Search, Info, ChevronDown, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BlastocystMorphology } from '../../types/embryo';

interface LeaderboardEmbryo {
  id: string;
  oocyteNo: number;
  time: string;
  aiScore: number;
  grade: string;
  quality: string;
  rank: number;
  src: string;
  images: { url: string; grade: string; score: number; morphology: BlastocystMorphology }[];
  morphology: BlastocystMorphology;
}

const LEADERBOARD_EMBRYOS: LeaderboardEmbryo[] = [
  {
    id: 'EID 1.2', oocyteNo: 2, time: '17.57 h', aiScore: 9.2, grade: '5AA', quality: 'High Quality', rank: 1,
    src: '/embryo/list/emb2.png',
    images: [
      { url: '/embryo/list/emb2.png', grade: '5AA', score: 9.2, morphology: { expansion: 5, icm: 'A', te: 'A', hatching: 'Not Hatching', vacuolization: 'None', multinucleation: 'None', fragmentation: '< 5%', symmetry: 'Excellent', zonaPellucida: 'Intact', blastocoelQuality: 'Excellent', cytoplasmicGranularity: 'Fine', bridge: 'None' } },
      { url: '/embryo/list/em1.png',  grade: '5AB', score: 8.4, morphology: { expansion: 5, icm: 'A', te: 'B', hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None', fragmentation: '5 - 10%', symmetry: 'Good', zonaPellucida: 'Intact', blastocoelQuality: 'Good', cytoplasmicGranularity: 'Fine', bridge: 'None' } },
    ],
    morphology: {
      expansion: 5, icm: 'A', te: 'A',
      hatching: 'Not Hatching', vacuolization: 'None', multinucleation: 'None',
      fragmentation: '< 5%', symmetry: 'Excellent',
      zonaPellucida: 'Intact', blastocoelQuality: 'Excellent', cytoplasmicGranularity: 'Fine', bridge: 'None',
    },
  },
  {
    id: 'EID 1.1', oocyteNo: 1, time: '17.32 h', aiScore: 8.7, grade: '4AA', quality: 'High Quality', rank: 2,
    src: '/embryo/list/em1.png',
    images: [
      { url: '/embryo/list/em1.png',  grade: '4AA', score: 8.7, morphology: { expansion: 4, icm: 'A', te: 'A', hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None', fragmentation: '5 - 10%', symmetry: 'Excellent', zonaPellucida: 'Intact', blastocoelQuality: 'Excellent', cytoplasmicGranularity: 'Fine', bridge: 'None' } },
      { url: '/embryo/list/emb2.png', grade: '4AA', score: 8.1, morphology: { expansion: 4, icm: 'A', te: 'A', hatching: 'Not Hatching', vacuolization: 'None', multinucleation: 'None', fragmentation: '< 5%', symmetry: 'Good', zonaPellucida: 'Intact', blastocoelQuality: 'Good', cytoplasmicGranularity: 'Fine', bridge: 'None' } },
      { url: '/embryo/list/emb3.png', grade: '4AB', score: 7.5, morphology: { expansion: 4, icm: 'A', te: 'B', hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None', fragmentation: '10 - 15%', symmetry: 'Good', zonaPellucida: 'Good', blastocoelQuality: 'Good', cytoplasmicGranularity: 'Coarse', bridge: 'Minimal' } },
    ],
    morphology: {
      expansion: 4, icm: 'A', te: 'A',
      hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None',
      fragmentation: '5 - 10%', symmetry: 'Excellent',
      zonaPellucida: 'Intact', blastocoelQuality: 'Excellent', cytoplasmicGranularity: 'Fine', bridge: 'None',
    },
  },
  {
    id: 'EID 1.3', oocyteNo: 3, time: '18.41 h', aiScore: 7.9, grade: '4AB', quality: 'Good Quality', rank: 3,
    src: '/embryo/list/emb3.png',
    images: [
      { url: '/embryo/list/emb3.png', grade: '4AB', score: 7.9, morphology: { expansion: 4, icm: 'A', te: 'B', hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None', fragmentation: '10 - 15%', symmetry: 'Good', zonaPellucida: 'Good', blastocoelQuality: 'Good', cytoplasmicGranularity: 'Fine', bridge: 'Minimal' } },
    ],
    morphology: {
      expansion: 4, icm: 'A', te: 'B',
      hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None',
      fragmentation: '10 - 15%', symmetry: 'Good',
      zonaPellucida: 'Good', blastocoelQuality: 'Good', cytoplasmicGranularity: 'Fine', bridge: 'Minimal',
    },
  },
  {
    id: 'EID 1.4', oocyteNo: 4, time: '17.20 h', aiScore: 6.5, grade: '3BB', quality: 'Medium Quality', rank: 4,
    src: '/embryo/list/em4.png',
    images: [
      { url: '/embryo/list/em4.png',  grade: '3BB', score: 6.5, morphology: { expansion: 3, icm: 'B', te: 'B', hatching: 'Not Hatching', vacuolization: 'Mild', multinucleation: 'Minimal', fragmentation: '15 - 20%', symmetry: 'Fair', zonaPellucida: 'Intact', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present' } },
      { url: '/embryo/list/emb5.png', grade: '3BC', score: 5.8, morphology: { expansion: 3, icm: 'B', te: 'C', hatching: 'Not Hatching', vacuolization: 'Moderate', multinucleation: 'Present', fragmentation: '20 - 25%', symmetry: 'Fair', zonaPellucida: 'Thinning', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present' } },
    ],
    morphology: {
      expansion: 3, icm: 'B', te: 'B',
      hatching: 'Not Hatching', vacuolization: 'Mild', multinucleation: 'Minimal',
      fragmentation: '15 - 20%', symmetry: 'Fair',
      zonaPellucida: 'Intact', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present',
    },
  },
  {
    id: 'EID 1.5', oocyteNo: 5, time: '16.50 h', aiScore: 5.3, grade: '3BC', quality: 'Low Quality', rank: 5,
    src: '/embryo/list/emb5.png',
    images: [
      { url: '/embryo/list/emb5.png', grade: '3BC', score: 5.3, morphology: { expansion: 3, icm: 'B', te: 'C', hatching: 'Not Hatching', vacuolization: 'Moderate', multinucleation: 'Present', fragmentation: '20 - 25%', symmetry: 'Fair', zonaPellucida: 'Thinning', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present' } },
    ],
    morphology: {
      expansion: 3, icm: 'B', te: 'C',
      hatching: 'Not Hatching', vacuolization: 'Moderate', multinucleation: 'Present',
      fragmentation: '20 - 25%', symmetry: 'Fair',
      zonaPellucida: 'Thinning', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present',
    },
  },
  {
    id: 'EID 1.6', oocyteNo: 6, time: '17.10 h', aiScore: 4.1, grade: '2BC', quality: 'Low Quality', rank: 6,
    src: '/embryo/list/emb6.png',
    images: [
      { url: '/embryo/list/emb6.png', grade: '2BC', score: 4.1, morphology: { expansion: 2, icm: 'B', te: 'C', hatching: 'Not Hatching', vacuolization: 'Moderate', multinucleation: 'Present', fragmentation: '25 - 30%', symmetry: 'Poor', zonaPellucida: 'Thinning', blastocoelQuality: 'Poor', cytoplasmicGranularity: 'Coarse', bridge: 'Present' } },
    ],
    morphology: {
      expansion: 2, icm: 'B', te: 'C',
      hatching: 'Not Hatching', vacuolization: 'Moderate', multinucleation: 'Present',
      fragmentation: '25 - 30%', symmetry: 'Poor',
      zonaPellucida: 'Thinning', blastocoelQuality: 'Poor', cytoplasmicGranularity: 'Coarse', bridge: 'Present',
    },
  },
];

const SLOT_COLORS = [
  { hex: '#4f46e5' },
  { hex: '#6b1176' },
  { hex: '#a21caf' },
  { hex: '#7c3aed' },
];

const eidToLabel = (id: string) => {
  const m = id.match(/\d+\.(\d+)$/);
  return m ? `Oocyte #${m[1]}` : id;
};

function gradeCls(grade: string) {
  if (!grade || grade.length < 2) return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' };
  const icmTe = grade.slice(1);
  if (icmTe === 'AA') return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (icmTe === 'AB' || icmTe === 'BA') return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  if (icmTe === 'BB') return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  return { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' };
}

function scoreBarGradient(score: number): string {
  if (score >= 8) return 'linear-gradient(90deg,#34d399,#059669)';
  if (score >= 6) return 'linear-gradient(90deg,#fb923c,#ea580c)';
  return 'linear-gradient(90deg,#fb7185,#e11d48)';
}

function scorePillStyle(score: number): React.CSSProperties {
  if (score >= 8) return { background: '#dcfce7', color: '#166534' };
  if (score >= 6) return { background: '#ffedd5', color: '#9a3412' };
  return { background: '#ffe4e6', color: '#9f1239' };
}

function scoreTextCls(score: number): string {
  if (score >= 8) return 'text-emerald-700';
  if (score >= 6) return 'text-orange-600';
  return 'text-rose-600';
}

function criticalStyle(val: string): { borderColor: string; background: string; color: string } {
  const v = val.toLowerCase();
  if (v === 'none' || v === 'not hatching') return { borderColor: '#10b981', background: '#f0fdf4', color: '#065f46' };
  if (v === 'minimal')                      return { borderColor: '#eab308', background: '#fefce8', color: '#713f12' };
  if (v === 'mild' || v === 'hatching')     return { borderColor: '#f59e0b', background: '#fffbeb', color: '#92400e' };
  if (v === 'moderate' || v === 'present')  return { borderColor: '#f97316', background: '#fff7ed', color: '#9a3412' };
  if (v === 'severe' || v === 'hatched')    return { borderColor: '#f43f5e', background: '#fff1f2', color: '#9f1239' };
  return { borderColor: '#d1d5db', background: '#f9fafb', color: '#374151' };
}

function RankBadge({ rank }: { rank: number }) {
  const medal: Record<number, { outer: string; inner: string; glow: string }> = {
    1: { outer: '#F59E0B', inner: '#FDE68A', glow: 'rgba(245,158,11,0.2)' },
    2: { outer: '#9CA3AF', inner: '#E5E7EB', glow: 'rgba(156,163,175,0.2)' },
    3: { outer: '#CD7C2F', inner: '#FCD9A0', glow: 'rgba(205,124,47,0.2)' },
  };
  const c = medal[rank];
  if (c) {
    return (
      <svg width="26" height="26" viewBox="0 0 30 30" fill="none">
        <circle cx="15" cy="15" r="14" fill={c.glow} />
        <circle cx="15" cy="16" r="11" fill="rgba(0,0,0,0.1)" />
        <circle cx="15" cy="15" r="11" fill={c.outer} />
        <circle cx="15" cy="12" r="7" fill={c.inner} opacity="0.3" />
        <circle cx="15" cy="15" r="9" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.4" />
        <text x="15" y="19.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="system-ui,sans-serif">{rank}</text>
      </svg>
    );
  }
  const rankCls =
    rank === 4 ? 'bg-violet-100 text-violet-600' :
    rank === 5 ? 'bg-orange-100 text-orange-600' :
    'bg-gray-100 text-gray-500';
  return (
    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${rankCls}`}>{rank}</div>
  );
}

type CompareMode = 'embryos' | 'images';

export default function EmbryoComparePage() {
  const [selectedEmbryoIds, setSelectedEmbryoIds] = useState<string[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [compareMode, setCompareMode] = useState<CompareMode>('embryos');
  const [selectedOocyteId, setSelectedOocyteId] = useState<string>(LEADERBOARD_EMBRYOS[0]?.id ?? '');
  const [oocyteDropdownOpen, setOocyteDropdownOpen] = useState(false);
  const oocyteDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (oocyteDropdownRef.current && !oocyteDropdownRef.current.contains(e.target as Node)) {
        setOocyteDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setViewIndex(prev => Math.min(prev, Math.max(0, selectedEmbryoIds.length - 1)));
  }, [selectedEmbryoIds]);

  const toggleEmbryo = (id: string) => {
    setSelectedEmbryoIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

      {/* ── Leaderboard ── */}
      <div className="w-[290px] shrink-0 flex flex-col overflow-hidden bg-white border border-gray-200 rounded-2xl">

        <div className="shrink-0 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#f9f4ff 0%,#ffffff 100%)' }}>
          <div className="px-4 py-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary-bg flex items-center justify-center shrink-0">
              <Trophy size={14} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900">Leaderboard</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Ranked by AI Score</p>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary-bg border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
              {LEADERBOARD_EMBRYOS.length} embryos
            </span>
          </div>
          {/* Compare mode toggle */}
          <div className="px-3 pb-3 flex flex-col gap-2">
            <div className="flex p-0.5 rounded-lg gap-0.5" style={{ background: '#ede5f4' }}>
              {(['embryos', 'images'] as CompareMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setCompareMode(mode); setSelectedEmbryoIds([]); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                    compareMode === mode
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-[#6b1176]/50 hover:text-[#6b1176]/80'
                  }`}
                >
                  {mode === 'embryos' ? <GitCompare size={10} /> : <Star size={10} />}
                  {mode === 'embryos' ? 'Embryos' : 'Oocyte Images'}
                </button>
              ))}
            </div>

            {compareMode === 'images' && (() => {
              const oocyte = LEADERBOARD_EMBRYOS.find(e => e.id === selectedOocyteId);
              return (
                <>
                  {/* Custom oocyte dropdown */}
                  <div className="relative" ref={oocyteDropdownRef}>
                    {(() => {
                      const sel = LEADERBOARD_EMBRYOS.find(e => e.id === selectedOocyteId);
                      const gc = sel ? gradeCls(sel.grade) : null;
                      return (
                        <button
                          type="button"
                          onClick={() => setOocyteDropdownOpen(v => !v)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-left transition-all"
                          style={{ border: '1px solid #e8d5f0' }}
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#3b0764] truncate">
                              Oocyte #{sel?.oocyteNo ?? '—'}
                            </span>
                            {sel && gc && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${gc.bg} ${gc.border} ${gc.text}`}>
                                {sel.grade}
                              </span>
                            )}
                            {sel && (
                              <span className="text-[9px] text-gray-400 font-semibold ml-auto shrink-0">{sel.aiScore.toFixed(1)}</span>
                            )}
                          </div>
                          <ChevronDown size={10} className={`text-primary shrink-0 transition-transform ${oocyteDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      );
                    })()}

                    {oocyteDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-xl overflow-hidden shadow-lg"
                        style={{ border: '1px solid #e8d5f0', background: 'white' }}>
                        {LEADERBOARD_EMBRYOS.map(emb => {
                          const gc = gradeCls(emb.grade);
                          const isActive = emb.id === selectedOocyteId;
                          return (
                            <button
                              key={emb.id}
                              type="button"
                              onClick={() => { setSelectedOocyteId(emb.id); setOocyteDropdownOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-primary/[0.04]' : 'hover:bg-gray-50'}`}
                            >
                              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: isActive ? '#6b1176' : 'transparent', border: isActive ? 'none' : '1.5px solid #d1d5db' }}>
                                {isActive && <Check size={8} className="text-white" strokeWidth={3} />}
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 flex-1">Oocyte #{emb.oocyteNo}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${gc.bg} ${gc.border} ${gc.text}`}>{emb.grade}</span>
                              <span className="text-[9px] text-gray-400 font-semibold shrink-0">{emb.aiScore.toFixed(1)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </>
              );
            })()}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 p-2.5">
          {compareMode === 'images'
            ? (() => {
                const oocyte = LEADERBOARD_EMBRYOS.find(e => e.id === selectedOocyteId);
                const sorted = [...(oocyte?.images ?? [])].sort((a, b) => b.score - a.score);
                return sorted.map((img, idx) => {
                  const rank = idx + 1;
                  const gc = gradeCls(img.grade);
                  return (
                    <div key={idx} className="relative flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-xl transition-all"
                      style={{ border: '1px solid #EEE8F8', background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                      <div className="shrink-0 w-6 flex items-center justify-center">
                        <RankBadge rank={rank} />
                      </div>
                      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100 ring-1 ring-gray-100">
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-gray-700 block mb-1">Image #{rank}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md leading-none shrink-0" style={scorePillStyle(img.score)}>{img.score}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${img.score * 10}%`, background: scoreBarGradient(img.score) }} />
                          </div>
                        </div>
                      </div>
                      <div className={`shrink-0 rounded-lg px-2 py-1.5 border text-center min-w-[40px] ${gc.bg} ${gc.border}`}>
                        <div className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">Grade</div>
                        <div className={`text-sm font-black leading-none ${gc.text}`}>{img.grade}</div>
                      </div>
                    </div>
                  );
                });
              })()
            : LEADERBOARD_EMBRYOS.map(emb => {
            const isSelected = selectedEmbryoIds.includes(emb.id);
            const slotIdx = selectedEmbryoIds.indexOf(emb.id);
            const slot = slotIdx >= 0 ? SLOT_COLORS[slotIdx] : null;
            const gc = gradeCls(emb.grade);

            return (
              <div
                key={emb.id}
                className="relative flex items-center gap-2.5 pl-3 pr-8 py-2.5 rounded-xl cursor-pointer transition-all"
                style={{
                  border: isSelected && slot ? `1px solid ${slot.hex}45` : '1px solid #EEE8F8',
                  background: isSelected && slot ? `${slot.hex}0d` : 'white',
                  boxShadow: isSelected && slot ? `0 2px 10px ${slot.hex}1a` : '0 1px 2px rgba(0,0,0,0.03)',
                }}
                onClick={() => toggleEmbryo(emb.id)}
              >
                {isSelected && slot && (
                  <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: slot.hex }} />
                )}

                <div className="shrink-0 w-6 flex items-center justify-center">
                  <RankBadge rank={emb.rank} />
                </div>

                <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-gray-100 ring-1 ring-gray-100">
                  <img src={emb.src} alt="" className="w-full h-full object-cover" />
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-gray-900 block truncate mb-1.5">{eidToLabel(emb.id)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md leading-none shrink-0" style={scorePillStyle(emb.aiScore)}>{emb.aiScore}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${emb.aiScore * 10}%`, background: scoreBarGradient(emb.aiScore) }}
                      />
                    </div>
                  </div>
                </div>

                <div className={`shrink-0 rounded-lg px-2 py-1.5 border text-center min-w-[40px] ${gc.bg} ${gc.border}`}>
                  <div className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">Grade</div>
                  <div className={`text-sm font-black leading-none ${gc.text}`}>{emb.grade}</div>
                </div>

                <div
                  className="absolute top-1/2 -translate-y-1/2 right-2.5 w-[14px] h-[14px] rounded-full flex items-center justify-center transition-all"
                  style={isSelected && slot
                    ? { background: slot.hex, border: `1.5px solid ${slot.hex}` }
                    : { background: 'white', border: '1.5px solid #D1D5DB' }}
                >
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Compare panel ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden rounded-2xl p-4 border border-gray-200 bg-[#FAF8FF]">

        {/* Panel header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm">
              {compareMode === 'images' ? <Star size={14} className="text-primary" /> : <GitCompare size={14} className="text-primary" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {compareMode === 'images' ? 'Compare Oocyte Images' : 'Compare Embryos'}
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {compareMode === 'images'
                  ? `All images for Oocyte #${LEADERBOARD_EMBRYOS.find(e => e.id === selectedOocyteId)?.oocyteNo ?? '—'} ranked by AI score`
                  : 'Select up to 4 embryos to compare'}
              </p>
            </div>
          </div>
          {compareMode === 'embryos' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedEmbryoIds([])}
                disabled={selectedEmbryoIds.length === 0}
                className={`flex items-center gap-1 text-[11px] transition-colors ${selectedEmbryoIds.length > 0 ? 'text-gray-500 hover:text-rose-500 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
              >
                <X size={10} />
                Clear All
              </button>
              <span className="text-[11px] text-gray-400 font-medium">{selectedEmbryoIds.length} / 4 selected</span>
            </div>
          )}
        </div>

        {/* Images compare panel */}
        {compareMode === 'images' ? (() => {
          const oocyte = LEADERBOARD_EMBRYOS.find(e => e.id === selectedOocyteId);
          const sorted = [...(oocyte?.images ?? [])].sort((a, b) => b.score - a.score);
          return (
            <div className="flex-1 min-h-0 overflow-x-auto">
              <div className="flex gap-3 h-full" style={{ width: `${sorted.length * 200}px`, minWidth: '100%' }}>
                {sorted.map((img, idx) => {
                  const gc = gradeCls(img.grade);
                  return (
                    <div key={idx} className="flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden flex-1 min-w-[180px] min-h-0">
                      {/* Fixed top: rank + image + grade + score */}
                      <div className="shrink-0">
                        <div className="px-3 pt-3 pb-2 flex items-center gap-2">
                          <RankBadge rank={idx + 1} />
                          <span className="text-[10px] font-bold text-gray-600">Image #{idx + 1}</span>
                        </div>
                        <div className="mx-3 rounded-xl overflow-hidden bg-black aspect-[4/3]">
                          <img src={img.url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="px-3 pt-2.5 pb-2 flex flex-col gap-2">
                          <div className={`rounded-xl px-3 py-2 border text-center ${gc.bg} ${gc.border}`}>
                            <div className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Gardner Grade</div>
                            <div className={`text-2xl font-black leading-none ${gc.text}`}>{img.grade}</div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">AI Score</span>
                              <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md leading-none" style={scorePillStyle(img.score)}>{img.score}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${img.score * 10}%`, background: scoreBarGradient(img.score) }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Scrollable detail */}
                      <div className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100">
                        {/* Quality Flags */}
                        <div className="px-3 py-2 text-[8px] font-black uppercase tracking-widest border-b border-gray-100" style={{ background: '#faf4ff', color: '#6b1176' }}>
                          Quality Flags
                        </div>
                        <div className="divide-y divide-gray-50">
                          {([
                            { label: 'Hatching',        value: img.morphology.hatching        },
                            { label: 'Vacuolization',   value: img.morphology.vacuolization   },
                            { label: 'Multinucleation', value: img.morphology.multinucleation },
                          ]).map(item => {
                            const s = criticalStyle(item.value);
                            return (
                              <div key={item.label} className="flex items-center justify-between gap-2 px-3 py-2.5">
                                <span className="text-[10px] font-medium text-gray-400 leading-tight">{item.label}</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 leading-none" style={s}>{item.value}</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Morphology */}
                        <div className="px-3 py-2 text-[8px] font-black uppercase tracking-widest border-y border-gray-100 bg-gray-50 text-gray-500">
                          Morphology
                        </div>
                        <div className="divide-y divide-gray-50">
                          {([
                            { label: 'Fragmentation',  value: img.morphology.fragmentation          },
                            { label: 'Symmetry',       value: img.morphology.symmetry               },
                            { label: 'Zona Pellucida', value: img.morphology.zonaPellucida          },
                            { label: 'Blastocoel',     value: img.morphology.blastocoelQuality      },
                            { label: 'Cyto. Gran.',    value: img.morphology.cytoplasmicGranularity },
                            { label: 'Bridge',         value: img.morphology.bridge                 },
                          ]).map(item => (
                            <div key={item.label} className="flex items-center justify-between gap-2 px-3 py-2.5">
                              <span className="text-[10px] font-medium text-gray-400 leading-tight">{item.label}</span>
                              <span className="text-[10px] font-bold text-gray-700 shrink-0">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : selectedEmbryoIds.length === 0 ? (
          <div className="flex flex-col flex-1 gap-3 min-h-0">

            <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="border border-dashed border-primary/20 rounded-2xl bg-primary/[0.02] flex flex-col items-center justify-center relative p-5"
                >
                  <div className="absolute top-3 left-3 w-6 h-6 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                    <span className="text-[10px] font-bold text-gray-500">{i}</span>
                  </div>
                  <div className="w-11 h-11 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-3">
                    <span className="text-xl font-light text-gray-300 leading-none">+</span>
                  </div>
                  <p className="text-sm font-medium text-gray-400 text-center">Select embryo</p>
                  <p className="text-[11px] text-gray-300 mt-1 text-center">Choose from leaderboard</p>
                </div>
              ))}
            </div>

            <div className="shrink-0 border border-gray-100 rounded-2xl bg-white px-4 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b1176" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l2 6.5L20 11l-6.5 2L12 19.5l-1.5-6.5L4 11l6.5-2z"/>
                  </svg>
                  <p className="text-sm font-bold text-gray-900">Select embryos to view comparison</p>
                </div>
                <p className="text-[11px] text-gray-400">Choose up to 4 embryos from the leaderboard to compare their grades and metrics side by side.</p>
              </div>
              <div className="flex gap-1.5 shrink-0 opacity-40">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-14 h-16 rounded-lg flex flex-col gap-1 p-1.5" style={{ border: '1px solid #e8d5f0', background: 'linear-gradient(160deg, #faf4ff 0%, #f3e8ff 100%)' }}>
                    <div className="h-2 rounded w-full" style={{ background: '#e8d5f0' }} />
                    <div className="h-2 rounded w-3/4" style={{ background: '#ddc6f0' }} />
                    <div className="h-2 rounded w-full mt-auto" style={{ background: '#e8d5f0' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Reading guide strip */}
            <div className="rounded-xl overflow-hidden w-full flex items-stretch" style={{ border: '1px solid #e8d5f0', background: 'linear-gradient(135deg, #faf4ff 0%, #f5eeff 100%)' }}>
              {/* Label */}
              <div className="flex items-center gap-1.5 px-3 py-2.5 shrink-0 border-r" style={{ borderColor: '#e8d5f0' }}>
                <Info size={11} className="text-primary shrink-0" />
                <p className="text-[9px] font-black text-primary uppercase tracking-widest whitespace-nowrap">How to read</p>
              </div>

              {/* AI Score */}
              <div className="flex flex-1 items-center gap-2 px-3 py-2 border-r" style={{ borderColor: '#e8d5f0' }}>
                <div className="relative w-7 h-7 shrink-0">
                  <svg viewBox="0 0 32 32" width="28" height="28" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="16" cy="16" r="11" fill="none" stroke="#e8d5f0" strokeWidth="4" />
                    <circle cx="16" cy="16" r="11" fill="none" stroke="#7c3aed" strokeWidth="4"
                      strokeDasharray={`${2 * Math.PI * 11 * 0.87} ${2 * Math.PI * 11}`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[7px] font-black text-primary leading-none">8.7</span>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#3b0764] leading-none">AI Score</p>
                  <p className="text-[8px] mt-0.5" style={{ color: '#6b1176' }}>Ring shows 0–10 prediction score</p>
                </div>
              </div>

              {/* Gardner Grade */}
              <div className="flex flex-1 items-center gap-2 px-3 py-2 border-r" style={{ borderColor: '#e8d5f0' }}>
                <span className="text-lg font-black text-emerald-600 leading-none shrink-0">5AA</span>
                <div>
                  <p className="text-[9px] font-bold text-[#3b0764] leading-none">Gardner Grade</p>
                  <p className="text-[8px] mt-0.5" style={{ color: '#6b1176' }}>Expansion · ICM · TE combined</p>
                </div>
              </div>

              {/* Quality flags */}
              <div className="flex flex-1 items-center gap-2 px-3 py-2 border-r" style={{ borderColor: '#e8d5f0' }}>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold leading-none">None</span>
                  <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-bold leading-none">Minimal</span>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#3b0764] leading-none">Quality Flags</p>
                  <p className="text-[8px] mt-0.5" style={{ color: '#6b1176' }}>Severity of morphology issues</p>
                </div>
              </div>

              {/* Score color guide */}
              <div className="flex flex-1 items-center gap-2 px-3 py-2">
                <div className="flex flex-col gap-0.5 shrink-0">
                  {([['bg-emerald-500', '≥ 8.0 High'], ['bg-orange-500', '≥ 6.0 Good'], ['bg-rose-500', '< 6.0 Low']] as const).map(([cls, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />
                      <span className="text-[8px]" style={{ color: '#6b1176' }}>{label}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#3b0764] leading-none">Score Colour</p>
                  <p className="text-[8px] mt-0.5" style={{ color: '#6b1176' }}>Bar colour reflects quality tier</p>
                </div>
              </div>
            </div>

          </div>
        ) : (() => {
          const eid = selectedEmbryoIds[viewIndex];
          const emb = eid ? LEADERBOARD_EMBRYOS.find(e => e.id === eid) : undefined;
          const gc = emb ? gradeCls(emb.grade) : null;
          const m = emb?.morphology;
          const total = selectedEmbryoIds.length;

          return (
            <div className="flex-1 min-h-0 flex flex-col gap-3">

              {/* Nav bar */}
              <div className="shrink-0 flex items-center border border-gray-200 rounded-2xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setViewIndex(i => Math.max(0, i - 1))}
                  disabled={viewIndex === 0}
                  className="flex items-center justify-center w-14 h-12 text-gray-700 hover:bg-gray-50 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors border-r border-gray-200 shrink-0"
                >
                  <ChevronLeft size={22} strokeWidth={2.5} />
                </button>
                <div className="flex-1 flex items-center justify-center gap-3 px-4">
                  <span className="text-base font-black text-gray-900 tabular-nums">{total > 0 ? viewIndex + 1 : 0} / {total}</span>
                  {emb && (
                    <span className="text-sm font-semibold text-gray-400">{eidToLabel(emb.id)}</span>
                  )}
                  {emb && (
                    <button
                      type="button"
                      onClick={() => setSelectedEmbryoIds(prev => prev.filter(id => id !== eid))}
                      className="ml-auto text-gray-400 hover:text-rose-500 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewIndex(i => Math.min(total - 1, i + 1))}
                  disabled={viewIndex >= total - 1}
                  className="flex items-center justify-center w-14 h-12 text-gray-700 hover:bg-gray-50 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors border-l border-gray-200 shrink-0"
                >
                  <ChevronRight size={22} strokeWidth={2.5} />
                </button>
              </div>

              {/* Embryo detail */}
              {emb && gc && m ? (
                <div className="flex-1 min-h-0 overflow-y-auto flex gap-4">

                  {/* Left: image */}
                  <div className="shrink-0 w-64 flex flex-col gap-3">
                    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black aspect-square">
                      <img src={emb.src} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 ${gc.bg} ${gc.border}`}>
                      <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gardner Grade</div>
                      <div className={`text-4xl font-black leading-none ${gc.text}`}>{emb.grade}</div>
                      <div className="text-[10px] text-gray-500 mt-1">{emb.quality}</div>
                    </div>
                  </div>

                  {/* Right: metrics */}
                  <div className="flex-1 min-w-0 flex flex-col gap-3">

                    {/* AI Score */}
                    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">AI Score</span>
                        <span className="text-sm font-black tabular-nums px-2 py-0.5 rounded-lg" style={scorePillStyle(emb.aiScore)}>
                          {emb.aiScore} <span className="font-medium opacity-60 text-xs">/ 10</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${emb.aiScore * 10}%`, background: scoreBarGradient(emb.aiScore) }} />
                      </div>
                    </div>

                    {/* Quality Flags */}
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e8d5f0' }}>
                      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: '#faf4ff' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b1176" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#6b1176' }}>Quality Flags</span>
                      </div>
                      <div className="divide-y divide-gray-50 bg-white">
                        {([
                          { label: 'Hatching',        value: m.hatching        },
                          { label: 'Vacuolization',   value: m.vacuolization   },
                          { label: 'Multinucleation', value: m.multinucleation },
                        ]).map(item => {
                          const s = criticalStyle(item.value);
                          return (
                            <div key={item.label} className="flex items-center justify-between gap-2 px-4 py-2.5">
                              <span className="text-[11px] font-medium text-gray-500">{item.label}</span>
                              <span className="text-[10px] font-bold rounded-md px-2 py-0.5 shrink-0" style={{ color: s.color, background: s.background }}>{item.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Morphology */}
                    <div className="rounded-2xl overflow-hidden border border-gray-100">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Morphology</span>
                      </div>
                      <div className="divide-y divide-gray-50 bg-white">
                        {([
                          { label: 'Fragmentation',  value: m.fragmentation          },
                          { label: 'Symmetry',       value: m.symmetry               },
                          { label: 'Zona Pellucida', value: m.zonaPellucida          },
                          { label: 'Blastocoel',     value: m.blastocoelQuality      },
                          { label: 'Cyto. Gran.',    value: m.cytoplasmicGranularity },
                          { label: 'Bridge',         value: m.bridge                 },
                        ]).map(item => (
                          <div key={item.label} className="flex items-center justify-between gap-2 px-4 py-2.5">
                            <span className="text-[11px] font-medium text-gray-400">{item.label}</span>
                            <span className="text-[11px] font-bold text-gray-700 shrink-0">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-300">No embryo selected</div>
              )}

            </div>
          );
        })()}
      </div>

    </div>
  );
}
