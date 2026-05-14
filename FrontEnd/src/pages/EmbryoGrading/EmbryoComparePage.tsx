import { useState } from 'react';
import { type LucideIcon, X, Info, Layers, Trophy, GitCompare, Scissors, AlignCenter, Shield, Droplet, Link, CircleDot, Atom, Grid3x3, Egg } from 'lucide-react';


interface LeaderboardEmbryo {
  id: string; time: string; aiScore: number; grade: string; quality: string; rank: number;
  icm: string; te: string; expansion: string; src: string;
  blastocystStage: string; icmDesc: string; teDesc: string; expansionDesc: string;
  fragPct: string; fragBars: number; symText: string; symBars: number;
  zonaText: string; zonaBars: number; blastoText: string; blastoBars: number;
  bridgeText: string; vacuoleText: string; vacuoleBars: number;
  hatchText: string; multinucText: string; cytogranText: string;
}

const LEADERBOARD_EMBRYOS: LeaderboardEmbryo[] = [
  { id: 'EID 1.2', time: '17.57 h', aiScore: 9.2, grade: '5AA', quality: 'High Quality',   rank: 1, icm: 'A', te: 'A', expansion: '5', src: '/embryo/list/emb2.png', blastocystStage: 'Expanded Blastocyst', icmDesc: 'A - Many Cells',    teDesc: 'A - Many Cells',     expansionDesc: '5 - Expanded',        fragPct: '< 5%',     fragBars: 4, symText: 'Excellent', symBars: 4, zonaText: 'Intact',   zonaBars: 2, blastoText: 'Excellent', blastoBars: 4, bridgeText: 'None',    vacuoleText: 'None',     vacuoleBars: 4, hatchText: 'Not Hatching', multinucText: 'None',    cytogranText: 'Fine'   },
  { id: 'EID 1.1', time: '17.32 h', aiScore: 8.7, grade: '4AA', quality: 'High Quality',   rank: 2, icm: 'A', te: 'A', expansion: '4', src: '/embryo/list/em1.png', blastocystStage: 'Expanded Blastocyst', icmDesc: 'A - Many Cells',    teDesc: 'A - Many Cells',     expansionDesc: '4 - Expanded',        fragPct: '5 - 10%',  fragBars: 3, symText: 'Excellent', symBars: 4, zonaText: 'Intact',   zonaBars: 3, blastoText: 'Excellent', blastoBars: 4, bridgeText: 'None',    vacuoleText: 'Minimal',  vacuoleBars: 3, hatchText: 'Not Hatching', multinucText: 'None',    cytogranText: 'Fine'   },
  { id: 'EID 1.3', time: '18.41 h', aiScore: 7.9, grade: '4AB', quality: 'Good Quality',   rank: 3, icm: 'A', te: 'B', expansion: '4', src: '/embryo/list/emb3.png', blastocystStage: 'Expanded Blastocyst', icmDesc: 'A - Many Cells',    teDesc: 'B - Few Cells',      expansionDesc: '4 - Expanded',        fragPct: '10 - 15%', fragBars: 2, symText: 'Good',      symBars: 3, zonaText: 'Good',    zonaBars: 3, blastoText: 'Good',      blastoBars: 3, bridgeText: 'Minimal', vacuoleText: 'Minimal',  vacuoleBars: 3, hatchText: 'Not Hatching', multinucText: 'None',    cytogranText: 'Fine'   },
  { id: 'EID 1.4', time: '17.20 h', aiScore: 6.5, grade: '3BB', quality: 'Medium Quality', rank: 4, icm: 'B', te: 'B', expansion: '3', src: '/embryo/list/em4.png', blastocystStage: 'Early Blastocyst',    icmDesc: 'B - Several Cells', teDesc: 'B - Few Cells',      expansionDesc: '3 - Full Blastocyst', fragPct: '15 - 20%', fragBars: 1, symText: 'Fair',      symBars: 2, zonaText: 'Intact',  zonaBars: 4, blastoText: 'Fair',      blastoBars: 2, bridgeText: 'Present', vacuoleText: 'Mild',     vacuoleBars: 2, hatchText: 'Not Hatching', multinucText: 'Minimal', cytogranText: 'Coarse' },
  { id: 'EID 1.5', time: '16.50 h', aiScore: 5.3, grade: '3BC', quality: 'Low Quality',    rank: 5, icm: 'B', te: 'C', expansion: '3', src: '/embryo/list/emb5.png', blastocystStage: 'Full Blastocyst',     icmDesc: 'B - Several Cells', teDesc: 'C - Very Few Cells', expansionDesc: '3 - Full Blastocyst', fragPct: '20 - 25%', fragBars: 1, symText: 'Fair',      symBars: 2, zonaText: 'Thinning', zonaBars: 2, blastoText: 'Fair',      blastoBars: 2, bridgeText: 'Present', vacuoleText: 'Moderate', vacuoleBars: 1, hatchText: 'Not Hatching', multinucText: 'Present', cytogranText: 'Coarse' },
  { id: 'EID 1.6', time: '17.10 h', aiScore: 4.1, grade: '2BC', quality: 'Low Quality',    rank: 6, icm: 'B', te: 'C', expansion: '2', src: '/embryo/list/emb6.png', blastocystStage: 'Blastocyst',          icmDesc: 'B - Several Cells', teDesc: 'C - Very Few Cells', expansionDesc: '2 - Forming',          fragPct: '25 - 30%', fragBars: 0, symText: 'Poor',      symBars: 1, zonaText: 'Thinning', zonaBars: 1, blastoText: 'Poor',      blastoBars: 1, bridgeText: 'Present', vacuoleText: 'Moderate', vacuoleBars: 1, hatchText: 'Not Hatching', multinucText: 'Present', cytogranText: 'Coarse' },
];

