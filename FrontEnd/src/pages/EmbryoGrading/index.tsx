import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange, Microscope, ClipboardCheck, Gem, Search, SlidersHorizontal,
  ChevronRight, Eye, MoreHorizontal, Timer, Camera, Clock,
  ShieldAlert, ArrowUpRight,
} from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import EmbryosIcon from '../../assets/DashBoardIcons/Embryos.svg';
import WavePurple from '../../assets/bottom-right1.svg';
import WaveGreen  from '../../assets/bottom-right2.svg';
import WaveBlue   from '../../assets/bottom-right3.svg';
import WaveAmber  from '../../assets/bottom-right4.svg';
import Modal from '../../components/Modal';
import Tooltip from '../../components/Tooltip';
import { ivfService, type IvfBranch, type IvfCycle, type IvfCycleCreate, type IvfCycleWithLogs } from '../../services/ivfService';
import { shipmentService } from '../../services/shipmentService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_TASKS: Record<number, { task: string; dayLabel: string; urgency: 'urgent' | 'soon' | 'scheduled' }> = {
  1: { task: 'Day 1 PN Check',           dayLabel: 'Day 1', urgency: 'scheduled' },
  3: { task: 'Day 3 Cell Count Check',   dayLabel: 'Day 3', urgency: 'urgent'    },
  5: { task: 'Day 5 Blastocyst Grading', dayLabel: 'Day 5', urgency: 'soon'      },
  6: { task: 'Day 6 Final Assessment',   dayLabel: 'Day 6', urgency: 'scheduled' },
};

function cycleDay(opuDate: string): number {
  const opu = new Date(opuDate);
  opu.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - opu.getTime()) / 86_400_000);
}

function gradeTier(grade: string): 'high' | 'mid' | 'low' {
  if (!grade || grade.length < 2) return 'low';
  const expansion = parseInt(grade[0]);
  if (isNaN(expansion)) return 'low';
  const icmTe = grade.slice(1);
  if (expansion >= 4 && (icmTe === 'AA' || icmTe === 'AB' || icmTe === 'BA')) return 'high';
  if (expansion >= 3 && icmTe !== 'CC') return 'mid';
  return 'low';
}

function statusLabel(status: string) {
  return status === 'Active' ? 'In Progress' : status;
}

function statusChipCls(status: string) {
  if (status === 'Active')            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Completed')         return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'Needs Attention')   return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

function gradeChipCls(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-400';
  const t = gradeTier(grade);
  if (t === 'high') return 'bg-green-100 text-green-700';
  if (t === 'mid')  return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, accent, iconBg, wave, trend, waveDown,
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  accent: string;
  iconBg: string;
  wave: string;
  trend?: { value: string; up: boolean };
  waveDown?: boolean;
}) {
  return (
    <div
      className="border border-gray-100 rounded-2xl px-5 py-4 flex items-center justify-between relative overflow-hidden shadow-sm bg-white"
    >
      <img
        src={wave}
        aria-hidden="true"
        alt=""
        className="absolute right-0 w-full pointer-events-none select-none"
        style={{ bottom: waveDown ? '-14px' : '0px' }}
      />

      {/* Text */}
      <div className="relative z-10">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>{label}</p>
        <p className="text-3xl font-extrabold text-gray-900 mt-2 leading-none">{value}</p>
        {trend ? (
          <div className="flex items-center gap-1 mt-2">
            <ArrowUpRight size={11} className="text-emerald-500" />
            <span className="text-[11px] font-semibold text-emerald-500">{trend.value}</span>
            <span className="text-[10px] text-gray-400">{sub}</span>
          </div>
        ) : (
          <p className="text-[10px] text-gray-400 mt-2">{sub}</p>
        )}
      </div>

      {/* Icon with soft circular backdrop */}
      <div
        className="relative z-10 shrink-0 w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
    </div>
  );
}

