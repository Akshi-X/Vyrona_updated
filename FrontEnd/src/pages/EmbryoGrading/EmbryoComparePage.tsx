import { useState } from 'react';
import { X, Trophy, GitCompare, Star, Search } from 'lucide-react';
import type { BlastocystMorphology } from '../../types/embryo';

interface LeaderboardEmbryo {
  id: string;
  time: string;
  aiScore: number;
  grade: string;
  quality: string;
  rank: number;
  src: string;
  morphology: BlastocystMorphology;
}

const LEADERBOARD_EMBRYOS: LeaderboardEmbryo[] = [
  {
    id: 'EID 1.2', time: '17.57 h', aiScore: 9.2, grade: '5AA', quality: 'High Quality', rank: 1,
    src: '/embryo/list/emb2.png',
    morphology: {
      expansion: 5, icm: 'A', te: 'A',
      hatching: 'Not Hatching', vacuolization: 'None', multinucleation: 'None',
      fragmentation: '< 5%', symmetry: 'Excellent',
      zonaPellucida: 'Intact', blastocoelQuality: 'Excellent', cytoplasmicGranularity: 'Fine', bridge: 'None',
    },
  },
  {
    id: 'EID 1.1', time: '17.32 h', aiScore: 8.7, grade: '4AA', quality: 'High Quality', rank: 2,
    src: '/embryo/list/em1.png',
    morphology: {
      expansion: 4, icm: 'A', te: 'A',
      hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None',
      fragmentation: '5 - 10%', symmetry: 'Excellent',
      zonaPellucida: 'Intact', blastocoelQuality: 'Excellent', cytoplasmicGranularity: 'Fine', bridge: 'None',
    },
  },
  {
    id: 'EID 1.3', time: '18.41 h', aiScore: 7.9, grade: '4AB', quality: 'Good Quality', rank: 3,
    src: '/embryo/list/emb3.png',
    morphology: {
      expansion: 4, icm: 'A', te: 'B',
      hatching: 'Not Hatching', vacuolization: 'Minimal', multinucleation: 'None',
      fragmentation: '10 - 15%', symmetry: 'Good',
      zonaPellucida: 'Good', blastocoelQuality: 'Good', cytoplasmicGranularity: 'Fine', bridge: 'Minimal',
    },
  },
  {
    id: 'EID 1.4', time: '17.20 h', aiScore: 6.5, grade: '3BB', quality: 'Medium Quality', rank: 4,
    src: '/embryo/list/em4.png',
    morphology: {
      expansion: 3, icm: 'B', te: 'B',
      hatching: 'Not Hatching', vacuolization: 'Mild', multinucleation: 'Minimal',
      fragmentation: '15 - 20%', symmetry: 'Fair',
      zonaPellucida: 'Intact', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present',
    },
  },
  {
    id: 'EID 1.5', time: '16.50 h', aiScore: 5.3, grade: '3BC', quality: 'Low Quality', rank: 5,
    src: '/embryo/list/emb5.png',
    morphology: {
      expansion: 3, icm: 'B', te: 'C',
      hatching: 'Not Hatching', vacuolization: 'Moderate', multinucleation: 'Present',
      fragmentation: '20 - 25%', symmetry: 'Fair',
      zonaPellucida: 'Thinning', blastocoelQuality: 'Fair', cytoplasmicGranularity: 'Coarse', bridge: 'Present',
    },
  },
  {
    id: 'EID 1.6', time: '17.10 h', aiScore: 4.1, grade: '2BC', quality: 'Low Quality', rank: 6,
    src: '/embryo/list/emb6.png',
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

function scoreColor(score: number): string {
  if (score >= 8) return '#10b981';
  if (score >= 6) return '#f59e0b';
  return '#f43f5e';
}

function scoreTextCls(score: number): string {
  if (score >= 8) return 'text-emerald-600';
  if (score >= 6) return 'text-amber-600';
  return 'text-rose-500';
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

export default function EmbryoComparePage() {
  const [selectedEmbryoIds, setSelectedEmbryoIds] = useState<string[]>([]);

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

        <div className="shrink-0 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#f9f4ff 0%,#ffffff 100%)' }}>
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

        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 p-2.5">
          {LEADERBOARD_EMBRYOS.map(emb => {
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
                    <span className={`text-[11px] font-black tabular-nums ${scoreTextCls(emb.aiScore)}`}>{emb.aiScore}</span>
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${emb.aiScore * 10}%`, background: scoreColor(emb.aiScore) }}
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
              <GitCompare size={14} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Compare Embryos</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Select up to 4 embryos to compare</p>
            </div>
          </div>
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
        </div>

        {/* Empty state */}
        {selectedEmbryoIds.length === 0 ? (
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
              <div className="flex gap-1.5 shrink-0 opacity-25">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-14 h-16 rounded-xl border border-gray-300 bg-gray-100 flex flex-col gap-1 p-1.5">
                    <div className="h-2 rounded bg-gray-200 w-full" />
                    <div className="h-2 rounded bg-gray-200 w-3/4" />
                    <div className="h-2 rounded bg-gray-200 w-full mt-auto" />
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 border border-gray-100 rounded-2xl bg-white px-4 py-3 flex items-start gap-6 flex-wrap">
              <div className="flex items-start gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b1176" strokeWidth="1.5" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="#6b1176"/>
                </svg>
                <div>
                  <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">AI Score</div>
                  <div className="text-[10px] text-gray-600">Overall prediction score</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Star size={15} className="text-primary shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Grade</div>
                  <div className="text-[10px] text-gray-600">Best grade prediction</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex gap-1 shrink-0 mt-0.5">
                  {['EXP', 'ICM', 'TE'].map(tag => (
                    <span key={tag} className="text-[8px] font-bold bg-primary/10 text-primary rounded px-1 py-0.5">{tag}</span>
                  ))}
                </div>
                <div>
                  <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Core Grade</div>
                  <div className="text-[10px] text-gray-600">
                    <span className="font-semibold">EXP</span> Expansion &nbsp;
                    <span className="font-semibold">ICM</span> Inner Cell Mass &nbsp;
                    <span className="font-semibold">TE</span> Trophectoderm
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Search size={15} className="text-primary shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Quality</div>
                  <div className="text-[10px] text-gray-600">High / Good / Medium / Low</div>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-x-auto">
            <div
              className="grid gap-3 h-full"
              style={{ gridTemplateColumns: `repeat(4, minmax(170px, 240px))` }}
            >
              {[0, 1, 2, 3].map(idx => {
                const eid = selectedEmbryoIds[idx];
                if (!eid) return (
                  <div key={idx} className="border border-dashed border-primary/20 rounded-2xl bg-primary/[0.02] flex flex-col items-center justify-center relative p-5">
                    <div className="absolute top-3 left-3 w-6 h-6 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                    </div>
                    <div className="w-11 h-11 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-3">
                      <span className="text-xl font-light text-gray-300 leading-none">+</span>
                    </div>
                    <p className="text-sm font-medium text-gray-400">Select embryo</p>
                    <p className="text-[11px] text-gray-300 mt-1">Choose from leaderboard</p>
                  </div>
                );

                const emb = LEADERBOARD_EMBRYOS.find(e => e.id === eid)!;
                const hex = SLOT_COLORS[idx].hex;
                const gc = gradeCls(emb.grade);
                const m = emb.morphology;

                return (
                  <div key={idx} className="flex flex-col min-h-0">

                    {/* Fixed top: header + image + grade + core breakdown */}
                    <div className="shrink-0 flex flex-col gap-2">

                      {/* Column header */}
                      <div
                        className="rounded-xl flex items-center gap-1.5 px-2.5 py-2 border"
                        style={{ borderColor: hex + '45', background: hex + '10' }}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                          style={{ background: hex }}
                        >{idx + 1}</span>
                        <span className="text-xs font-bold text-gray-800 flex-1 truncate">{eidToLabel(emb.id)}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEmbryoIds(prev => prev.filter(id => id !== eid))}
                          className="text-gray-500 hover:text-gray-900 transition-colors shrink-0"
                        >
                          <X size={10} />
                        </button>
                      </div>

                      {/* Image */}
                      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${hex}40` }}>
                        <div className="aspect-square bg-gray-100">
                          <img src={emb.src} alt="" className="w-full h-full object-cover" />
                        </div>
                      </div>

                      {/* Grade + AI Score */}
                      <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${gc.bg} ${gc.border}`}>
                        <div className="shrink-0">
                          <div className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Grade</div>
                          <div className={`text-2xl font-black leading-none ${gc.text}`}>{emb.grade}</div>
                        </div>
                        <div className="w-px self-stretch bg-black/10 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest">AI Score</span>
                            <span className={`text-sm font-black tabular-nums ${scoreTextCls(emb.aiScore)}`}>
                              {emb.aiScore}<span className="text-[10px] font-medium text-gray-400"> / 10</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${emb.aiScore * 10}%`, background: scoreColor(emb.aiScore) }}
                            />
                          </div>
                        </div>
                      </div>


                    </div>

                    {/* Scrollable bottom: critical + supplementary */}
                    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pt-2 pb-1">

                      {/* Tier 2 — Quality Flags */}
                      <div className="shrink-0 rounded-xl overflow-hidden" style={{ border: '1px solid #e8d5f0' }}>
                        <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#faf4ff' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b1176" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#6b1176' }}>Quality Flags</span>
                        </div>
                        <div className="divide-y divide-gray-50 bg-white">
                          {([
                            { label: 'Hatching',        value: m.hatching        },
                            { label: 'Vacuolization',   value: m.vacuolization   },
                            { label: 'Multinucleation', value: m.multinucleation },
                          ]).map(item => {
                            const s = criticalStyle(item.value);
                            return (
                              <div key={item.label} className="flex items-center justify-between gap-2 px-3 py-2.5">
                                <span className="text-[10px] font-medium text-gray-500 leading-tight">{item.label}</span>
                                <span
                                  className="text-[9px] font-bold rounded-md px-2 py-0.5 shrink-0"
                                  style={{ color: s.color, background: s.background }}
                                >{item.value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Tier 3 — Morphology */}
                      <div className="shrink-0 rounded-xl overflow-hidden border border-gray-100">
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                          </svg>
                          <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Morphology</span>
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
                            <div key={item.label} className="flex items-center justify-between gap-2 px-3 py-2.5">
                              <span className="text-[10px] font-medium text-gray-400 leading-tight">{item.label}</span>
                              <span className="text-[10px] font-bold text-gray-700 shrink-0">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