const SLOT_COLORS = [
  { border: 'border-[#4f46e5]', badgeBg: 'bg-[#4f46e5]', textCol: 'text-[#4f46e5]', barCol: 'bg-[#4f46e5]' }, // indigo (blue-purple)
  { border: 'border-[#6b1176]', badgeBg: 'bg-[#6b1176]', textCol: 'text-[#6b1176]', barCol: 'bg-[#6b1176]' }, // primary (classic purple)
  { border: 'border-[#a21caf]', badgeBg: 'bg-[#a21caf]', textCol: 'text-[#a21caf]', barCol: 'bg-[#a21caf]' }, // fuchsia (red-purple)
  { border: 'border-[#7c3aed]', badgeBg: 'bg-[#7c3aed]', textCol: 'text-[#7c3aed]', barCol: 'bg-[#7c3aed]' }, // violet (vivid)
];

const eidToLabel = (id: string) => {
  const m = id.match(/\d+\.(\d+)$/);
  return m ? `Oocyte #${m[1]}` : id;
};

function RankBadge({ rank }: { rank: number }) {
  const configs: Record<number, { outer: string; inner: string; glow: string }> = {
    1: { outer: '#F59E0B', inner: '#FDE68A', glow: 'rgba(245,158,11,0.25)' },
    2: { outer: '#9CA3AF', inner: '#E5E7EB', glow: 'rgba(156,163,175,0.25)' },
    3: { outer: '#CD7C2F', inner: '#FCD9A0', glow: 'rgba(205,124,47,0.25)'  },
  };
  const c = configs[rank];
  if (!c) return null;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer glow ring */}
      <circle cx="15" cy="15" r="14" fill={c.glow} />
      {/* Drop shadow */}
      <circle cx="15" cy="16" r="11" fill="rgba(0,0,0,0.13)" />
      {/* Medal body */}
      <circle cx="15" cy="15" r="11" fill={c.outer} />
      {/* Inner shine */}
      <circle cx="15" cy="12" r="7" fill={c.inner} opacity="0.35" />
      {/* Inner ring */}
      <circle cx="15" cy="15" r="9" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.5" />
      {/* Rank number */}
      <text x="15" y="19.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="system-ui,sans-serif">{rank}</text>
    </svg>
  );
}

