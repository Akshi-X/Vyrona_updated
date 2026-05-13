import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Activity, CheckCircle } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import EmbryosIcon from '../../assets/DashBoardIcons/Embryos.svg';
import Modal from '../../components/Modal';
import FilterPanel, { FilterSelect } from '../../components/FilterPanel';
import { ivfService, type IvfBranch, type IvfCycle, type IvfCycleCreate } from '../../services/ivfService';
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

interface NewEmbryoFormState {
  hisNumber: string;
  patientName: string;
  oocytes: string;
  m2: string;
  m1: string;
  gv: string;
  others: string;
  injected: string;
  cryolockNum: string;
  embryoGrading: string;
  siteName: string;
  branch_id: number | null;
  status: string;
  tankCode: string;
  canisterNum: string;
  caneCode: string;
  gobletColor: string;
  cryolockColor: string;
  description: string;
  injectionMethod: string;
  spermQuality: string;
  oocytesQuality: string;
  cycleType: string;
  opuDate: string;
  incubator_id: number | null;
  chamberPosition: string;
}

interface IncubatorItem {
  incubator_id: number;
  incubator_code: string | null;
  external_id: string | null;
  chamber_r: number | null;
  chamber_c: number | null;
}

export default function EmbryoGradingPage() {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<IvfCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('Active');
  const [isAddEmbryoFormOpen, setIsAddEmbryoFormOpen] = useState(false);
  const [branches, setBranches] = useState<IvfBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [incubators, setIncubators] = useState<IncubatorItem[]>([]);
  const [incubatorsLoading, setIncubatorsLoading] = useState(false);
  const [selectedIncubator, setSelectedIncubator] = useState<IncubatorItem | null>(null);
  const [cycleCreating, setCycleCreating] = useState(false);
  const [allGrades, setAllGrades] = useState<string[]>([]);
  const [newEmbryoForm, setNewEmbryoForm] = useState<NewEmbryoFormState>({
    hisNumber: '',
    patientName: '',
    oocytes: '',
    m2: '',
    m1: '',
    gv: '',
    others: '',
    injected: '',
    cryolockNum: '',
    embryoGrading: '4AA',
    siteName: '',
    branch_id: null,
    status: 'Stored',
    tankCode: '',
    canisterNum: '',
    caneCode: '',
    gobletColor: '',
    cryolockColor: '',
    description: '',
    injectionMethod: '',
    spermQuality: '',
    oocytesQuality: '',
    cycleType: '',
    opuDate: new Date().toISOString().slice(0, 10),
    incubator_id: null,
    chamberPosition: '',
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
    if (active.length === 0) { setAllGrades([]); return; }
    let cancelled = false;
    Promise.all(active.map(c => ivfService.getCycleWithLogs(c.cycle_id)))
      .then(results => {
        if (cancelled) return;
        const grades: string[] = [];
        results.forEach(r => r.logs.forEach(l => {
          if (l.d5_grade) grades.push(l.d5_grade);
          if (l.d6_grade) grades.push(l.d6_grade);
        }));
        setAllGrades(grades);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cycles]);

  useEffect(() => {
    if (!isAddEmbryoFormOpen) return;
    setBranchesLoading(true);
    ivfService.getBranches().then((res) => {
      setBranches(Array.isArray(res?.branches) ? res.branches : []);
    }).catch(() => {
      setBranches([]);
    }).finally(() => setBranchesLoading(false));
  }, [isAddEmbryoFormOpen]);

  const statusOptions = React.useMemo(() => {
    const set = new Set<string>();
    cycles.forEach(c => { if (c.status) set.add(c.status); });
    return ['All', ...Array.from(set).sort()];
  }, [cycles]);

  const activeFilterCount = React.useMemo(() => {
    return selectedStatus !== 'All' ? 1 : 0;
  }, [selectedStatus]);

  const filteredCycles = React.useMemo(() => {
    return cycles.filter(c => selectedStatus === 'All' || c.status === selectedStatus);
  }, [cycles, selectedStatus]);

  const pastCycles = React.useMemo(() => {
    return cycles.filter(c => c.status !== 'Active');
  }, [cycles]);

  const cycleStats = React.useMemo(() => {
    const total = filteredCycles.length;
    const active = filteredCycles.filter(c => c.status === 'Active').length;
    const completed = filteredCycles.filter(c => c.status === 'Completed').length;
    return { total, active, completed };
  }, [filteredCycles]);

  const todayQueue = React.useMemo(() => {
    return cycles
      .filter(c => c.status === 'Active' && c.opu_date)
      .flatMap(c => {
        const day = cycleDay(c.opu_date!);
        const t = DAY_TASKS[day];
        if (!t) return [];
        return [{ cycle: c, day, ...t }];
      })
      .sort((a, b) => {
        const order = { urgent: 0, soon: 1, scheduled: 2 };
        return order[a.urgency] - order[b.urgency];
      });
  }, [cycles]);

  const gradeDistribution = React.useMemo(() => {
    const counts = new Map<string, number>();
    allGrades.forEach(g => counts.set(g, (counts.get(g) ?? 0) + 1));
    const max = Math.max(1, ...Array.from(counts.values()));
    return Array.from(counts.entries())
      .map(([grade, count]) => ({ grade, count, tier: gradeTier(grade), pct: Math.round((count / max) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [allGrades]);

  const resetNewEmbryoForm = () => {
    setNewEmbryoForm({
      hisNumber: '',
      patientName: '',
      oocytes: '',
      m2: '',
      m1: '',
      gv: '',
      others: '',
      injected: '',
      cryolockNum: '',
      embryoGrading: '4AA',
      siteName: '',
      branch_id: null,
      status: 'Stored',
      tankCode: '',
      canisterNum: '',
      caneCode: '',
      gobletColor: '',
      cryolockColor: '',
      description: '',
      injectionMethod: '',
      spermQuality: '',
      oocytesQuality: '',
      cycleType: '',
      opuDate: new Date().toISOString().slice(0, 10),
      incubator_id: null,
      chamberPosition: '',
    });
    setSelectedIncubator(null);
    setIncubators([]);
  };

  const handleNewEmbryoFieldChange = (field: keyof NewEmbryoFormState, value: string | number | null) => {
    setNewEmbryoForm((prev) => {
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

  const handleAddEmbryo = async () => {
    const hisNumber = newEmbryoForm.hisNumber.trim();
    const parseCount = (v: string) => { const n = Number.parseInt(v.trim(), 10); return Number.isFinite(n) && n > 0 ? n : undefined; };
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
      ...(newEmbryoForm.patientName.trim() && { patient_name: newEmbryoForm.patientName.trim() }),
      ...(newEmbryoForm.branch_id != null && { branch_id: newEmbryoForm.branch_id }),
      ...(newEmbryoForm.incubator_id != null && { incubator_id: newEmbryoForm.incubator_id }),
      ...(newEmbryoForm.chamberPosition && { chamber_position: newEmbryoForm.chamberPosition }),
      ...(newEmbryoForm.injectionMethod && { injection_method: newEmbryoForm.injectionMethod }),
      ...(newEmbryoForm.spermQuality && { sperm_quality: newEmbryoForm.spermQuality }),
      ...(newEmbryoForm.oocytesQuality && { oocyte_quality: newEmbryoForm.oocytesQuality }),
      ...(newEmbryoForm.cycleType && { cycle_type: newEmbryoForm.cycleType }),
      ...(newEmbryoForm.opuDate && { opu_date: newEmbryoForm.opuDate }),
      oocyte_m2: parseCount(newEmbryoForm.m2),
      oocyte_m1: parseCount(newEmbryoForm.m1),
      oocyte_gv: parseCount(newEmbryoForm.gv),
      oocyte_others: parseCount(newEmbryoForm.others),
      status: 'Active',
    };

    try {
      const newCycle = await ivfService.createCycle(payload);
      setCycles(prev => [newCycle, ...prev]);
      setIsAddEmbryoFormOpen(false);
      resetNewEmbryoForm();
      navigate(`/embryo-grading/${newCycle.his_id}`);
    } catch {
      // silent
    } finally {
      setCycleCreating(false);
    }
  };

  return (
    <PageLayout
      title="Embryo Grading"
      icon={EmbryosIcon}
      actions={
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <FilterPanel activeCount={activeFilterCount}>
              <FilterSelect
                label="Status"
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={statusOptions}
                allLabel="All Statuses"
              />
            </FilterPanel>
          </div>
          <button
            type="button"
            onClick={() => setIsAddEmbryoFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#6b1176] text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors"
          >
            + Add Cycle
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto overflow-x-hidden min-h-0">

        {/* ── Hero Banner ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-[#E8E1F0] bg-gradient-to-br from-[#F7ECFF] to-white overflow-hidden shrink-0">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A7892]">mG-SCALE · Embryology Lab</p>
                <p className="text-base font-bold text-gray-900 mt-1">Embryo Grading Dashboard</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {todayQueue.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-xs font-semibold text-red-600">{todayQueue.length} due today</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700">Live</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Cycles', value: cycleStats.total,     sub: 'all time',    Icon: Layers,      valCls: 'text-[#6b1176]',    bg: 'bg-white border-[#E8E1F0]'    },
                { label: 'Active',       value: cycleStats.active,    sub: 'in progress', Icon: Activity,    valCls: 'text-emerald-700',  bg: 'bg-white border-[#E6F4EC]'    },
                { label: 'Completed',    value: cycleStats.completed, sub: 'finished',    Icon: CheckCircle, valCls: 'text-sky-700',      bg: 'bg-white border-[#DDEFFA]'    },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border px-4 py-3.5 ${s.bg}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A7892]">{s.label}</p>
                      <p className={`text-4xl font-extrabold leading-none mt-2 ${s.valCls}`}>{s.value}</p>
                      <p className="text-[10px] text-gray-400 mt-1.5">{s.sub}</p>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-[#F7ECFF] flex items-center justify-center shrink-0">
                      <s.Icon size={15} className="text-[#6b1176]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Main 2-col Grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">

          {/* Left — Active Cycles */}
          <div className="flex flex-col gap-3">
            <div className="hidden md:block bg-white border border-[#E7E1E1] rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A7892] mb-2">Filter</p>
              <FilterSelect label="Status" value={selectedStatus} onChange={setSelectedStatus} options={statusOptions} allLabel="All Statuses" />
            </div>

            <div className="bg-white border border-[#E7E1E1] rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0EBF4] bg-gradient-to-r from-[#FDFAFF] to-white shrink-0">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A7892]">Patients</p>
                  <p className="text-sm font-bold text-gray-900">Active Cycles</p>
                </div>
                <span className="text-xs font-bold bg-[#F7ECFF] text-[#6b1176] px-2.5 py-1 rounded-full border border-[#e9d5ff]">{filteredCycles.length}</span>
              </div>

              <div className="overflow-y-auto divide-y divide-[#F8F4FD]" style={{ maxHeight: '560px', scrollbarWidth: 'thin' }}>
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-xs text-gray-400">Loading...</div>
                ) : error ? (
                  <div className="px-4 py-4 text-xs text-red-500">{error}</div>
                ) : filteredCycles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
                    <div className="w-10 h-10 rounded-full bg-[#F7ECFF] flex items-center justify-center">
                      <Layers size={16} className="text-[#6b1176]" />
                    </div>
                    <p className="text-xs font-medium text-gray-500">No cycles found</p>
                  </div>
                ) : (
                  filteredCycles.map(cycle => {
                    const day = cycle.opu_date ? cycleDay(cycle.opu_date) : null;
                    const dayTask = day != null ? DAY_TASKS[day] : null;
                    return (
                      <button
                        key={cycle.cycle_id}
                        type="button"
                        onClick={() => navigate(`/embryo-grading/${cycle.his_id}`)}
                        className="w-full flex items-center gap-0 hover:bg-[#FDFAFF] transition-colors text-left group"
                      >
                        {/* urgency/active accent bar */}
                        <div className={`w-0.5 self-stretch shrink-0 ${
                          dayTask?.urgency === 'urgent' ? 'bg-red-400' :
                          dayTask?.urgency === 'soon'   ? 'bg-amber-400' :
                          dayTask            ? 'bg-sky-400' :
                          'bg-transparent'
                        }`} />

                        <div className="flex-1 min-w-0 px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{cycle.patient_name || '—'}</p>
                            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              cycle.status === 'Active'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              cycle.status === 'Completed' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>{cycle.status || '—'}</span>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[11px] text-[#6b1176] font-semibold">{cycle.his_id}</p>
                            {dayTask && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                dayTask.urgency === 'urgent' ? 'bg-red-50 text-red-600' :
                                dayTask.urgency === 'soon'   ? 'bg-amber-50 text-amber-600' :
                                'bg-sky-50 text-sky-600'
                              }`}>{dayTask.task}</span>
                            )}
                          </div>

                          {day != null && day >= 0 && (
                            <div className="flex items-center gap-1 mt-2">
                              <div className="flex items-center gap-0.5 flex-1">
                                {[1, 2, 3, 4, 5, 6].map(d => (
                                  <div key={d} className={`h-1 flex-1 rounded-full ${day >= d ? 'bg-[#6b1176]' : 'bg-gray-100'}`} />
                                ))}
                              </div>
                              <span className="text-[10px] text-gray-400 ml-2 shrink-0 font-medium">Day {day}</span>
                            </div>
                          )}
                        </div>

                        <svg className="text-gray-200 group-hover:text-[#6b1176] transition-colors mr-3 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right — Queue + Distribution + Past Cycles */}
          <div className="flex flex-col gap-4">

            {/* Today's Queue + Grade Distribution */}
            <div className="grid grid-cols-2 gap-4">

              {/* Today's Queue */}
              <div className="rounded-xl border border-[#E7E1E1] bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-[#F0EBF4] bg-gradient-to-r from-[#FDFAFF] to-white flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A7892]">Today's Queue</p>
                    <p className="text-sm font-bold text-gray-900">Needs Attention</p>
                  </div>
                  {todayQueue.length > 0 ? (
                    <span className="text-[10px] font-bold bg-red-50 text-red-600 px-2.5 py-1 rounded-full border border-red-200">{todayQueue.length} pending</span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-200">All clear</span>
                  )}
                </div>
                <div className="divide-y divide-[#F5F0F8]">
                  {todayQueue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-center px-4">
                      <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center">
                        <CheckCircle size={20} className="text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">All clear for today</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">No grading tasks pending</p>
                      </div>
                    </div>
                  ) : (
                    todayQueue.map(item => (
                      <div
                        key={item.cycle.cycle_id}
                        className="flex cursor-pointer hover:bg-[#FDFAFF] transition-colors group"
                        onClick={() => navigate(`/embryo-grading/${item.cycle.his_id}`)}
                      >
                        <div className={`w-1 shrink-0 rounded-l ${
                          item.urgency === 'urgent' ? 'bg-red-400' :
                          item.urgency === 'soon'   ? 'bg-amber-400' : 'bg-sky-400'
                        }`} />
                        <div className="flex-1 px-3 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">{item.cycle.patient_name || item.cycle.his_id}</p>
                              <p className="text-[10px] text-[#6b1176] font-medium mt-0.5">{item.cycle.his_id} · {item.task}</p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              item.urgency === 'urgent' ? 'bg-red-50 text-red-600 border-red-200' :
                              item.urgency === 'soon'   ? 'bg-amber-50 text-amber-600 border-amber-200' :
                              'bg-sky-50 text-sky-600 border-sky-200'
                            }`}>
                              {item.urgency === 'urgent' ? 'Urgent' : item.urgency === 'soon' ? 'Soon' : 'Scheduled'}
                            </span>
                          </div>
                          {item.cycle.opu_date && (
                            <p className="text-[10px] text-gray-400 mt-1.5">
                              OPU {new Date(item.cycle.opu_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                              <span className="font-semibold text-gray-500"> · {item.dayLabel}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Grade Distribution */}
              <div className="rounded-xl border border-[#E7E1E1] bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-[#F0EBF4] bg-gradient-to-r from-[#FDFAFF] to-white">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A7892]">Grade Distribution</p>
                  <p className="text-sm font-bold text-gray-900">Current Cycle Grades</p>
                </div>
                <div className="px-4 py-4 flex flex-col gap-3">
                  {gradeDistribution.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                      <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center">
                        <Activity size={15} className="text-gray-300" />
                      </div>
                      <p className="text-xs text-gray-400">No blast grades recorded yet</p>
                    </div>
                  ) : (<>
                    {gradeDistribution.map(({ grade, count, tier, pct }) => (
                      <div key={grade} className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-gray-700 w-9 shrink-0 font-mono">{grade}</span>
                        <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tier === 'high' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                              tier === 'mid'  ? 'bg-gradient-to-r from-amber-300 to-amber-500' :
                              'bg-gradient-to-r from-gray-300 to-gray-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-600 w-4 text-right shrink-0">{count}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-4 pt-2.5 border-t border-[#F0EBF4]">
                      {([
                        { label: 'High Grade',  cls: 'bg-emerald-500' },
                        { label: 'Mid Grade',   cls: 'bg-amber-400'   },
                        { label: 'Lower Grade', cls: 'bg-gray-400'    },
                      ] as const).map(l => (
                        <div key={l.label} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${l.cls}`} />
                          <span className="text-[10px] text-gray-500">{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </>)}
                </div>
              </div>
            </div>

            {/* Past Cycles table */}
            <div className="rounded-xl border border-[#E7E1E1] bg-white overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#F0EBF4] bg-gradient-to-r from-[#FDFAFF] to-white">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7892]">All Cycles</p>
                  <p className="text-sm font-bold text-black mt-0.5">Patient Cycle Register</p>
                </div>
                <span className="text-[10px] font-semibold text-[#6b1176] bg-[#F7ECFF] px-2.5 py-1 rounded-full border border-[#e9d5ff]">{pastCycles.length} records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#F0EBF4] bg-[#FDFAFF]">
                      {['HIS No.', 'Patient', 'Method', 'Type', 'Status', 'OPU Date', ''].map((h, i) => (
                        <th key={i} className="text-left text-[10px] font-semibold text-[#8A7892] uppercase tracking-wide px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F8F4FD]">
                    {pastCycles.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">No past cycles yet.</td></tr>
                    ) : (
                      pastCycles.map(c => (
                        <tr key={c.cycle_id} className="hover:bg-[#FDFAFF] transition-colors cursor-pointer group" onClick={() => navigate(`/embryo-grading/${c.his_id}`)}>
                          <td className="px-4 py-3 text-xs font-bold text-[#6b1176]">{c.his_id}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-800 max-w-[140px] truncate">{c.patient_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{c.injection_method || '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{c.cycle_type || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                              c.status === 'Active'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              c.status === 'Completed' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>{c.status || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {c.opu_date ? new Date(c.opu_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-[10px] text-gray-300 group-hover:text-[#6b1176] font-semibold transition-colors">View →</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              const inp = "h-10 rounded-md border border-[#E7E1E1] px-3 text-sm w-full";
              const sel = "h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700 w-full";
              return (<>
                <div className="flex flex-col">
                  <label className={lbl}>HIS Number <span className="text-red-500">*</span></label>
                  <input className={inp} value={newEmbryoForm.hisNumber} onChange={(e) => handleNewEmbryoFieldChange('hisNumber', e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Patient Name</label>
                  <input className={inp} value={newEmbryoForm.patientName} onChange={(e) => handleNewEmbryoFieldChange('patientName', e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>OPU Date</label>
                  <input type="date" className={inp} value={newEmbryoForm.opuDate} onChange={(e) => handleNewEmbryoFieldChange('opuDate', e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Method of Injection</label>
                  <select className={sel} value={newEmbryoForm.injectionMethod} onChange={(e) => handleNewEmbryoFieldChange('injectionMethod', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="ICSI">ICSI</option>
                    <option value="PICSI">PICSI</option>
                    <option value="IMSI">IMSI</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Sperm Quality</label>
                  <select className={sel} value={newEmbryoForm.spermQuality} onChange={(e) => handleNewEmbryoFieldChange('spermQuality', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="Good">Good</option>
                    <option value="Average">Average</option>
                    <option value="Average (NI)">Average (NI)</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Oocytes Quality</label>
                  <select className={sel} value={newEmbryoForm.oocytesQuality} onChange={(e) => handleNewEmbryoFieldChange('oocytesQuality', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="Good">Good</option>
                    <option value="Average">Average</option>
                    <option value="Average to Poor">Average to Poor</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Cycle Type</label>
                  <select className={sel} value={newEmbryoForm.cycleType} onChange={(e) => handleNewEmbryoFieldChange('cycleType', e.target.value)}>
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
                    onChange={(e) => {
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
                    {branches.map(b => (
                      <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className={lbl}>Incubator</label>
                  <select
                    className={`${sel} disabled:opacity-50`}
                    value={newEmbryoForm.incubator_id ?? ""}
                    disabled={incubatorsLoading || !newEmbryoForm.branch_id}
                    onChange={(e) => {
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
            <div className="rounded-lg border border-[#E7E1E1] p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Select Chamber Position
                {newEmbryoForm.chamberPosition && (
                  <span className="ml-2 text-[#6b1176]">— Slot {newEmbryoForm.chamberPosition} selected</span>
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
                            ? 'bg-[#6b1176] text-white scale-105'
                            : 'bg-white text-gray-500 border border-gray-200 hover:border-[#6b1176] hover:text-[#6b1176] hover:scale-105'
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

          <div className="overflow-x-auto rounded-md border border-[#E7E1E1]">
            <table className="w-full text-xs text-center">
              <thead>
                <tr className="bg-gray-50 border-b border-[#E7E1E1]">
                  {(['M2', 'M1', 'GV', 'OTHERS', 'INJECTED', 'OOCYTES'] as const).map((col) => (
                    <React.Fragment key={col}>
                      {col === 'OOCYTES' && <th className="text-gray-300 font-light px-0">/</th>}
                      <th className="px-3 py-2 font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{col}</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {([
                    { key: 'm2' },
                    { key: 'm1' },
                    { key: 'gv' },
                    { key: 'others' },
                    { key: 'injected' },
                    { key: 'oocytes' },
                  ] as { key: keyof NewEmbryoFormState }[]).map(({ key }) => {
                    const isInjected = key === 'injected' || key === 'oocytes';
                    return (
                      <React.Fragment key={key}>
                        {key === 'oocytes' && <td className="text-gray-300 text-sm px-0 text-center">/</td>}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={isInjected ? undefined : 99}
                            disabled={isInjected}
                            className={`w-full min-w-[48px] h-8 rounded border px-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-[#8b2a96] ${isInjected ? 'border-[#E7E1E1] bg-gray-50 text-gray-500 cursor-not-allowed font-semibold' : 'border-[#E7E1E1]'}`}
                            value={newEmbryoForm[key] as string}
                            onChange={(e) => handleNewEmbryoFieldChange(key, e.target.value)}
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
              className="px-3 py-2 rounded-md border border-[#E7E1E1] text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddEmbryo}
              disabled={!newEmbryoForm.hisNumber.trim() || cycleCreating}
              className="px-3 py-2 rounded-md bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0f62] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {cycleCreating && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
              {cycleCreating ? 'Adding...' : 'Add Cycle'}
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}
