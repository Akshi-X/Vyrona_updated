import { useState } from 'react';
import { X, Info } from 'lucide-react';

const mkEmbryo = (c1: string, c2: string, c3: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><radialGradient id="bg" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></radialGradient></defs><rect width="300" height="300" fill="#1a1a2e"/><circle cx="150" cy="150" r="120" fill="url(#bg)" opacity="0.9"/><circle cx="150" cy="150" r="120" fill="none" stroke="#888" stroke-width="12" opacity="0.4"/><circle cx="190" cy="145" r="60" fill="${c3}" opacity="0.35" stroke="#aaa" stroke-width="2"/><circle cx="120" cy="130" r="28" fill="#e8e8e8" opacity="0.5"/><circle cx="170" cy="120" r="22" fill="#d0d0d0" opacity="0.45"/><circle cx="140" cy="165" r="25" fill="#c8c8c8" opacity="0.4"/><circle cx="108" cy="162" r="18" fill="#e0e0e0" opacity="0.4"/><circle cx="175" cy="165" r="20" fill="#d8d8d8" opacity="0.4"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

interface LeaderboardEmbryo {
  id: string; time: string; aiScore: number; grade: string; quality: string; rank: number;
  icm: string; te: string; expansion: string; src: string;
  blastocystStage: string; icmDesc: string; teDesc: string; expansionDesc: string;
  fragPct: string; fragBars: number; symText: string; symBars: number;
  zonaText: string; zonaBars: number; blastoText: string; blastoBars: number;
}

const LEADERBOARD_EMBRYOS: LeaderboardEmbryo[] = [
  { id: 'EID 1.2', time: '17.57 h', aiScore: 9.2, grade: '5AA', quality: 'High Quality',   rank: 1, icm: 'A', te: 'A', expansion: '5', src: mkEmbryo('#c8d8f0', '#4a6080', '#b0c8e8'), blastocystStage: 'Expanded Blastocyst', icmDesc: 'A - Many Cells',    teDesc: 'A - Many Cells',     expansionDesc: '5 - Expanded',        fragPct: '< 5%',     fragBars: 4, symText: 'Excellent', symBars: 4, zonaText: 'Intact',   zonaBars: 2, blastoText: 'Excellent', blastoBars: 4 },
  { id: 'EID 1.1', time: '17.32 h', aiScore: 8.7, grade: '4AA', quality: 'High Quality',   rank: 2, icm: 'A', te: 'A', expansion: '4', src: mkEmbryo('#d0d8e8', '#506070', '#a8c0d8'), blastocystStage: 'Expanded Blastocyst', icmDesc: 'A - Many Cells',    teDesc: 'A - Many Cells',     expansionDesc: '4 - Expanded',        fragPct: '5 - 10%',  fragBars: 3, symText: 'Excellent', symBars: 4, zonaText: 'Intact',   zonaBars: 3, blastoText: 'Excellent', blastoBars: 4 },
  { id: 'EID 1.3', time: '18.41 h', aiScore: 7.9, grade: '4AB', quality: 'Good Quality',   rank: 3, icm: 'A', te: 'B', expansion: '4', src: mkEmbryo('#c0cce0', '#485868', '#a0b8d0'), blastocystStage: 'Expanded Blastocyst', icmDesc: 'A - Many Cells',    teDesc: 'B - Few Cells',      expansionDesc: '4 - Expanded',        fragPct: '10 - 15%', fragBars: 2, symText: 'Good',      symBars: 3, zonaText: 'Good',    zonaBars: 3, blastoText: 'Good',      blastoBars: 3 },
  { id: 'EID 1.4', time: '17.20 h', aiScore: 6.5, grade: '3BB', quality: 'Medium Quality', rank: 4, icm: 'B', te: 'B', expansion: '3', src: mkEmbryo('#b8c8d8', '#405060', '#98b0c8'), blastocystStage: 'Early Blastocyst',    icmDesc: 'B - Several Cells', teDesc: 'B - Few Cells',      expansionDesc: '3 - Full Blastocyst', fragPct: '15 - 20%', fragBars: 1, symText: 'Fair',      symBars: 2, zonaText: 'Intact',  zonaBars: 4, blastoText: 'Fair',      blastoBars: 2 },
  { id: 'EID 1.5', time: '16.50 h', aiScore: 5.3, grade: '3BC', quality: 'Low Quality',    rank: 5, icm: 'B', te: 'C', expansion: '3', src: mkEmbryo('#b0c0d0', '#384858', '#90a8c0'), blastocystStage: 'Full Blastocyst',     icmDesc: 'B - Several Cells', teDesc: 'C - Very Few Cells', expansionDesc: '3 - Full Blastocyst', fragPct: '20 - 25%', fragBars: 1, symText: 'Fair',      symBars: 2, zonaText: 'Thinning', zonaBars: 2, blastoText: 'Fair',      blastoBars: 2 },
  { id: 'EID 1.6', time: '17.10 h', aiScore: 4.1, grade: '2BC', quality: 'Low Quality',    rank: 6, icm: 'B', te: 'C', expansion: '2', src: mkEmbryo('#a8b8c8', '#304050', '#88a0b8'), blastocystStage: 'Blastocyst',          icmDesc: 'B - Several Cells', teDesc: 'C - Very Few Cells', expansionDesc: '2 - Forming',          fragPct: '25 - 30%', fragBars: 0, symText: 'Poor',      symBars: 1, zonaText: 'Thinning', zonaBars: 1, blastoText: 'Poor',      blastoBars: 1 },
];

const SLOT_COLORS = [
  { border: 'border-[#9b59b6]', badgeBg: 'bg-[#9b59b6]', textCol: 'text-[#9b59b6]', barCol: 'bg-[#9b59b6]' }, // muted purple
  { border: 'border-[#5b8dd9]', badgeBg: 'bg-[#5b8dd9]', textCol: 'text-[#5b8dd9]', barCol: 'bg-[#5b8dd9]' }, // muted blue
  { border: 'border-[#c0707a]', badgeBg: 'bg-[#c0707a]', textCol: 'text-[#c0707a]', barCol: 'bg-[#c0707a]' }, // muted rose
  { border: 'border-[#c89840]', badgeBg: 'bg-[#c89840]', textCol: 'text-[#c89840]', barCol: 'bg-[#c89840]' }, // muted amber
];

const eidToLabel = (id: string) => {
  const m = id.match(/\d+\.(\d+)$/);
  return m ? `Oocyte #${m[1]}` : id;
};

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
        <div className="w-[220px] shrink-0 flex flex-col gap-2.5 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Leaderboard</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[11px] text-gray-400">Embryos ranked by AI Score</p>
                <Info size={10} className="text-gray-300" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {LEADERBOARD_EMBRYOS.map((emb) => {
              const isSelected = selectedEmbryoIds.includes(emb.id);
              const slotIdx = selectedEmbryoIds.indexOf(emb.id);
              const color = slotIdx >= 0 ? SLOT_COLORS[slotIdx] : null;
              const rankMedal = emb.rank === 1
                ? { bg: '#F59E0B', shadow: 'rgba(245,158,11,0.35)' }
                : emb.rank === 2
                ? { bg: '#9CA3AF', shadow: 'rgba(156,163,175,0.35)' }
                : emb.rank === 3
                ? { bg: '#F97316', shadow: 'rgba(249,115,22,0.35)' }
                : null;

              return (
                <div
                  key={emb.id}
                  className="relative flex items-center gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all bg-white"
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

                  {/* Rank + Checkbox stacked */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0 w-6 pl-1">
                    {rankMedal ? (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                        style={{ background: rankMedal.bg, boxShadow: `0 2px 6px ${rankMedal.shadow}` }}
                      >
                        {emb.rank}
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-gray-400 border border-gray-200 bg-gray-50">
                        {emb.rank}
                      </div>
                    )}
                    <div
                      className="w-[12px] h-[12px] rounded-[3px] flex items-center justify-center transition-all"
                      style={isSelected && color ? {
                        border: `1.5px solid ${color.border.replace('border-[','').replace(']','')}`,
                        background: color.badgeBg.replace('bg-[','').replace(']',''),
                      } : { border: '1.5px solid #D1D5DB', background: 'white' }}
                    >
                      {isSelected && (
                        <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-1.5">
                      <span className="text-xs font-bold text-gray-900 leading-none truncate">{eidToLabel(emb.id)}</span>
                    </div>
                    <div className="inline-flex items-center gap-1 bg-[#FAF5FF] border border-[#EDE0FA] rounded-full px-2 py-0.5">
                      <span className="text-[8px] font-bold text-[#c084fc] uppercase tracking-widest leading-none">AI</span>
                      <span className="text-[11px] font-black text-gray-800 leading-none">{emb.aiScore}</span>
                    </div>
                  </div>

                  {/* Grade box */}
                  <div className="shrink-0 flex flex-col items-center rounded-lg bg-[#FAF5FF] px-2 py-1.5 min-w-[40px] border border-[#EDE0FA]">
                    <span className="text-[7px] font-bold text-[#c084fc] uppercase tracking-widest leading-none mb-0.5">Grade</span>
                    <span className="text-sm font-black leading-none text-gray-800">{emb.grade}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Compare panel ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-auto">
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Compare Embryos</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Select up to 4 embryos to compare</p>
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
                  style={{ gridTemplateColumns: `130px repeat(${selectedEmbryoIds.length}, minmax(155px, 220px))` }}
                >
                  <div /> {/* spacer matching metrics label column */}
                  {selectedEmbryoIds.map((eid, idx) => {
                    const emb = LEADERBOARD_EMBRYOS.find(e => e.id === eid)!;
                    const color = SLOT_COLORS[idx];
                    return (
                      <div key={eid} className="rounded-xl overflow-hidden flex flex-col bg-white" style={{ border: `1px solid ${color.border.replace('border-[','').replace(']','')}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

                        {/* Header */}
                        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: color.border.replace('border-[','').replace(']','') + '40', background: color.badgeBg.replace('bg-[','').replace(']','') + '12' }}>
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

                        {/* Image */}
                        <div className="relative p-2">
                          <div className="aspect-square rounded-lg overflow-hidden bg-gray-50">
                            <img src={emb.src} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute top-3 right-3 w-4 h-4 rounded-md flex items-center justify-center shadow-sm" style={{ background: color.badgeBg.replace('bg-[','').replace(']','') }}>
                            <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="px-2.5 pb-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">AI Score</span>
                            <span className="text-sm font-black text-gray-800">{emb.aiScore} <span className="text-[10px] font-medium text-gray-400">/ 10</span></span>
                          </div>
                          <div className="h-1 rounded-full bg-gray-100 overflow-hidden mb-2">
                            <div className="h-full rounded-full transition-all" style={{ width: `${emb.aiScore * 10}%`, background: color.barCol.replace('bg-[','').replace(']','') }} />
                          </div>
                          <span className="text-[9px] text-gray-400 font-medium">{emb.quality}</span>
                        </div>

                        {/* ICM / TE / Expansion chips */}
                        <div className="flex gap-1 px-2.5 pb-2.5">
                          {[{ label: 'ICM', value: emb.icm }, { label: 'TE', value: emb.te }, { label: 'Exp', value: emb.expansion }].map(chip => (
                            <div key={chip.label} className="flex-1 rounded-lg bg-gray-50 border border-gray-100 px-1 py-1.5 text-center">
                              <div className="text-[8px] text-gray-400 font-semibold uppercase tracking-wide leading-none mb-0.5">{chip.label}</div>
                              <div className="text-xs font-black text-gray-700">{chip.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Key Metrics — same column template, label fills the first 130px slot */}
                <div className="rounded-xl border border-[#E7E1E1] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#E7E1E1] bg-[#FDFAFF]">
                    <h4 className="text-xs font-bold text-gray-900">Key Metrics</h4>
                  </div>
                  <div className="divide-y divide-[#F0EBF4]">
                    {([
                      { metric: 'Blastocyst Stage',      getValue: (e: LeaderboardEmbryo) => e.blastocystStage },
                      { metric: 'Inner Cell Mass (ICM)',  getValue: (e: LeaderboardEmbryo) => e.icmDesc        },
                      { metric: 'Trophectoderm (TE)',     getValue: (e: LeaderboardEmbryo) => e.teDesc         },
                      { metric: 'Expansion',             getValue: (e: LeaderboardEmbryo) => e.expansionDesc  },
                      { metric: 'Fragmentation',         getValue: (e: LeaderboardEmbryo) => e.fragPct,    bars: (e: LeaderboardEmbryo) => e.fragBars   },
                      { metric: 'Symmetry',              getValue: (e: LeaderboardEmbryo) => e.symText,    bars: (e: LeaderboardEmbryo) => e.symBars    },
                      { metric: 'Zona Pellucida',        getValue: (e: LeaderboardEmbryo) => e.zonaText,   bars: (e: LeaderboardEmbryo) => e.zonaBars   },
                      { metric: 'Blastocoel Quality',    getValue: (e: LeaderboardEmbryo) => e.blastoText, bars: (e: LeaderboardEmbryo) => e.blastoBars },
                    ] as { metric: string; getValue: (e: LeaderboardEmbryo) => string; bars?: (e: LeaderboardEmbryo) => number }[]).map(row => (
                      <div
                        key={row.metric}
                        className="grid"
                        style={{ gridTemplateColumns: `130px repeat(${selectedEmbryoIds.length}, minmax(155px, 220px))` }}
                      >
                        <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 flex items-center border-r border-[#F0EBF4]">{row.metric}</div>
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
