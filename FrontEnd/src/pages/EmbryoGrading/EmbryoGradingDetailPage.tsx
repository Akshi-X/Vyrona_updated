import React, { useEffect, useState } from 'react';
import { History, FlaskConical, Activity, Sun, Tag, Server, Star } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Modal from '../../components/Modal';
import { ivfService, type IvfCycle, type IvfCycleLog, type IvfCycleWithLogs, type IvfLogUpsert, type ChamberLatestItem } from '../../services/ivfService';
import { activityLogService, type ActivityLogRecord } from '../../services/activityLogService';
import ConfirmDialog from '../../components/ConfirmDialog';
import Tooltip from '../../components/Tooltip';

interface EmbryoGradingDetail {
  grade: string;
  description: string;
  viability: string;
}

interface EmbryologyLogFormState {
  oocyteNo: string;
  oocyteComments: string;
  d0Maturity: string;
  d0DropNo: string;
  d0Notes: string;
  d1Pn: string;
  d1ZygoteStatus: string;
  d1Notes: string;
  day3DropNo: string;
  day3CellCount: string;
  day3Fragmentation: string;
  day3Symmetry: string;
  day3Notes: string;
  day5Stage: string;
  day5ExpansionGrade: string;
  day5IcmGrade: string;
  day5TeGrade: string;
  day5Notes: string;
  day6Stage: string;
  day6ExpansionGrade: string;
  day6IcmGrade: string;
  day6TeGrade: string;
  day6Progression: string;
  day6Notes: string;
  fate: string;
  fzNo: string;
  notes: string;
}