function DonutChart({ high, mid, low, notGraded, total }: {
  high: number; mid: number; low: number; notGraded: number; total: number;
}) {
  const totalGraded = high + mid + low;

  const segs = [
    { v: high,      light: '#7c1e87', dark: '#6b1176' },
    { v: mid,       light: '#a855c2', dark: '#8b3aa3' },
    { v: low,       light: '#c8a8d8', dark: '#b08cc0' },
    { v: notGraded, light: '#e8d5f0', dark: '#dac4e6' },
  ];

  const stops: string[] = [];
  let curr = 0;
  segs.forEach(s => {
    if (s.v === 0) return;
    const pct = (s.v / (total || 1)) * 100;
    stops.push(`${s.light} ${curr.toFixed(1)}%`);
    stops.push(`${s.dark} ${(curr + pct).toFixed(1)}%`);
    curr += pct;
  });
  if (curr < 100) {
    stops.push(`#e8d5f0 ${curr.toFixed(1)}%`);
    stops.push(`#e8d5f0 100%`);
  }

  const bg = total > 0
    ? `conic-gradient(from -90deg, ${stops.join(', ')})`
    : 'conic-gradient(from -90deg, #e8d5f0 100%)';

  return (
    <div className="relative w-28 h-28 shrink-0">
      <div className="w-full h-full rounded-full" style={{ background: bg }} />
      <div
        className="absolute rounded-full bg-white flex flex-col items-center justify-center pointer-events-none"
        style={{ inset: '20px' }}
      >
        <p className="text-xl font-extrabold text-gray-900 leading-none">{totalGraded}</p>
        <p className="text-[8px] text-gray-400 mt-0.5">Total Graded</p>
      </div>
    </div>
  );
}