export default function EmbryoComparePage() {
  const [selectedEmbryoIds, setSelectedEmbryoIds] = useState<string[]>(['EID 1.2']);

  const toggleEmbryo = (id: string) => {
    setSelectedEmbryoIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  return (
    <>
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Leaderboard ── */}
        <div className="w-[270px] shrink-0 flex flex-col gap-3 overflow-y-auto bg-white border border-primary rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary-bg flex items-center justify-center shrink-0">
                <Trophy size={14} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Leaderboard</h3>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-[11px] text-gray-400">Embryos ranked by AI Score</p>
                  <Info size={10} className="text-gray-300" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {LEADERBOARD_EMBRYOS.map((emb) => {
              const isSelected = selectedEmbryoIds.includes(emb.id);
              const slotIdx = selectedEmbryoIds.indexOf(emb.id);
              const color = slotIdx >= 0 ? SLOT_COLORS[slotIdx] : null;

              return (
                <div
                  key={emb.id}
                  className="relative flex items-center gap-2 px-2.5 py-2 pr-8 rounded-xl cursor-pointer transition-all bg-white"
                  style={{
                    border: isSelected && color ? `1px solid ${color.border.replace('border-[','').replace(']','')}` : '1px solid #EEE8F8',
                    boxShadow: isSelected ? '0 4px 16px rgba(107,17,118,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                  onClick={() => toggleEmbryo(emb.id)}
                >
                  {/* Left accent bar when selected */}
                  {isSelected && color && (
                    <div
                      className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                      style={{ background: color.badgeBg.replace('bg-[','').replace(']','') }}
                    />
                  )}

                  {/* Rank badge */}
                  <div className="shrink-0 flex items-center justify-center w-7">
                    {emb.rank <= 3 ? (
                      <RankBadge rank={emb.rank} />
                    ) : (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-gray-900 bg-gray-100">
                        {emb.rank}
                      </div>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div className="shrink-0 w-9 h-9 rounded-lg overflow-hidden bg-gray-100">
                    <img src={emb.src} alt="" className="w-full h-full object-cover" />
                  </div>

                  {/* Select indicator — absolute vertically centered right */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 right-2 w-[16px] h-[16px] rounded-full flex items-center justify-center shadow-sm transition-all"
                    style={isSelected && color ? {
                      border: `1.5px solid ${color.border.replace('border-[','').replace(']','')}`,
                      background: color.badgeBg.replace('bg-[','').replace(']',''),
                    } : { border: '1.5px solid #D1D5DB', background: 'white' }}
                  >
                    {isSelected && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-gray-900 leading-none truncate block mb-1.5">{eidToLabel(emb.id)}</span>
                    <div className="inline-flex items-center gap-1 bg-[#FAF5FF] border border-[#EDE0FA] rounded-full px-2 py-0.5">
                      <span className="text-[8px] font-bold text-[#c084fc] uppercase tracking-widest leading-none">AI</span>
                      <span className="text-[11px] font-black text-gray-800 leading-none">{emb.aiScore}</span>
                    </div>
                  </div>

                  {/* Grade box */}
                  <div className="shrink-0 flex flex-col items-center rounded-lg bg-[#FAF5FF] px-2 py-1.5 min-w-[36px] border border-[#EDE0FA]">
                    <span className="text-[7px] font-bold text-[#c084fc] uppercase tracking-widest leading-none mb-0.5">Grade</span>
                    <span className="text-sm font-black leading-none text-gray-800">{emb.grade}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Compare panel ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-auto rounded-2xl p-4 border border-primary" style={{ background: 'rgba(141, 84, 149, 0.1)' }}>
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                <GitCompare size={14} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Compare Embryos</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Select up to 4 embryos to compare</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedEmbryoIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedEmbryoIds([])}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  Clear All
                </button>
              )}
              <span className="text-[11px] font-bold text-primary bg-[#F7ECFF] px-2 py-0.5 rounded-full border border-[#c084fc]/40">
                {selectedEmbryoIds.length} / 4 Selected
              </span>
            </div>
          </div>

          {selectedEmbryoIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[#F7ECFF] flex items-center justify-center mb-3 text-primary">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No embryos selected</p>
              <p className="text-xs text-gray-400 mt-1">Select embryos from the leaderboard to compare</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${130 + selectedEmbryoIds.length * 170}px` }}>

                {/* Embryo columns — offset by 130px to align with metrics label */}
                <div
                  className="grid gap-2.5 mb-2.5"
                  style={{ gridTemplateColumns: `160px repeat(${selectedEmbryoIds.length}, minmax(155px, 220px))` }}
                >
                  <div />
                  {selectedEmbryoIds.map((eid, idx) => {
                    const emb = LEADERBOARD_EMBRYOS.find(e => e.id === eid)!;
                    const color = SLOT_COLORS[idx];
                    return (
                      <div key={eid} className="flex flex-col gap-2">

                        {/* Header box */}
                        <div
                          className="rounded-xl flex items-center gap-1.5 px-2.5 py-2 border"
                          style={{
                            borderColor: color.border.replace('border-[','').replace(']','') + '50',
                            background: color.badgeBg.replace('bg-[','').replace(']','') + '12',
                            boxShadow: 'none',
                          }}
                        >
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0" style={{ background: color.badgeBg.replace('bg-[','').replace(']','') }}>{idx + 1}</span>
                          <span className="text-xs font-bold text-gray-800 flex-1 truncate">{eidToLabel(emb.id)}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedEmbryoIds(prev => prev.filter(id => id !== eid))}
                            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 ml-1"
                          >
                            <X size={10} />
                          </button>
                        </div>

                        {/* Image box */}
                        <div
                          className="relative rounded-xl overflow-hidden"
                          style={{
                            border: `1px solid ${color.border.replace('border-[','').replace(']','')}50`,
                            boxShadow: 'none',
                          }}
                        >
                          <div className="aspect-square bg-gray-50">
                            <img src={emb.src} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-md flex items-center justify-center shadow-sm" style={{ background: color.badgeBg.replace('bg-[','').replace(']','') }}>
                            <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        </div>

                        {/* AI Score box */}
                        <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-wide">AI Score</span>
                            <span className="text-sm font-black text-gray-900">{emb.aiScore} <span className="text-[10px] font-medium text-gray-500">/ 10</span></span>
                          </div>
                          <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${emb.aiScore * 10}%`, background: color.barCol.replace('bg-[','').replace(']','') }} />
                          </div>
                        </div>

                        {/* Exp / ICM / TE — each its own box */}
                        <div className="flex gap-1.5">
                          {[{ label: 'Exp', value: emb.expansion }, { label: 'ICM', value: emb.icm }, { label: 'TE', value: emb.te }].map(chip => (
                            <div key={chip.label} className="flex-1 rounded-xl bg-white border border-gray-200 px-1 py-2 text-center">
                              <div className="text-[8px] text-gray-600 font-semibold uppercase tracking-wide leading-none mb-1">{chip.label}</div>
                              <div className="text-xs font-black text-gray-900">{chip.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Key Metrics */}
                <div className="rounded-xl border border-[#E7E1E1] overflow-hidden">
                  <div className="px-3 py-2 rounded-xl border-primary  bg-[#FDFAFF]">
                    <h4 className="text-xs font-bold text-gray-900">Key Metrics</h4>
                  </div>
                  <div className="divide-y divide-[#F0EBF4]">
                    {([
                      { metric: 'Blastocyst Stage',    icon: Layers,      getValue: (e: LeaderboardEmbryo) => e.blastocystStage },
                      { metric: 'Hatching Status',     icon: Egg,         getValue: (e: LeaderboardEmbryo) => e.hatchText       },
                      { metric: 'Fragmentation',       icon: Scissors,    getValue: (e: LeaderboardEmbryo) => e.fragPct,       bars: (e: LeaderboardEmbryo) => e.fragBars    },
                      { metric: 'Symmetry',            icon: AlignCenter, getValue: (e: LeaderboardEmbryo) => e.symText,       bars: (e: LeaderboardEmbryo) => e.symBars     },
                      { metric: 'Zona Pellucida',      icon: Shield,      getValue: (e: LeaderboardEmbryo) => e.zonaText,      bars: (e: LeaderboardEmbryo) => e.zonaBars    },
                      { metric: 'Blastocoel',          icon: Droplet,     getValue: (e: LeaderboardEmbryo) => e.blastoText,    bars: (e: LeaderboardEmbryo) => e.blastoBars  },
                      { metric: 'Bridge Formation',    icon: Link,        getValue: (e: LeaderboardEmbryo) => e.bridgeText     },
                      { metric: 'Vacuolization',       icon: CircleDot,   getValue: (e: LeaderboardEmbryo) => e.vacuoleText,   bars: (e: LeaderboardEmbryo) => e.vacuoleBars },
                      { metric: 'Multinucleation',     icon: Atom,        getValue: (e: LeaderboardEmbryo) => e.multinucText   },
                      { metric: 'Cyto. Granularity',   icon: Grid3x3,     getValue: (e: LeaderboardEmbryo) => e.cytogranText   },
                    ] as { metric: string; icon: LucideIcon; getValue: (e: LeaderboardEmbryo) => string; bars?: (e: LeaderboardEmbryo) => number }[]).map(row => (
                      <div
                        key={row.metric}
                        className="grid"
                        style={{ gridTemplateColumns: `160px repeat(${selectedEmbryoIds.length}, minmax(155px, 220px))` }}
                      >
                        <div className="px-3 py-2 text-[10px] font-semibold text-primary flex items-center gap-1.5 border-r border-[#F0EBF4]">
                          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                            <row.icon size={14} className="text-primary" />
                          </div>
                          {row.metric}
                        </div>
                        {selectedEmbryoIds.map((eid, idx) => {
                          const emb = LEADERBOARD_EMBRYOS.find(e => e.id === eid)!;
                          const color = SLOT_COLORS[idx];
                          return (
                            <div key={eid} className="px-2.5 py-2 flex items-center gap-1.5 border-r border-[#F0EBF4] last:border-r-0">
                              {row.bars && (
                                <div className="flex gap-0.5 shrink-0">
                                  {[0, 1, 2, 3].map(i => (
                                    <div key={i} className={`w-2.5 h-1.5 rounded-sm ${i < row.bars!(emb) ? color.barCol : 'bg-gray-100'}`} />
                                  ))}
                                </div>
                              )}
                              <span className="text-[10px] text-gray-700">{row.getValue(emb)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