export default function EmbryoGradingDetailPage() {
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const location = useLocation();
  const detailHis = his?.trim().toUpperCase() || '';

  const [cycles, setCycles] = useState<IvfCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<IvfCycleWithLogs | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<ActivityLogRecord[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [chamberHealth, setChamberHealth] = useState<ChamberLatestItem[]>([]);
  const [chamberHealthLoading, setChamberHealthLoading] = useState(false);
  const [isAddLogFormOpen, setIsAddLogFormOpen] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [logModalStep, setLogModalStep] = useState(0);
  const [logForm, setLogForm] = useState<EmbryologyLogFormState>({
    oocyteNo: '',
    oocyteComments: '',
    d0Maturity: 'MII',
    d0DropNo: '',
    d0Notes: '',
    d1Pn: '',
    d1ZygoteStatus: '',
    d1Notes: '',
    day3DropNo: '',
    day3CellCount: '',
    day3Fragmentation: '',
    day3Symmetry: '',
    day3Notes: '',
    day5Stage: '',
    day5ExpansionGrade: '',
    day5IcmGrade: '',
    day5TeGrade: '',
    day5Notes: '',
    day6Stage: '',
    day6ExpansionGrade: '',
    day6IcmGrade: '',
    day6TeGrade: '',
    day6Progression: '',
    day6Notes: '',
    fate: '',
    fzNo: '',
    notes: '',
  });

  const getEmbryoGradingDetails = (grade: string): EmbryoGradingDetail => {
    const gradingData: Record<string, EmbryoGradingDetail> = {
      '4AA': { grade: '4AA', description: 'Excellent quality blastocyst with perfect inner cell mass and trophectoderm morphology.', viability: 'Highest implantation potential' },
      '4AB': { grade: '4AB', description: 'Very good quality blastocyst with excellent inner cell mass but slightly less optimal trophectoderm.', viability: 'Very high implantation potential' },
      '4BA': { grade: '4BA', description: 'Good quality blastocyst with excellent trophectoderm but slightly less optimal inner cell mass.', viability: 'High implantation potential' },
      '4BB': { grade: '4BB', description: 'Good quality blastocyst with balanced morphology between inner cell mass and trophectoderm.', viability: 'Good implantation potential' },
      '3AA': { grade: '3AA', description: 'Expanding blastocyst with excellent cell morphology but not fully expanded.', viability: 'Good implantation potential' },
      '2AA': { grade: '2AA', description: 'Early blastocyst with excellent cell morphology but minimal expansion.', viability: 'Moderate implantation potential' },
    };
    return gradingData[grade] || { grade: grade || 'Unknown', description: 'Grading information not available for this embryo.', viability: 'Unknown' };
  };

  useEffect(() => {
    type GradeResult = { expansion: string; icm: string; te: string };
    type ReturnState = { gradeResult?: GradeResult; savedLogForm?: EmbryologyLogFormState; savedEditingLogId?: number | null };
    const s = location.state as ReturnState | null;
    if (s?.gradeResult && s.savedLogForm) {
      setLogForm({ ...s.savedLogForm, day5ExpansionGrade: s.gradeResult.expansion, day5IcmGrade: s.gradeResult.icm, day5TeGrade: s.gradeResult.te });
      setEditingLogId(s.savedEditingLogId ?? null);
      setLogModalStep(3);
      setIsAddLogFormOpen(true);
      window.history.replaceState({}, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ivfService.listCycles().then(setCycles).catch(() => {});
  }, []);

  useEffect(() => {
    if (!detailHis || cycles.length === 0) return;
    const matched = cycles.find(c => c.his_id.toUpperCase() === detailHis);
    if (!matched) return;
    setLogsLoading(true);
    ivfService.getCycleWithLogs(matched.cycle_id)
      .then(setSelectedCycle)
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, [detailHis, cycles]);

  useEffect(() => {
    if (!selectedCycle) { setTimelineEvents([]); return; }
    setTimelineLoading(true);
    activityLogService.getActivityLogs({
      action_prefix: 'ivf_cycle.',
      metadata_key: 'his_id',
      metadata_value: selectedCycle.his_id,
      page_size: 200,
      page: 1,
    })
      .then(r => setTimelineEvents(r.logs || []))
      .catch(() => setTimelineEvents([]))
      .finally(() => setTimelineLoading(false));
  }, [selectedCycle?.cycle_id, timelineKey]);

  useEffect(() => {
    if (!selectedCycle?.incubator_id) { setChamberHealth([]); return; }
    setChamberHealthLoading(true);
    ivfService.getChamberLatest(selectedCycle.incubator_id, selectedCycle.chamber_position ?? undefined)
      .then(setChamberHealth)
      .catch(() => setChamberHealth([]))
      .finally(() => setChamberHealthLoading(false));
  }, [selectedCycle?.incubator_id, selectedCycle?.chamber_position]);

  const resetLogForm = () => {
    setLogForm({
      oocyteNo: '',
      oocyteComments: '',
      d0Maturity: 'MII',
      d0DropNo: '',
      d0Notes: '',
      d1Pn: '2PN',
      d1ZygoteStatus: '',
      d1Notes: '',
      day3DropNo: '',
      day3CellCount: '',
      day3Fragmentation: '',
      day3Symmetry: '',
      day3Notes: '',
      day5Stage: '',
      day5ExpansionGrade: '',
      day5IcmGrade: '',
      day5TeGrade: '',
      day5Notes: '',
      day6Stage: '',
      day6ExpansionGrade: '',
      day6IcmGrade: '',
      day6TeGrade: '',
      day6Progression: '',
      day6Notes: '',
      fate: '',
      fzNo: '',
      notes: '',
    });
    setLogModalStep(0);
  };

  const handleLogFieldChange = (field: keyof EmbryologyLogFormState, value: string) => {
    setLogForm((prev) => ({ ...prev, [field]: value }));
  };

  const generateDay3Label = (cellCount: string, fragmentation: string): string => {
    if (!cellCount || !fragmentation) return '—';
    return `${cellCount}C${fragmentation}`;
  };

  const generateBlastLabel = (expansion: string, icm: string, te: string): string => {
    if (!expansion || !icm || !te) return '—';
    return `${expansion}${icm}${te}`;
  };

  const getGradeColor = (label: string): string => {
    if (!label || label === '—') return '';
    const icmTe = label.slice(1);
    if (icmTe === 'AA') return 'text-green-600 font-semibold';
    if (icmTe === 'BB') return 'text-yellow-600 font-semibold';
    if (icmTe === 'AB' || icmTe === 'BA') return 'text-amber-600 font-semibold';
    return '';
  };

  const renderBlastBadge = (label: string) => {
    if (!label || label === '—') return <span className="text-gray-400 text-xs">—</span>;
    const expansion = label.charAt(0);
    const icmTe = label.slice(1);
    const isKnownGrade = /^[A-C]{2}$/.test(icmTe);
    if (!isKnownGrade) {
      return <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">{label}</span>;
    }
    const chipClass = icmTe === 'AA' ? 'bg-green-50 border border-green-200' : icmTe === 'BB' ? 'bg-yellow-50 border border-yellow-200' : 'bg-amber-50 border border-amber-200';
    const gradeClass = icmTe === 'AA' ? 'text-green-700' : icmTe === 'BB' ? 'text-yellow-700' : 'text-amber-700';
    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${chipClass}`}>
        <span className="text-gray-400 mr-0.5">{expansion}</span>
        <span className={gradeClass}>{icmTe}</span>
      </span>
    );
  };

  const parseD3Grade = (grade: string | null) => {
    if (!grade) return { cells: '', frag: '' };
    const m = grade.match(/^(\d+)C(\d+)$/);
    return m ? { cells: m[1], frag: m[2] } : { cells: '', frag: '' };
  };

  const parseBlastGrade = (grade: string | null) => {
    if (!grade || grade.length < 3) return { exp: '', icm: '', te: '' };
    return { exp: grade[0], icm: grade[1], te: grade[2] };
  };

  const openEditLog = (log: IvfCycleLog, step: number) => {
    const d3 = parseD3Grade(log.d3_grade);
    const d5 = parseBlastGrade(log.d5_grade);
    const d6 = parseBlastGrade(log.d6_grade);
    setLogForm({
      oocyteNo: String(log.oocyte_no),
      oocyteComments: log.oocyte_comments || '',
      d0Maturity: log.d0_maturity || 'MII',
      d0DropNo: log.d0_drop_no || '',
      d0Notes: log.meta?.d0_notes || '',
      d1Pn: log.d1_pn || '',
      d1ZygoteStatus: log.d1_zygote_status || '',
      d1Notes: log.meta?.d1_notes || '',
      day3DropNo: log.d3_drop_no || '',
      day3CellCount: d3.cells,
      day3Fragmentation: d3.frag,
      day3Symmetry: log.d3_symmetry || '',
      day3Notes: log.meta?.d3_notes || '',
      day5Stage: log.d5_stage || '',
      day5ExpansionGrade: d5.exp,
      day5IcmGrade: d5.icm,
      day5TeGrade: d5.te,
      day5Notes: log.meta?.d5_notes || '',
      day6Stage: log.d6_stage || '',
      day6ExpansionGrade: d6.exp,
      day6IcmGrade: d6.icm,
      day6TeGrade: d6.te,
      day6Progression: log.d6_progression || '',
      day6Notes: log.meta?.d6_notes || '',
      fate: log.fate || '',
      fzNo: log.freeze_no || '',
      notes: log.meta?.final_notes || '',
    });
    setEditingLogId(log.log_id);
    setLogModalStep(Math.min(step, 4));
    setIsAddLogFormOpen(true);
  };

  const handleAddLogEntry = async () => {
    if (!selectedCycle) return;
    setLogSaving(true);

    const day3Grade = generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation);
    const d5Grade = generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade);
    const d6Grade = generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade);

    const meta: Record<string, string> = {};
    if (logForm.d0Notes) meta.d0_notes = logForm.d0Notes;
    if (logForm.d1Notes) meta.d1_notes = logForm.d1Notes;
    if (logForm.day3Notes) meta.d3_notes = logForm.day3Notes;
    if (logForm.day5Notes) meta.d5_notes = logForm.day5Notes;
    if (logForm.day6Notes) meta.d6_notes = logForm.day6Notes;
    if (logForm.notes) meta.final_notes = logForm.notes;

    const payload: IvfLogUpsert = {
      oocyte_no: parseInt(logForm.oocyteNo, 10) || 0,
      ...(logForm.oocyteComments && { oocyte_comments: logForm.oocyteComments }),
      ...(logForm.d0Maturity && { d0_maturity: logForm.d0Maturity }),
      ...(logForm.d0DropNo && { d0_drop_no: logForm.d0DropNo }),
      ...(logForm.d1Pn && { d1_pn: logForm.d1Pn }),
      ...(logForm.d1ZygoteStatus && { d1_zygote_status: logForm.d1ZygoteStatus }),
      ...(logForm.day3DropNo && { d3_drop_no: logForm.day3DropNo }),
      ...(day3Grade !== '—' && { d3_grade: day3Grade }),
      ...(logForm.day3Symmetry && { d3_symmetry: logForm.day3Symmetry }),
      ...(logForm.day5Stage && { d5_stage: logForm.day5Stage }),
      ...(d5Grade !== '—' && { d5_grade: d5Grade }),
      ...(logForm.day6Stage && { d6_stage: logForm.day6Stage }),
      ...(d6Grade !== '—' && { d6_grade: d6Grade }),
      ...(logForm.day6Progression && { d6_progression: logForm.day6Progression }),
      ...(logForm.fate && { fate: logForm.fate }),
      ...(logForm.fzNo && { freeze_no: logForm.fzNo }),
      ...(Object.keys(meta).length > 0 && { meta }),
    };

    try {
      await ivfService.upsertLog(selectedCycle.cycle_id, payload);
      const updated = await ivfService.getCycleWithLogs(selectedCycle.cycle_id);
      setSelectedCycle(updated);
      setTimelineKey(k => k + 1);
    } catch {
      // silent
    } finally {
      setLogSaving(false);
    }

    setEditingLogId(null);
    resetLogForm();
    setIsAddLogFormOpen(false);
  };

  const handleMarkComplete = async () => {
    if (!selectedCycle) return;
    try {
      await ivfService.updateCycle(selectedCycle.cycle_id, { status: 'Completed' });
      setSelectedCycle(prev => prev ? { ...prev, status: 'Completed' } : prev);
    } catch {
      // silent
    }
  };

  const logs = selectedCycle?.logs ?? [];

  const bestGrade = React.useMemo(() => {
    for (const log of logs) { if (log.d5_grade) return log.d5_grade; }
    for (const log of logs) { if (log.d6_grade) return log.d6_grade; }
    return null;
  }, [logs]);

  const primaryGradeDetails = bestGrade ? getEmbryoGradingDetails(bestGrade) : null;

  const logSummary = React.useMemo(() => {
    const totalRows = logs.length;
    const fertilized = logs.filter(l => l.d1_pn === '2PN').length;
    const cleaved = logs.filter(l => l.d3_grade).length;
    const day3GoodGrade = logs.filter(l => {
      const frag = parseD3Grade(l.d3_grade).frag;
      return frag === '1' || frag === '0';
    }).length;
    const blastRows = logs.filter(l => l.d5_grade || l.d6_grade).length;
    const blastGoodGrades = logs
      .filter(l => l.d5_grade || l.d6_grade)
      .map(l => l.d5_grade ? `D5×${l.d5_grade}` : `D6×${l.d6_grade}`)
      .join(', ');
    const frozenRows = logs.filter(l => l.fate?.toLowerCase() === 'freeze').length;
    return { totalRows, fertilized, cleaved, day3GoodGrade, blastRows, blastGoodGrades, frozenRows };
  }, [logs]);

  const calculateDayInCycle = (): string => {
    const base = selectedCycle?.opu_date || selectedCycle?.created_at;
    if (!base) return 'Day 0';
    try {
      const startDate = new Date(base);
      const today = new Date();
      const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
      if (daysDiff <= 0) return 'Day 0';
      return `Day ${daysDiff}`;
    } catch {
      return 'Day 0';
    }
  };

  return (
    <>
      <div className="flex flex-col min-w-0 w-full flex-1 min-h-0 overflow-y-auto">

            {selectedCycle ? (
              <div className="flex flex-col gap-4">
                <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                {/* Cycle Journey */}
                {(() => {
                  const totalOocytes = (selectedCycle.oocyte_m2 ?? 0) + (selectedCycle.oocyte_m1 ?? 0) + (selectedCycle.oocyte_gv ?? 0) + (selectedCycle.oocyte_others ?? 0);
                  const injected = logSummary.totalRows;
                  const pct = (n: number, of: number) => of > 0 ? Math.round((n / of) * 100) : 0;
                  const stages = [
                    { label: 'Oocytes',    value: totalOocytes,             base: totalOocytes,             bar: 'from-[#c084fc] to-[#a855f7]' },
                    { label: 'Injected',   value: injected,                 base: totalOocytes,             bar: 'from-[#d8b4fe] to-primary-muted' },
                    { label: 'Fertilized', value: logSummary.fertilized,    base: injected,                 bar: 'from-[#f9a8d4] to-[#ec4899]' },
                    { label: 'Cleaved',    value: logSummary.cleaved,       base: logSummary.fertilized,    bar: 'from-[#fcd34d] to-[#f59e0b]' },
                    { label: 'Day 3 Good', value: logSummary.day3GoodGrade, base: logSummary.cleaved,       bar: 'from-[#86efac] to-[#22c55e]' },
                    { label: 'Blast',      value: logSummary.blastRows,     base: logSummary.day3GoodGrade, bar: 'from-[#7dd3fc] to-[#0ea5e9]' },
                  ];
                  const breakdown = [
                    { label: 'M2',     value: selectedCycle.oocyte_m2 ?? 0,     color: 'text-white' },
                    { label: 'M1',     value: selectedCycle.oocyte_m1 ?? 0,     color: 'text-white' },
                    { label: 'GV',     value: selectedCycle.oocyte_gv ?? 0,     color: 'text-white/80' },
                    { label: 'Others', value: selectedCycle.oocyte_others ?? 0, color: 'text-white/80' },
                  ];
                  const rawDay = calculateDayInCycle();
                  const dayNum2 = parseInt(rawDay.replace('Day ', ''), 10);
                  const qualityColor = (v: string) => {
                    const l = v.toLowerCase();
                    return l.includes('good') || l.includes('excellent')
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : l.includes('average') || l.includes('moderate')
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : l.includes('poor') || l.includes('bad')
                      ? 'text-rose-700 bg-rose-50 border-rose-200'
                      : 'text-gray-700 bg-gray-50 border-gray-200';
                  };
                  const grade = primaryGradeDetails?.grade;
                  const gradeCls = grade
                    ? grade.slice(1) === 'AA' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : grade.slice(1) === 'BB' ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-primary bg-primary-bg border-primary/20'
                    : '';
                  return (
                    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

                      {/* ── Row 1: Oocyte breakdown header ── */}
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/10">
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest shrink-0">Oocytes</span>
                        <span className="text-xl font-black text-primary">{totalOocytes}</span>
                        <div className="flex items-center gap-2 ml-1">
                          {breakdown.map(b => (
                            <span key={b.label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-primary/20 text-[10px] font-semibold text-gray-700">
                              <span className="font-black text-primary">{b.value}</span>
                              <span className="text-gray-400">{b.label}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* ── Row 2: Funnel stages ── */}
                      <div className="flex items-stretch divide-x divide-gray-100 border-b border-gray-100">
                        {stages.slice(1).map(s => {
                          const percent = pct(s.value, s.base);
                          const pctCls = percent >= 60 ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                                       : percent >= 30 ? 'text-amber-600 bg-amber-50 border-amber-200'
                                       :                 'text-rose-500 bg-rose-50 border-rose-200';
                          return (
                            <div key={s.label} className="flex-1 flex flex-col items-center gap-1 px-3 py-3">
                              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</span>
                              <span className="text-2xl font-black text-gray-900 leading-none tabular-nums">{s.value}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${pctCls}`}>{percent}%</span>
                              <div className="w-full h-1 rounded-full bg-gray-100 mt-1">
                                <div className={`h-full rounded-full bg-gradient-to-r ${s.bar} transition-all duration-700`} style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-3 py-3 bg-primary/[0.03]">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Good Grade</span>
                          {logSummary.blastGoodGrades ? (
                            <div className="flex flex-wrap gap-1 justify-center mt-0.5">
                              {logSummary.blastGoodGrades.split(', ').map(g => (
                                <span key={g} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg text-primary border border-primary/20">{g}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-lg font-black text-gray-300">—</span>
                          )}
                        </div>
                      </div>

                      {/* ── Row 3: Cycle info cards ── */}
                      <div className="grid grid-cols-4 gap-2 p-3 border-t border-gray-100 bg-gray-50/40">

                        {/* Current Day */}
                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm shrink-0">
                            <span className="text-sm font-black text-white leading-none">{dayNum2 >= 0 ? dayNum2 : '—'}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-primary/50 uppercase tracking-widest whitespace-nowrap">Current Day</span>
                            <div className="flex items-center gap-0.5">
                              {[0,1,2,3,4,5,6].map(d => (
                                <div key={d} className={`rounded-full transition-all ${d === dayNum2 ? 'w-3 h-1.5 bg-primary' : d < dayNum2 ? 'w-1.5 h-1.5 bg-primary/50' : 'w-1.5 h-1.5 bg-primary/15'}`} />
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Injection Method */}
                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <FlaskConical size={13} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Injection Method</span>
                            <span className="text-sm font-bold text-gray-800">{selectedCycle.injection_method || '—'}</span>
                          </div>
                        </div>

                        {/* Sperm Quality */}
                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Activity size={13} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Sperm Quality</span>
                            {selectedCycle.sperm_quality ? (
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border w-fit ${qualityColor(selectedCycle.sperm_quality)}`}>{selectedCycle.sperm_quality}</span>
                            ) : (
                              <span className="text-sm font-bold text-gray-800">—</span>
                            )}
                          </div>
                        </div>

                        {/* Oocyte Quality */}
                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Sun size={13} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Oocyte Quality</span>
                            {selectedCycle.oocyte_quality ? (
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border w-fit ${qualityColor(selectedCycle.oocyte_quality)}`}>{selectedCycle.oocyte_quality}</span>
                            ) : (
                              <span className="text-sm font-bold text-gray-800">—</span>
                            )}
                          </div>
                        </div>

                        {/* Type */}
                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Tag size={13} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Type</span>
                            <span className="text-sm font-bold text-gray-800">{selectedCycle.cycle_type || '—'}</span>
                          </div>
                        </div>

                        {/* Chamber + Chamber Health (merged) */}
                        <div className="col-span-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Server size={13} />
                          </div>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Chamber</span>
                            <span className="text-sm font-bold text-gray-800">{String(selectedCycle.chamber_position ?? '—')}</span>
                          </div>
                          <div className="w-px self-stretch bg-gray-100 mx-1 shrink-0" />
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Chamber Health</span>
                            <div className="flex items-center gap-1.5">
                              {[
                                { kpi_name: 'incubator_temp', label: 'T' },
                                { kpi_name: 'incubator_o2',   label: 'O₂' },
                                { kpi_name: 'incubator_co2',  label: 'CO₂' },
                              ].map(def => {
                                const match = chamberHealth.find(h => h.kpi_name === def.kpi_name);
                                const val = chamberHealthLoading ? '…' : match?.value != null ? `${match.value}${match.unit}` : '—';
                                return (
                                  <div key={def.kpi_name} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 border border-primary/10">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{def.label}</span>
                                    <span className="text-[11px] font-black text-primary leading-none">{val}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Best Grade */}
                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Star size={13} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Best Grade</span>
                            {grade ? (
                              <span className={`text-sm font-black px-2 py-0.5 rounded-lg border w-fit ${gradeCls}`}>{grade}</span>
                            ) : (
                              <span className="text-sm font-black text-gray-300">—</span>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}
                </div>

                <div className="w-72 shrink-0 self-stretch flex flex-col rounded-lg border border-line bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-line-light bg-gradient-to-r from-surface to-white">
                    <div className="flex items-center gap-2">
                      <History size={14} className="text-[#8A7892]" />
                      <p className="text-sm font-bold text-gray-900 leading-tight">Recent Activity</p>
                    </div>
                    {timelineEvents.length > 0 && (
                      <span className="text-[10px] font-semibold bg-primary-bg text-primary px-2 py-0.5 rounded-full border border-primary-ring">
                        {timelineEvents.length} events
                      </span>
                    )}
                  </div>

                  <div className="h-[260.5px] overflow-y-auto">
                    {timelineLoading ? (
                      <div className="flex items-center justify-center py-10 text-xs text-gray-400">Loading activity…</div>
                    ) : timelineEvents.length === 0 ? (
                      <div className="flex items-center justify-center py-10 text-xs text-gray-400">No activity recorded yet.</div>
                    ) : (
                      <div className="relative px-4 py-3">
                        <div className="absolute left-[23px] top-3 bottom-3 w-px bg-primary-ring" />
                        <div className="flex flex-col gap-0">
                          {timelineEvents.map((ev, idx) => {
                            const actorName = ev.actor_label
                              || (`${ev.actor_details?.first_name || ''} ${ev.actor_details?.last_name || ''}`.trim())
                              || ev.actor_id
                              || 'System';
                            const branch = ev.actor_details?.branch_name || '';
                            const dt = new Date(ev.created_at);
                            const meta = ev.metadata || {};
                            const chips: string[] = [];
                            if (meta.oocyte_no != null) chips.push(`Oocyte #${meta.oocyte_no}`);
                            if (meta.d1_pn) chips.push(`PN: ${meta.d1_pn}`);
                            if (meta.d3_grade) chips.push(`Grade: ${meta.d3_grade}`);
                            if (meta.d5_grade) chips.push(`Grade: ${meta.d5_grade}`);
                            if (meta.d6_grade) chips.push(`Grade: ${meta.d6_grade}`);
                            if (meta.fate) chips.push(`Fate: ${meta.fate}`);
                            if (meta.injection_method) chips.push(`Method: ${meta.injection_method}`);
                            const LABELS: Record<string, string> = {
                              'ivf_cycle.created': 'Cycle Created',
                              'ivf_cycle.updated': 'Cycle Updated',
                              'ivf_cycle.oocyte_log.d0_saved': 'Day 0 Saved',
                              'ivf_cycle.oocyte_log.d1_updated': 'Day 1 Updated',
                              'ivf_cycle.oocyte_log.d3_updated': 'Day 3 Updated',
                              'ivf_cycle.oocyte_log.d5_updated': 'Day 5 Updated',
                              'ivf_cycle.oocyte_log.d6_updated': 'Day 6 Updated',
                              'ivf_cycle.oocyte_log.fate_set': 'Fate Set',
                            };
                            const label = LABELS[ev.action] || ev.action;
                            const isLast = idx === timelineEvents.length - 1;
                            return (
                              <div key={ev.id} className={`flex gap-3 ${isLast ? 'pb-0' : 'pb-4'}`}>
                                <div className="shrink-0 flex flex-col items-center z-10">
                                  <div className="w-3 h-3 rounded-full bg-primary border-2 border-white ring-1 ring-[#c084fc] mt-1" />
                                </div>
                                <div className="flex-1 min-w-0 bg-surface border border-line-light rounded-lg px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-semibold text-gray-900">{label}</span>
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                                      {dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {chips.length > 0 && (
                                    <p className="text-[11px] text-primary mt-0.5 font-medium">{chips.join(' · ')}</p>
                                  )}
                                  <p className="text-[10px] text-gray-500 mt-1">
                                    {actorName}{branch ? <span className="text-gray-400"> · {branch}</span> : ''}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </div>

                {(() => {
                  const dayNum = parseInt(calculateDayInCycle().replace('Day ', ''), 10);
                  const activeCol = dayNum <= 0 ? 0 : dayNum <= 2 ? 1 : dayNum <= 4 ? 2 : dayNum === 5 ? 3 : 4;
                  const isFilled = (col: number, log: IvfCycleLog) => {
                    switch (col) {
                      case 0: return Boolean(log.d0_drop_no);
                      case 1: return Boolean(log.d1_pn);
                      case 2: return Boolean(log.d3_grade);
                      case 3: return Boolean(log.d5_grade);
                      case 4: return Boolean(log.d6_grade);
                      default: return true;
                    }
                  };
                  const thCls = () => 'px-2 py-2 text-left font-semibold';
                  const tdCls = (col: number, log: IvfCycleLog, extra = '') => {
                    const needsFill = col <= activeCol && !isFilled(col, log);
                    return `px-2 py-2 cursor-pointer transition-colors ${extra} ${needsFill ? 'bg-primary-bg hover:bg-[#ecd9f9]' : 'hover:bg-primary-bg/60'}`;
                  };
                  const fillPrompts: Record<number, string> = {
                    0: 'Kindly fill Drop No',
                    1: 'Kindly fill PN Status',
                    2: 'Kindly fill Day 3 Grade',
                    3: 'Kindly fill Day 5 Grade',
                    4: 'Kindly fill Day 6 Grade',
                  };
                  const tdTitle = (col: number, log: IvfCycleLog) =>
                    col <= activeCol && !isFilled(col, log) ? fillPrompts[col] : undefined;
                  return (
                    <div className="rounded-lg border border-line overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-[1320px] w-full text-sm">
                          <thead className="bg-[#E4C9F5] text-primary">
                            <tr className="divide-x divide-line">
                              <th className={thCls()}>Oocyte</th>
                              <th className={thCls()}>Day 1 (PN)</th>
                              <th className={thCls()}>Day 3/4</th>
                              <th className={thCls()}>Day 5</th>
                              <th className={thCls()}>Day 6</th>
                              <th className="px-2 py-2 text-left font-semibold">Fate</th>
                              <th className="px-2 py-2 text-left font-semibold">Notes</th>
                              <th className="px-2 py-2 text-left font-semibold w-24 sticky right-0 z-10 bg-[#E4C9F5] border-l border-line">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logsLoading ? (
                              <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">Loading logs…</td></tr>
                            ) : logs.length === 0 ? (
                              <tr>
                                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">No log entries yet. Click Add Oocyte.</td>
                              </tr>
                            ) : (
                              logs.map((log) => (
                                <tr key={log.log_id} className="border-t border-line divide-x divide-line">
                                  <td className={tdCls(0, log, 'whitespace-nowrap')} onClick={() => openEditLog(log, 0)}>
                                    <Tooltip text={tdTitle(0, log)}>
                                      <div>
                                        <div className="font-medium">#{log.oocyte_no}</div>
                                        <div className="text-[10px] text-gray-400">{log.d0_maturity || '—'}{log.d0_drop_no ? ` · Drop ${log.d0_drop_no}` : ''}</div>
                                      </div>
                                    </Tooltip>
                                  </td>
                                  <td className={tdCls(1, log)} onClick={() => openEditLog(log, 1)}>
                                    <Tooltip text={tdTitle(1, log)}><span>{log.d1_pn || '—'}</span></Tooltip>
                                  </td>
                                  <td className={`${tdCls(2, log)} text-center`} onClick={() => openEditLog(log, 2)}>
                                    <Tooltip text={tdTitle(2, log)}>
                                      {log.d3_grade
                                        ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-bold bg-primary-bg text-primary">{log.d3_grade}</span>
                                        : <span className="text-gray-400 text-xs">—</span>}
                                    </Tooltip>
                                  </td>
                                  <td className={`${tdCls(3, log)} text-center`} onClick={() => openEditLog(log, 3)}>
                                    <Tooltip text={tdTitle(3, log)}><span>{renderBlastBadge(log.d5_grade || '—')}</span></Tooltip>
                                  </td>
                                  <td className={`${tdCls(4, log)} text-center`} onClick={() => openEditLog(log, 4)}>
                                    <Tooltip text={tdTitle(4, log)}><span>{renderBlastBadge(log.d6_grade || '—')}</span></Tooltip>
                                  </td>
                                  <td className="px-2 py-2 cursor-pointer hover:bg-primary-bg/60 transition-colors" onClick={() => openEditLog(log, 4)}>
                                    <div className="flex items-center gap-1.5">
                                      {log.fate === 'Freeze' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-sm font-semibold border border-sky-200">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 7l-5 5-5-5"/><path d="M17 17l-5-5-5 5"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M7 7l5 5 5-5"/><path d="M7 17l5-5 5 5"/></svg>
                                          Freeze
                                        </span>
                                      ) : log.fate === 'Transfer' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-200">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                                          Transfer
                                        </span>
                                      ) : log.fate === 'Discard' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-sm font-semibold border border-red-200">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                          Discard
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                      {log.fate === 'Freeze' && log.freeze_no && (
                                        <span className="text-xs text-gray-400 font-medium">#{log.freeze_no}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-xs text-gray-500">{log.meta?.final_notes || '—'}</td>
                                  <td className="px-2 py-2 flex gap-1 sticky right-0 z-10 bg-white border-l border-line">
                                    <button
                                      type="button"
                                      onClick={() => openEditLog(log, 0)}
                                      className="px-2 py-1 text-xs border border-primary/30 text-primary rounded font-medium hover:bg-primary/5 transition-colors"
                                      title="Update entry"
                                    >
                                      Update
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsAddLogFormOpen(true)}
                    className="px-2.5 py-1.5 rounded bg-primary text-white text-sm font-medium hover:bg-[#5a0f62] transition-colors"
                  >
                    Add Oocyte
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCompleteConfirm(true)}
                    disabled={selectedCycle?.status === 'Completed'}
                    className="px-3 py-1.5 rounded border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {selectedCycle?.status === 'Completed' ? 'Completed' : 'Review & Complete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p>Loading cycle…</p>
              </div>
            )}
      </div>

      <Modal
        isOpen={isAddLogFormOpen}
        onClose={() => { setIsAddLogFormOpen(false); resetLogForm(); setEditingLogId(null); }}
        title={editingLogId ? "Edit Log Entry" : "Add Log Entry"}
        description={editingLogId ? "Update embryology sheet details for the selected entry" : "Enter embryology sheet details for the selected HIS"}
        containerClassName="w-full max-w-[680px]"
      >
        {(() => {
          const inp = "w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-muted/30 focus:border-primary-muted bg-white";
          const sel = inp;
          const lbl = "block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1";
          const day6Locked = logForm.day5Stage === 'Blastocyst';
          const blastGradeFields5 = logForm.day5ExpansionGrade && logForm.day5IcmGrade && logForm.day5TeGrade;
          const blastGradeFields6 = logForm.day6ExpansionGrade && logForm.day6IcmGrade && logForm.day6TeGrade;

          const STEP_BASE = { activeBg: 'bg-primary', doneBg: 'bg-primary-muted', ring: 'ring-primary-muted', lineActive: 'bg-primary-ring', textActive: 'text-primary', border: 'border-line', headerBg: 'bg-gradient-to-r from-[#3b0764] to-primary', chipCls: 'bg-primary-bg border-[#c084fc]/40 text-primary' };
          const STEPS = [
            { dayKey: 'D0', label: 'Day 0', sub: 'Fertilization',                   ...STEP_BASE },
            { dayKey: 'D1', label: 'Day 1', sub: 'PN Check',                        ...STEP_BASE },
            { dayKey: 'D3', label: 'Day 3', sub: 'Cleavage',                        ...STEP_BASE },
            { dayKey: 'D5', label: 'Day 5', sub: 'Blastocyst',                      ...STEP_BASE },
            { dayKey: 'D6', label: 'Day 6', sub: day6Locked ? 'N/A' : 'Late Blast', ...STEP_BASE, activeBg: day6Locked ? 'bg-gray-400' : 'bg-primary', headerBg: day6Locked ? 'bg-gray-400' : 'bg-gradient-to-r from-[#3b0764] to-primary' },
          ];

          const stepSummary = (i: number): string => {
            if (i === 0) { const p: string[] = []; if (logForm.d0Maturity) p.push(logForm.d0Maturity); if (logForm.d0DropNo) p.push(`Drop ${logForm.d0DropNo}`); return p.join(' · ') || '—'; }
            if (i === 1) { return logForm.d1Pn || '—'; }
            if (i === 2) { const l = generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation); return l !== '—' ? l : (logForm.day3CellCount ? `${logForm.day3CellCount}C` : '—'); }
            if (i === 3) { if (logForm.day5Stage === 'Blastocyst' && blastGradeFields5) return generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade); return logForm.day5Stage || '—'; }
            if (i === 4) { if (day6Locked) return 'N/A'; if (logForm.day6Stage === 'Blastocyst' && blastGradeFields6) return generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade); return logForm.day6Stage || '—'; }
            return logForm.fate || '—';
          };

          const s = STEPS[Math.min(logModalStep, STEPS.length - 1)];

          return (
            <div className="flex flex-col gap-4">
              {/* Identity bar */}
              <div className="rounded-2xl bg-gradient-to-br from-[#3b0764] via-primary to-[#4a044e] border border-primary-muted/40 shadow-lg px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-primary-ring/60">HIS</span>
                  <p className="text-white font-bold text-sm leading-tight">{selectedCycle?.his_id || '—'}</p>
                  <p className="text-primary-ring/70 text-xs mt-0.5">{selectedCycle?.patient_name || '—'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary-ring/60 mb-1">Oocyte No</span>
                    <input
                      className="bg-transparent border border-white/30 rounded-lg text-white font-bold text-sm w-20 h-8 px-2 text-center focus:outline-none focus:border-white/70 placeholder:text-white/30"
                      placeholder="#"
                      value={logForm.oocyteNo}
                      onChange={(e) => handleLogFieldChange('oocyteNo', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Step indicator */}
              <div className="flex items-start">
                {STEPS.map((step, i) => (
                  <React.Fragment key={step.label}>
                    <button
                      type="button"
                      className="flex flex-col items-center gap-1 min-w-[52px] focus:outline-none group"
                      onClick={() => setLogModalStep(i)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                        i < logModalStep
                          ? `${step.doneBg} text-white`
                          : i === logModalStep
                          ? `${step.activeBg} text-white ring-2 ${step.ring} ring-offset-2 scale-110`
                          : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                      }`}>
                        {i < logModalStep ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        ) : (
                          <span className="text-[9px]">{step.dayKey}</span>
                        )}
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wide leading-none mt-1 ${i === logModalStep ? step.textActive : 'text-gray-400'}`}>{step.label}</span>
                      <span className={`text-[9px] leading-none ${i === logModalStep ? step.textActive + '/80' : 'text-gray-300'}`}>{step.sub}</span>
                    </button>
                    {i < 4 && (
                      <div className={`flex-1 h-0.5 mt-4 transition-colors duration-300 ${i < logModalStep ? step.lineActive : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Completed step chips */}
              {logModalStep > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {STEPS.slice(0, logModalStep).map((step, i) => (
                    <button
                      key={step.label}
                      type="button"
                      onClick={() => setLogModalStep(i)}
                      className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all hover:scale-105 ${step.chipCls}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span className="opacity-60 uppercase tracking-wide">{step.label}</span>
                      <span className="font-black">{stepSummary(i)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active step form */}
              <div className={`rounded-xl border ${s.border} overflow-hidden shadow-sm`}>
                <div className={`${s.headerBg} px-4 py-3 flex items-center justify-between`}>
                  <div>
                    <p className="text-white font-black text-sm tracking-tight">{s.label}</p>
                    <p className="text-white/70 text-[11px]">{s.sub}</p>
                  </div>
                  <span className="text-white/50 text-xs font-semibold">{logModalStep + 1} / 6</span>
                </div>
                <div className="bg-white p-5">

                  {/* Day 0 */}
                  {logModalStep === 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={lbl}>Maturity</label>
                        <select className={sel} value={logForm.d0Maturity} onChange={(e) => handleLogFieldChange('d0Maturity', e.target.value)}>
                          <option value="MII">MII</option>
                          <option value="MI">MI</option>
                          <option value="GV">GV</option>
                          <option value="Others">Others</option>
                        </select>
                      </div>
                      <div><label className={lbl}>Drop No</label><input className={inp} placeholder="Drop number" value={logForm.d0DropNo} onChange={(e) => handleLogFieldChange('d0DropNo', e.target.value)} /></div>
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 0 notes…" value={logForm.d0Notes} onChange={(e) => handleLogFieldChange('d0Notes', e.target.value)} /></div>
                    </div>
                  )}

                  {/* Day 1 */}
                  {logModalStep === 1 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={lbl}>PN Status</label>
                        <select className={sel} value={logForm.d1Pn} onChange={(e) => handleLogFieldChange('d1Pn', e.target.value)}>
                          <option value="">— Select —</option>
                          <option value="2PN">2PN ✓</option>
                          <option value="1PN">1PN</option>
                          <option value="3PN">3PN</option>
                          <option value="0PN">0PN</option>
                          <option value="Degenerated">Degenerated</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Zygote Status</label>
                        <select className={sel} value={logForm.d1ZygoteStatus} onChange={(e) => handleLogFieldChange('d1ZygoteStatus', e.target.value)}>
                          <option value="">—</option>
                          <option value="Normal">Normal</option>
                          <option value="Abnormal">Abnormal</option>
                        </select>
                      </div>
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 1 notes…" value={logForm.d1Notes} onChange={(e) => handleLogFieldChange('d1Notes', e.target.value)} /></div>
                    </div>
                  )}

                  {/* Day 3 */}
                  {logModalStep === 2 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className={lbl}>Drop No</label><input className={inp} placeholder="Drop number" value={logForm.day3DropNo} onChange={(e) => handleLogFieldChange('day3DropNo', e.target.value)} /></div>
                      <div />
                      <div>
                        <label className={lbl}>Cell Count</label>
                        <select className={sel} value={logForm.day3CellCount} onChange={(e) => handleLogFieldChange('day3CellCount', e.target.value)}>
                          <option value="">—</option>
                          {['2','3','4','5','6','7','8','9+'].map(v => <option key={v} value={v}>{v} cells</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Fragmentation</label>
                        <select className={sel} value={logForm.day3Fragmentation} onChange={(e) => handleLogFieldChange('day3Fragmentation', e.target.value)}>
                          <option value="">—</option>
                          <option value="1">Grade 1 (≤10%)</option>
                          <option value="2">Grade 2 (10–25%)</option>
                          <option value="3">Grade 3 (25–50%)</option>
                          <option value="4">Grade 4 (&gt;50%)</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Symmetry</label>
                        <select className={sel} value={logForm.day3Symmetry} onChange={(e) => handleLogFieldChange('day3Symmetry', e.target.value)}>
                          <option value="">—</option>
                          <option value="Even">Even</option>
                          <option value="Slightly uneven">Slightly uneven</option>
                          <option value="Uneven">Uneven</option>
                        </select>
                      </div>
                      {logForm.day3CellCount && logForm.day3Fragmentation && (
                        <div className="flex items-end">
                          <div className="w-full rounded-xl bg-primary-bg border border-[#c084fc]/40 px-3 py-2.5 text-center">
                            <span className="text-[10px] text-primary-muted uppercase tracking-wide block mb-0.5">Auto Grade</span>
                            <span className="text-2xl font-black text-primary">{generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation)}</span>
                          </div>
                        </div>
                      )}
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 3 notes…" value={logForm.day3Notes} onChange={(e) => handleLogFieldChange('day3Notes', e.target.value)} /></div>
                    </div>
                  )}

                  {/* Day 5 */}
                  {logModalStep === 3 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className={lbl}>Stage</label>
                        <select className={sel} value={logForm.day5Stage} onChange={(e) => handleLogFieldChange('day5Stage', e.target.value)}>
                          <option value="">—</option>
                          <option value="Cleavage">Cleavage</option>
                          <option value="Morula">Morula</option>
                          <option value="Early Blast">Early Blast</option>
                          <option value="Blastocyst">Blastocyst ⭐</option>
                        </select>
                      </div>
                      {logForm.day5Stage === 'Blastocyst' && (
                        <div className="col-span-2">
                          {blastGradeFields5 ? (
                            <div className="w-full rounded-xl bg-primary-bg border border-[#c084fc]/40 px-3 py-2.5 text-center">
                              <span className="text-[10px] text-primary-muted uppercase tracking-wide block mb-0.5">D5 Grade</span>
                              <span className={`text-2xl font-black ${getGradeColor(generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade))}`}>{generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade)}</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigate(`/embryo-console/${his}/ai-grading`, { state: { savedLogForm: logForm, savedEditingLogId: editingLogId } })}
                              className="w-full px-4 py-3 rounded-lg bg-[#3b0764] text-white text-sm font-semibold hover:bg-primary transition-colors"
                            >
                              Start AI Grading
                            </button>
                          )}
                        </div>
                      )}
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 5 notes…" value={logForm.day5Notes} onChange={(e) => handleLogFieldChange('day5Notes', e.target.value)} /></div>
                    </div>
                  )}

                  {/* Day 6 */}
                  {logModalStep === 4 && (
                    day6Locked ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl mb-1">🧊</div>
                        <p className="text-sm font-semibold text-gray-500">Blastocyst reached on Day 5</p>
                        <p className="text-xs text-gray-400">Day 6 evaluation not required</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className={lbl}>Stage</label>
                          <select className={sel} value={logForm.day6Stage} onChange={(e) => handleLogFieldChange('day6Stage', e.target.value)}>
                            <option value="">—</option>
                            <option value="Cleavage">Cleavage</option>
                            <option value="Morula">Morula</option>
                            <option value="Early Blast">Early Blast</option>
                            <option value="Blastocyst">Blastocyst</option>
                          </select>
                        </div>
                        {logForm.day6Stage === 'Blastocyst' && (<>
                          <div>
                            <label className={lbl}>Expansion Grade</label>
                            <select className={sel} value={logForm.day6ExpansionGrade} onChange={(e) => handleLogFieldChange('day6ExpansionGrade', e.target.value)}>
                              <option value="">—</option>
                              {['1','2','3','4','5','6'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>ICM Grade</label>
                            <select className={sel} value={logForm.day6IcmGrade} onChange={(e) => handleLogFieldChange('day6IcmGrade', e.target.value)}>
                              <option value="">—</option>
                              {['A','B','C'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>TE Grade</label>
                            <select className={sel} value={logForm.day6TeGrade} onChange={(e) => handleLogFieldChange('day6TeGrade', e.target.value)}>
                              <option value="">—</option>
                              {['A','B','C'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          {blastGradeFields6 && (
                            <div className="flex items-end">
                              <div className="w-full rounded-xl bg-primary-bg border border-[#c084fc]/40 px-3 py-2.5 text-center">
                                <span className="text-[10px] text-primary-muted uppercase tracking-wide block mb-0.5">D6 Grade</span>
                                <span className={`text-2xl font-black ${getGradeColor(generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade))}`}>{generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade)}</span>
                              </div>
                            </div>
                          )}
                        </>)}
                        {logForm.day6Stage && (
                          <div className="col-span-2">
                            <label className={lbl}>Progression vs Day 5</label>
                            <select className={sel} value={logForm.day6Progression} onChange={(e) => handleLogFieldChange('day6Progression', e.target.value)}>
                              <option value="">—</option>
                              <option value="Delayed development">Delayed development</option>
                              <option value="Same as Day 5">Same as Day 5</option>
                              <option value="Improved">Improved</option>
                              <option value="Degenerated">Degenerated</option>
                            </select>
                          </div>
                        )}
                        <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 6 notes…" value={logForm.day6Notes} onChange={(e) => handleLogFieldChange('day6Notes', e.target.value)} /></div>
                      </div>
                    )
                  )}

                </div>
              </div>

              {/* Persistent Fate */}
              <div className="rounded-xl border border-line bg-surface overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
                  <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Fate</p>
                  {logForm.fate && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${logForm.fate === 'Discard' ? 'bg-red-50 text-red-500 border border-red-200' : logForm.fate === 'Freeze' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                      {logForm.fate}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-3">
                  <div className={logForm.fate === 'Freeze' ? '' : 'col-span-2'}>
                    <label className={lbl}>Embryo Fate</label>
                    <select className={sel} value={logForm.fate} onChange={(e) => handleLogFieldChange('fate', e.target.value)}>
                      <option value="">— Select fate —</option>
                      <option value="Freeze">❄️ Freeze</option>
                      <option value="Transfer">🧬 Transfer</option>
                      <option value="Discard">❌ Discard</option>
                    </select>
                  </div>
                  {logForm.fate === 'Freeze' && (
                    <div>
                      <label className={lbl}>Freeze ID</label>
                      <input className={inp} placeholder="#1, #2…" value={logForm.fzNo} onChange={(e) => handleLogFieldChange('fzNo', e.target.value)} />
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className={lbl}>Notes</label>
                    <input className={inp} placeholder="Add notes…" value={logForm.notes} onChange={(e) => handleLogFieldChange('notes', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center pt-1 border-t border-gray-100">
                <button type="button" onClick={() => { setIsAddLogFormOpen(false); resetLogForm(); setEditingLogId(null); }}
                  className="px-4 py-2.5 rounded-xl border border-primary-muted/40 text-primary text-sm font-semibold hover:bg-[#f8f0fb] transition-colors">
                  Cancel
                </button>
                <div className="flex-1 flex items-center justify-center gap-2">
                  {logModalStep > 0 && (
                    <button type="button" onClick={() => setLogModalStep(prev => prev - 1)}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 2L4 6.5l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Back
                    </button>
                  )}
                  {logModalStep < 4 && (
                    <button type="button" onClick={() => setLogModalStep(prev => prev + 1)}
                      className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                      Next
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4.5 2L9 6.5 4.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  )}
                </div>
                <button type="button" onClick={handleAddLogEntry} disabled={logSaving}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#3b0764] to-primary-muted text-white text-sm font-bold shadow-md hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
                  {logSaving && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                  {editingLogId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {showCompleteConfirm && (
        <ConfirmDialog
          title="Review & Complete"
          message="Are you sure you want to mark this cycle as Completed? This cannot be undone."
          confirmLabel="Complete"
          onConfirm={() => { setShowCompleteConfirm(false); handleMarkComplete(); }}
          onCancel={() => setShowCompleteConfirm(false)}
          confirmClassName="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        />
      )}
    </>
  );
}