function Sparkline({
  points = [3, 4.5, 3.8, 5.2, 4.1, 5.8, 5.5, 6.2, 5.9, 7],
  color = '#6b1176',
  fillOpacity = 0.15,
}: { points?: number[]; color?: string; fillOpacity?: number }) {
  const w = 100, h = 40;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - ((p - min) / range) * (h * 0.75) - h * 0.12,
  }));
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  const gradId = `spkGrad-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={i === coords.length - 1 ? 3 : 2} fill={color} />
      ))}
    </svg>
  );
}

// ── Form state type ───────────────────────────────────────────────────────────

interface NewEmbryoFormState {
  hisNumber: string; patientName: string; oocytes: string;
  m2: string; m1: string; gv: string; others: string; injected: string;
  cryolockNum: string; embryoGrading: string; siteName: string;
  branch_id: number | null; status: string; tankCode: string;
  canisterNum: string; caneCode: string; gobletColor: string;
  cryolockColor: string; description: string; injectionMethod: string;
  spermQuality: string; oocytesQuality: string; cycleType: string;
  opuDate: string; incubator_id: number | null; chamberPosition: string;
}

interface IncubatorItem {
  incubator_id: number;
  incubator_code: string | null;
  external_id: string | null;
  chamber_r: number | null;
  chamber_c: number | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmbryoGradingPage() {
  const navigate = useNavigate();
  const [cycles, setCycles]     = useState<IvfCycle[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [isAddEmbryoFormOpen, setIsAddEmbryoFormOpen] = useState(false);
  const [branches, setBranches] = useState<IvfBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [incubators, setIncubators] = useState<IncubatorItem[]>([]);
  const [incubatorsLoading, setIncubatorsLoading] = useState(false);
  const [selectedIncubator, setSelectedIncubator] = useState<IncubatorItem | null>(null);
  const [cycleCreating, setCycleCreating] = useState(false);
  const [cyclesWithLogs, setCyclesWithLogs] = useState<IvfCycleWithLogs[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [newEmbryoForm, setNewEmbryoForm] = useState<NewEmbryoFormState>({
    hisNumber: '', patientName: '', oocytes: '', m2: '', m1: '', gv: '',
    others: '', injected: '', cryolockNum: '', embryoGrading: '4AA',
    siteName: '', branch_id: null, status: 'Stored', tankCode: '',
    canisterNum: '', caneCode: '', gobletColor: '', cryolockColor: '',
    description: '', injectionMethod: '', spermQuality: '', oocytesQuality: '',
    cycleType: '', opuDate: new Date().toISOString().slice(0, 10),
    incubator_id: null, chamberPosition: '',
  });

  useEffect(() => {
    const fetchCycles = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await ivfService.listCycles();
        setCycles(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load cycles');
      } finally {
        setLoading(false);
      }
    };
    fetchCycles();
  }, []);

  useEffect(() => {
    const active = cycles.filter(c => c.status === 'Active');
    if (active.length === 0) { setCyclesWithLogs([]); return; }
    let cancelled = false;
    Promise.all(active.map(c => ivfService.getCycleWithLogs(c.cycle_id)))
      .then(results => { if (!cancelled) setCyclesWithLogs(results); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cycles]);

  useEffect(() => {
    if (!isAddEmbryoFormOpen) return;
    setBranchesLoading(true);
    ivfService.getBranches().then(res => {
      setBranches(Array.isArray(res?.branches) ? res.branches : []);
    }).catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [isAddEmbryoFormOpen]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const activeCycles = useMemo(() => cycles.filter(c => c.status === 'Active'), [cycles]);
  const completedCycles = useMemo(() => cycles.filter(c => c.status === 'Completed'), [cycles]);

  const filteredActiveCycles = useMemo(() => {
    if (!searchQuery.trim()) return activeCycles;
    const q = searchQuery.toLowerCase();
    return activeCycles.filter(c =>
      c.patient_name?.toLowerCase().includes(q) || c.his_id.toLowerCase().includes(q)
    );
  }, [activeCycles, searchQuery]);

  const allGrades = useMemo(() => {
    const g: string[] = [];
    cyclesWithLogs.forEach(c => c.logs.forEach(l => {
      if (l.d5_grade) g.push(l.d5_grade);
      if (l.d6_grade) g.push(l.d6_grade);
    }));
    return g;
  }, [cyclesWithLogs]);

  const gradingOverview = useMemo(() => {
    let high = 0, mid = 0, low = 0, notGraded = 0;
    cyclesWithLogs.forEach(c => c.logs.forEach(l => {
      const grade = l.d5_grade || l.d6_grade;
      if (!grade) { notGraded++; return; }
      const t = gradeTier(grade);
      if (t === 'high') high++;
      else if (t === 'mid') mid++;
      else low++;
    }));
    return { high, mid, low, notGraded, total: high + mid + low + notGraded };
  }, [cyclesWithLogs]);

  const topGrade = useMemo(() => {
    const hg = allGrades.filter(g => gradeTier(g) === 'high');
    if (!hg.length) return null;
    const counts = new Map<string, number>();
    hg.forEach(g => counts.set(g, (counts.get(g) ?? 0) + 1));
    let best = '', bestN = 0;
    counts.forEach((n, g) => { if (n > bestN) { bestN = n; best = g; } });
    return best || null;
  }, [allGrades]);

  const todayQueue = useMemo(() => cycles
    .filter(c => c.status === 'Active' && c.opu_date)
    .flatMap(c => {
      const day = cycleDay(c.opu_date!);
      const t = DAY_TASKS[day];
      return t ? [{ cycle: c, day, ...t }] : [];
    }), [cycles]);

  const needsAttentionItems = useMemo(() => {
    const overdue   = cycles.filter(c => c.status === 'Active' && c.opu_date && cycleDay(c.opu_date) > 6).length;
    const noBlast   = cyclesWithLogs.filter(c => c.logs.length > 0 && !c.logs.some(l => l.d5_grade || l.d6_grade)).length;
    const lowQual   = cyclesWithLogs.filter(c => c.logs.some(l => { const g = l.d5_grade || l.d6_grade; return g && gradeTier(g) === 'low'; })).length;
    return [
      { Icon: Timer,      label: 'Cycles waiting for grading', sub: `${todayQueue.length} cycles are pending grading`, count: todayQueue.length, iBg: 'bg-orange-50', iCl: 'text-orange-500', cBg: 'bg-orange-50', cCl: 'text-orange-600' },
      { Icon: Camera,     label: 'Images awaiting upload',     sub: `${noBlast} oocytes need images`,                  count: noBlast,           iBg: 'bg-purple-50', iCl: 'text-purple-500', cBg: 'bg-purple-50', cCl: 'text-purple-600' },
      { Icon: Clock,      label: 'Overdue grading',            sub: `${overdue} cycles are overdue`,                   count: overdue,           iBg: 'bg-red-50',    iCl: 'text-red-500',    cBg: 'bg-red-50',    cCl: 'text-red-600'    },
      { Icon: ShieldAlert, label: 'Quality check flagged',     sub: `${lowQual} cycles need review`,                   count: lowQual,           iBg: 'bg-teal-50',   iCl: 'text-teal-500',   cBg: 'bg-teal-50',   cCl: 'text-teal-600'   },
    ];
  }, [cycles, todayQueue, cyclesWithLogs]);

  const recentActivity = useMemo(() =>
    cycles
      .filter(c => c.status === 'Completed')
      .sort((a, b) => {
        if (a.opu_date && b.opu_date) return new Date(b.opu_date).getTime() - new Date(a.opu_date).getTime();
        return 0;
      }),
  [cycles]);

  // ── Form helpers ───────────────────────────────────────────────────────────

  const resetNewEmbryoForm = () => {
    setNewEmbryoForm({
      hisNumber: '', patientName: '', oocytes: '', m2: '', m1: '', gv: '',
      others: '', injected: '', cryolockNum: '', embryoGrading: '4AA',
      siteName: '', branch_id: null, status: 'Stored', tankCode: '',
      canisterNum: '', caneCode: '', gobletColor: '', cryolockColor: '',
      description: '', injectionMethod: '', spermQuality: '', oocytesQuality: '',
      cycleType: '', opuDate: new Date().toISOString().slice(0, 10),
      incubator_id: null, chamberPosition: '',
    });
    setSelectedIncubator(null);
    setIncubators([]);
  };

  const handleNewEmbryoFieldChange = (field: keyof NewEmbryoFormState, value: string | number | null) => {
    setNewEmbryoForm(prev => {
      const next = { ...prev, [field]: value };
      const toNum = (v: string) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
      if (field === 'm2' || field === 'm1' || field === 'others' || field === 'gv') {
        const injected = toNum(next.m2) + toNum(next.m1);
        next.injected = injected > 0 ? String(injected) : '';
        const oocytes = toNum(next.m2) + toNum(next.m1) + toNum(next.gv) + toNum(next.others);
        next.oocytes = oocytes > 0 ? String(oocytes) : '';
      }
      return next;
    });
  };

  const parseCount = (v: string) => { const n = Number.parseInt(v.trim(), 10); return Number.isFinite(n) && n > 0 ? n : undefined; };

  const handleAddEmbryo = async () => {
    const hisNumber = newEmbryoForm.hisNumber.trim();
    const m2 = parseCount(newEmbryoForm.m2) ?? 0;
    const m1 = parseCount(newEmbryoForm.m1) ?? 0;
    const missing: string[] = [];
    if (!hisNumber) missing.push('HIS Number');
    if (!newEmbryoForm.patientName.trim()) missing.push('Patient Name');
    if (!newEmbryoForm.opuDate) missing.push('OPU Date');
    if (!newEmbryoForm.injectionMethod) missing.push('Method of Injection');
    if (!newEmbryoForm.spermQuality) missing.push('Sperm Quality');
    if (!newEmbryoForm.oocytesQuality) missing.push('Oocytes Quality');
    if (!newEmbryoForm.cycleType) missing.push('Cycle Type');
    if (!newEmbryoForm.branch_id) missing.push('Branch');
    if (!newEmbryoForm.incubator_id) missing.push('Incubator');
    if (!newEmbryoForm.chamberPosition) missing.push('Chamber Position');
    if (m2 + m1 === 0) missing.push('At least one injected oocyte (M2 or M1)');
    if (missing.length > 0) {
      alert(`Please fill in the following fields:\n• ${missing.join('\n• ')}`);
      return;
    }
    setCycleCreating(true);
    const payload: IvfCycleCreate = {
      his_id: hisNumber,
      ...(newEmbryoForm.patientName.trim()       && { patient_name:       newEmbryoForm.patientName.trim() }),
      ...(newEmbryoForm.branch_id   != null      && { branch_id:          newEmbryoForm.branch_id }),
      ...(newEmbryoForm.incubator_id != null     && { incubator_id:       newEmbryoForm.incubator_id }),
      ...(newEmbryoForm.chamberPosition          && { chamber_position:   newEmbryoForm.chamberPosition }),
      ...(newEmbryoForm.injectionMethod          && { injection_method:   newEmbryoForm.injectionMethod }),
      ...(newEmbryoForm.spermQuality             && { sperm_quality:      newEmbryoForm.spermQuality }),
      ...(newEmbryoForm.oocytesQuality           && { oocyte_quality:     newEmbryoForm.oocytesQuality }),
      ...(newEmbryoForm.cycleType                && { cycle_type:         newEmbryoForm.cycleType }),
      ...(newEmbryoForm.opuDate                  && { opu_date:           newEmbryoForm.opuDate }),
      oocyte_m2:     parseCount(newEmbryoForm.m2),
      oocyte_m1:     parseCount(newEmbryoForm.m1),
      oocyte_gv:     parseCount(newEmbryoForm.gv),
      oocyte_others: parseCount(newEmbryoForm.others),
      status: 'Active',
    };
    try {
      const newCycle = await ivfService.createCycle(payload);
      setCycles(prev => [newCycle, ...prev]);
      setIsAddEmbryoFormOpen(false);
      resetNewEmbryoForm();
      navigate(`/embryo-console/${newCycle.his_id}`);
    } catch { /* silent */ }
    finally { setCycleCreating(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageLayout
      title="Embryo Console"
      description="Monitor and manage all embryo development cycles across your lab"
      icon={EmbryosIcon}
      actions={
        <button
          type="button"
          onClick={() => setIsAddEmbryoFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors"
        >
          + Add Cycle
        </button>
      }
    >
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto overflow-x-hidden min-h-0">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
          <StatCard
            label="Total Cycles"
            value={cycles.length}
            sub="All time"
            accent="#6b1176"
            iconBg="#f1e8f2"
            wave={WavePurple}
            waveDown
            icon={<CalendarRange size={32} color="#6b1176" strokeWidth={1.5} />}
          />
          <StatCard
            label="Active Cycles"
            value={activeCycles.length}
            sub="In progress"
            accent="#10b981"
            iconBg="#ecf8f3"
            wave={WaveGreen}
            icon={<Microscope size={32} color="#10b981" strokeWidth={1.5} />}
          />
          <StatCard
            label="Completed Cycles"
            value={completedCycles.length}
            sub="Finished cycles"
            accent="#0ea5e9"
            iconBg="#ebf6fd"
            wave={WaveBlue}
            icon={<ClipboardCheck size={32} color="#0ea5e9" strokeWidth={1.5} />}
          />
          <StatCard
            label="Avg. Top Grade"
            value={topGrade ?? 'N/A'}
            sub="vs yesterday"
            accent="#f59e0b"
            iconBg="#fff6ea"
            wave={WaveAmber}
            icon={<Gem size={32} color="#f59e0b" strokeWidth={1.5} />}
            trend={topGrade ? { value: '0.6', up: true } : undefined}
          />
        </div>

        {/* ── 2-col layout: Active Cycles left, everything else right ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[min(340px,26%)_1fr] gap-4 xl:items-stretch xl:flex-1 min-h-0">

          {/* Left — Active Cycles */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-80 xl:max-h-none xl:flex-1">
            {/* Header */}
            <div className="px-4 py-3.5 flex flex-col border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">Active Cycles</p>
                <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">{activeCycles.length}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Click a cycle to view the patient dashboard</p>
            </div>

            {/* Search */}
            <div className="px-3 py-2.5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search by patient or HIS no."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none text-gray-600 placeholder-gray-400"
                />
                <SlidersHorizontal size={13} className="text-gray-400 shrink-0" />
              </div>
            </div>

            {/* Cycle cards */}
            <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
              {loading ? (
                <div className="flex items-center justify-center py-10 text-xs text-gray-400">Loading...</div>
              ) : error ? (
                <div className="px-2 py-3 text-xs text-red-500">{error}</div>
              ) : filteredActiveCycles.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-xs text-gray-400">No cycles found</div>
              ) : (
                filteredActiveCycles.map(cycle => {
                  const day = cycle.opu_date ? cycleDay(cycle.opu_date) : null;
                  return (
                    <button
                      key={cycle.cycle_id}
                      type="button"
                      onClick={() => navigate(`/embryo-console/${cycle.his_id}`)}
                      className="w-full bg-primary/[0.03] border border-primary/10 rounded-xl px-4 py-3 text-left hover:bg-primary/[0.06] hover:border-primary/20 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-gray-900 truncate">{cycle.patient_name || cycle.his_id}</p>
                            <p className="text-[11px] text-gray-400 shrink-0">{day != null ? `Day ${day}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-[11px] text-gray-400 shrink-0">HIS: {cycle.his_id}</p>
                            <div className="flex gap-1 flex-1">
                              {[1, 2, 3, 4, 5, 6].map(d => (
                                <div
                                  key={d}
                                  className={`flex-1 h-[3px] rounded-full ${day != null && day >= d ? 'bg-primary' : 'bg-gray-200'}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-primary shrink-0 mt-0.5" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right — Grading + Needs Attention on top, Recent Activity below */}
          <div className="flex flex-col gap-4 min-h-0 overflow-hidden">

            {/* Top row: Grading Overview + Needs Attention */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">

              {/* Center — Grading Overview + Trend */}
              <div className="flex flex-col gap-3">
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900">Grading Overview</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Embryo quality distribution across all active cycles</p>
                  </div>
                  <div className="p-4 flex items-center gap-5">
                    <DonutChart
                      high={gradingOverview.high}
                      mid={gradingOverview.mid}
                      low={gradingOverview.low}
                      notGraded={gradingOverview.notGraded}
                      total={gradingOverview.total}
                    />
                    <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                      {([
                        {
                          label: 'High Grade',
                          sub: '≥4 expansion · AA, AB, BA',
                          count: gradingOverview.high,
                          color: '#7c1e87',
                          grades: ['4AA','4AB','4BA','5AA','5AB','5BA','6AA','6AB','6BA'],
                          tip: 'Fully expanded blastocyst with excellent inner cell mass and trophectoderm. Best implantation potential.',
                        },
                        {
                          label: 'Mid Grade',
                          sub: '≥3 expansion · non-CC',
                          count: gradingOverview.mid,
                          color: '#a855c2',
                          grades: ['3AA','3AB','3BA','3BB','4BB','4BC','4CB','5BB','5BC','5CB'],
                          tip: 'Expanded or early blastocyst with acceptable morphology. Good implantation potential.',
                        },
                        {
                          label: 'Low Grade',
                          sub: 'expansion 1–2 or CC',
                          count: gradingOverview.low,
                          color: '#c8a8d8',
                          grades: ['1AA','1AB','2AA','2AB','2BB','3CC','4CC'],
                          tip: 'Early or poor-morphology blastocyst. Lower implantation potential — may improve with extended culture.',
                        },
                        {
                          label: 'Not Graded',
                          sub: 'pending assessment',
                          count: gradingOverview.notGraded,
                          color: '#e8d5f0',
                          grades: [],
                          tip: 'Oocyte has not yet reached a gradeable stage.',
                        },
                      ] as const).map(item => {
                        const pct = gradingOverview.total > 0 ? Math.round((item.count / gradingOverview.total) * 100) : 0;
                        return (
                          <Tooltip
                            key={item.label}
                            placement="top"
                            content={
                              <div className="w-56">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                                  <p className="text-xs font-bold text-gray-900">{item.label}</p>
                                </div>
                                <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">{item.tip}</p>
                                {item.grades.length > 0 && (
                                  <>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Example grades</p>
                                    <div className="flex flex-wrap gap-1">
                                      {item.grades.map(g => (
                                        <span key={g} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `${item.color}22`, color: item.color }}>{g}</span>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            }
                          >
                            <div className="flex items-center gap-2 cursor-default">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-gray-700 leading-none">{item.label}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
                              </div>
                              <p className="text-[11px] font-semibold text-gray-800 shrink-0 tabular-nums">
                                {item.count} <span className="font-normal text-gray-400">({pct}%)</span>
                              </p>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Top Grade Trend */}
                <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: 'var(--gradient-primary)' }}>
                  {/* Decorative circles */}
                  <div className="absolute -right-5 -top-5 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
                  <div className="absolute right-6 -bottom-8 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

                  <div className="relative flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-white/60 uppercase tracking-widest font-semibold">Top Grade Trend</p>
                      <div className="flex items-end gap-3 mt-2">
                        <p className="text-4xl font-extrabold text-white leading-none">{topGrade ?? '—'}</p>
                        {topGrade && (
                          <div className="flex items-center gap-1 bg-emerald-400/20 border border-emerald-300/30 rounded-full px-2.5 py-0.5 mb-0.5">
                            <ArrowUpRight size={11} className="text-emerald-300" />
                            <span className="text-[11px] font-bold text-emerald-300">0.6</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-white/40 mt-1.5">vs last week</p>
                    </div>
                    <div className="w-28 h-14 mt-1 shrink-0">
                      <Sparkline color="rgba(255,255,255,0.85)" fillOpacity={0.2} />
                    </div>
                  </div>

                </div>
              </div>

              {/* Right — Needs Attention */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Needs Attention</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Cycles requiring immediate review</p>
                  </div>
                  <button type="button" className="text-xs font-medium text-primary hover:underline">View all</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {needsAttentionItems.map(item => (
                    <div key={item.label} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className={`w-9 h-9 rounded-xl ${item.iBg} flex items-center justify-center shrink-0`}>
                        <item.Icon size={16} className={item.iCl} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 leading-tight">{item.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
                      </div>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${item.count > 0 ? item.cBg : 'bg-gray-100'}`}>
                        <span className={`text-[11px] font-bold ${item.count > 0 ? item.cCl : 'text-gray-400'}`}>{item.count}</span>
                      </div>
                      <ChevronRight size={13} className="text-gray-300 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom — Recent Cycle Activity (fills remaining height) */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-900">Completed Cycles</p>
                  <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">{recentActivity.length}</span>
                </div>
                <button type="button" className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                  View all <ArrowUpRight size={11} />
                </button>
              </div>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">
                      {['HIS No.', 'Patient', 'Day', 'Oocytes', 'Graded', 'Top Grade', 'Status', 'Last Activity', 'Actions'].map(h => (
                        <th key={h} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loading ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400">Loading…</td></tr>
                    ) : recentActivity.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400">No completed cycles yet</td></tr>
                    ) : (
                      recentActivity.map(c => {
                        const day = c.opu_date ? cycleDay(c.opu_date) : null;
                        const totalOocytes = (c.oocyte_m2 ?? 0) + (c.oocyte_m1 ?? 0) + (c.oocyte_gv ?? 0) + (c.oocyte_others ?? 0);
                        const withLogs = cyclesWithLogs.find(w => w.cycle_id === c.cycle_id);
                        const gradedCount = withLogs?.logs.filter(l => l.d5_grade || l.d6_grade).length ?? 0;
                        const gradedPct = totalOocytes > 0 ? Math.round((gradedCount / totalOocytes) * 100) : 0;
                        const cycleTopGrade = withLogs?.logs
                          .flatMap(l => [l.d5_grade, l.d6_grade].filter(Boolean) as string[])
                          .sort((a, b) => {
                            const ta = gradeTier(a), tb = gradeTier(b);
                            if (ta === tb) return 0;
                            return ta === 'high' ? -1 : tb === 'high' ? 1 : ta === 'mid' ? -1 : 1;
                          })[0] ?? null;
                        const actDate = c.opu_date
                          ? new Date(new Date(c.opu_date).getTime() + (day ?? 0) * 86_400_000)
                          : null;
                        const actStr = actDate
                          ? actDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                            actDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                          : '—';

                        return (
                          <tr
                            key={c.cycle_id}
                            className="hover:bg-gray-50/70 transition-colors cursor-pointer group"
                            onClick={() => navigate(`/embryo-console/${c.his_id}`)}
                          >
                            <td className="px-4 py-3 text-xs font-bold text-primary whitespace-nowrap">{c.his_id}</td>
                            <td className="px-4 py-3 text-xs font-medium text-gray-800 truncate max-w-[140px]">{c.patient_name || '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{day != null ? `Day ${day}` : '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">{totalOocytes || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600 shrink-0 tabular-nums">{gradedCount} ({gradedPct}%)</span>
                                <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${gradedPct}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {cycleTopGrade ? (
                                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${gradeChipCls(cycleTopGrade)}`}>
                                  {cycleTopGrade}
                                </span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusChipCls(c.status ?? '')}`}>
                                {statusLabel(c.status ?? '')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{actStr}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/embryo-console/${c.his_id}`)}
                                  className="text-gray-300 hover:text-primary transition-colors"
                                >
                                  <Eye size={14} />
                                </button>
                                <button type="button" className="text-gray-300 hover:text-gray-500 transition-colors">
                                  <MoreHorizontal size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Add Cycle Modal ── */}
      <Modal
        isOpen={isAddEmbryoFormOpen}
        onClose={() => { setIsAddEmbryoFormOpen(false); resetNewEmbryoForm(); }}
        title="Add New Cycle"
        description="Enter cycle details to register a new IVF treatment entry"
        containerClassName="w-full max-w-[750px]"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(() => {
              const lbl = "text-xs text-gray-500 mb-1 ml-0.5";
              const inp = "h-10 rounded-md border border-line px-3 text-sm w-full";
              const sel = "h-10 rounded-md border border-line px-3 text-sm bg-white text-gray-700 w-full";
              return (<>
                <div className="flex flex-col">
                  <label className={lbl}>HIS Number <span className="text-red-500">*</span></label>
                  <input className={inp} value={newEmbryoForm.hisNumber} onChange={e => handleNewEmbryoFieldChange('hisNumber', e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Patient Name</label>
                  <input className={inp} value={newEmbryoForm.patientName} onChange={e => handleNewEmbryoFieldChange('patientName', e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>OPU Date</label>
                  <input type="date" className={inp} value={newEmbryoForm.opuDate} onChange={e => handleNewEmbryoFieldChange('opuDate', e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Method of Injection</label>
                  <select className={sel} value={newEmbryoForm.injectionMethod} onChange={e => handleNewEmbryoFieldChange('injectionMethod', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="ICSI">ICSI</option>
                    <option value="PICSI">PICSI</option>
                    <option value="IMSI">IMSI</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Sperm Quality</label>
                  <select className={sel} value={newEmbryoForm.spermQuality} onChange={e => handleNewEmbryoFieldChange('spermQuality', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="Good">Good</option>
                    <option value="Average">Average</option>
                    <option value="Average (NI)">Average (NI)</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Oocytes Quality</label>
                  <select className={sel} value={newEmbryoForm.oocytesQuality} onChange={e => handleNewEmbryoFieldChange('oocytesQuality', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="Good">Good</option>
                    <option value="Average">Average</option>
                    <option value="Average to Poor">Average to Poor</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Cycle Type</label>
                  <select className={sel} value={newEmbryoForm.cycleType} onChange={e => handleNewEmbryoFieldChange('cycleType', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="DOHSP">Donor Oocytes with Husband's Sperm (DOHSP)</option>
                    <option value="OG">Own Gametes (OG)</option>
                    <option value="DET">Donor Embryo (DET)</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Branch</label>
                  <select
                    className={`${sel} disabled:opacity-50`}
                    value={newEmbryoForm.branch_id ?? ""}
                    disabled={branchesLoading}
                    onChange={e => {
                      const selected = branches.find(b => String(b.branch_id) === e.target.value);
                      handleNewEmbryoFieldChange('branch_id', e.target.value ? Number(e.target.value) : null);
                      handleNewEmbryoFieldChange('siteName', selected?.branch_name ?? "");
                      handleNewEmbryoFieldChange('incubator_id', null);
                      handleNewEmbryoFieldChange('chamberPosition', '');
                      setSelectedIncubator(null);
                      if (selected?.branch_id) {
                        setIncubatorsLoading(true);
                        shipmentService.getActiveIncubators({ branch_id: selected.branch_id })
                          .then(res => {
                            const list = res.branches.find(b => b.branch_id === selected.branch_id)?.incubators ?? [];
                            setIncubators(list);
                          })
                          .catch(() => setIncubators([]))
                          .finally(() => setIncubatorsLoading(false));
                      } else {
                        setIncubators([]);
                      }
                    }}
                  >
                    <option value="">{branchesLoading ? "Loading..." : "— Select —"}</option>
                    {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Incubator</label>
                  <select
                    className={`${sel} disabled:opacity-50`}
                    value={newEmbryoForm.incubator_id ?? ""}
                    disabled={incubatorsLoading || !newEmbryoForm.branch_id}
                    onChange={e => {
                      const inc = incubators.find(i => String(i.incubator_id) === e.target.value) ?? null;
                      handleNewEmbryoFieldChange('incubator_id', e.target.value ? Number(e.target.value) : null);
                      handleNewEmbryoFieldChange('tankCode', inc?.incubator_code ?? inc?.external_id ?? '');
                      handleNewEmbryoFieldChange('chamberPosition', '');
                      setSelectedIncubator(inc);
                    }}
                  >
                    <option value="">
                      {incubatorsLoading ? "Loading..." : !newEmbryoForm.branch_id ? "Select branch first" : "— Select —"}
                    </option>
                    {incubators.map(i => (
                      <option key={i.incubator_id} value={i.incubator_id}>
                        {i.incubator_code || i.external_id || `Incubator #${i.incubator_id}`}
                      </option>
                    ))}
                  </select>
                </div>
              </>);
            })()}
          </div>

          {selectedIncubator && selectedIncubator.chamber_r && selectedIncubator.chamber_c && (
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Select Chamber Position
                {newEmbryoForm.chamberPosition && (
                  <span className="ml-2 text-primary">— Slot {newEmbryoForm.chamberPosition} selected</span>
                )}
              </p>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${selectedIncubator.chamber_c}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: selectedIncubator.chamber_r }).map((_, r) =>
                  Array.from({ length: selectedIncubator.chamber_c! }).map((_, c) => {
                    const pos = String(r * selectedIncubator.chamber_c! + c + 1);
                    const active = newEmbryoForm.chamberPosition === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => handleNewEmbryoFieldChange('chamberPosition', active ? '' : pos)}
                        className={`h-9 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          active
                            ? 'bg-primary text-white scale-105'
                            : 'bg-white text-gray-500 border border-gray-200 hover:border-primary hover:text-primary hover:scale-105'
                        }`}
                      >
                        {pos}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-xs text-center">
              <thead>
                <tr className="bg-gray-50 border-b border-line">
                  {(['M2', 'M1', 'GV', 'OTHERS', 'INJECTED', 'OOCYTES'] as const).map(col => (
                    <React.Fragment key={col}>
                      {col === 'OOCYTES' && <th className="text-gray-300 font-light px-0">/</th>}
                      <th className="px-3 py-2 font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{col}</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(['m2', 'm1', 'gv', 'others', 'injected', 'oocytes'] as (keyof NewEmbryoFormState)[]).map(key => {
                    const isReadOnly = key === 'injected' || key === 'oocytes';
                    return (
                      <React.Fragment key={key}>
                        {key === 'oocytes' && <td className="text-gray-300 text-sm px-0 text-center">/</td>}
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} max={isReadOnly ? undefined : 99}
                            disabled={isReadOnly}
                            className={`w-full min-w-[48px] h-8 rounded border px-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary-light ${isReadOnly ? 'border-line bg-gray-50 text-gray-500 cursor-not-allowed font-semibold' : 'border-line'}`}
                            value={newEmbryoForm[key] as string}
                            onChange={e => handleNewEmbryoFieldChange(key, e.target.value)}
                          />
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setIsAddEmbryoFormOpen(false); resetNewEmbryoForm(); }}
              className="px-3 py-2 rounded-md border border-line text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddEmbryo}
              disabled={!newEmbryoForm.hisNumber.trim() || cycleCreating}
              className="px-3 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-[#5a0f62] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {cycleCreating && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
              {cycleCreating ? 'Adding...' : 'Add Cycle'}
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}
