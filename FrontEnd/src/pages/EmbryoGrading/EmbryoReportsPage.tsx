import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Download, Printer, Share2, RefreshCw, Check,
  Microscope, Snowflake, Zap, Sun, CircleDot, Circle, MoreHorizontal,
  Layers, CalendarDays, FileText, Pencil, X, Building2,
} from 'lucide-react';
const mGScaleLogo = '/mGScaleDark.svg';
import { ivfService, type IvfCycle, type IvfCycleLog, type IvfCycleWithLogs } from '../../services/ivfService';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, ChartTooltip);

const fmt = (v: string | number | null | undefined): string => v != null ? String(v) : '—';

const parseD3 = (g: string | null) => {
  if (!g) return null;
  const m = g.match(/^(\d+)C(\d+)$/);
  return m ? `${m[1]}C${m[2]}` : g;
};

const gradeChip = (grade: string | null, day: 'd3' | 'd5' | 'd6') => {
  if (!grade) return <span className="text-gray-300 text-[10px]">—</span>;
  if (day === 'd3') {
    return (
      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary-bg text-primary">
        {grade}
      </span>
    );
  }
  const icmTe = grade.slice(1);
  const cls = icmTe === 'AA' ? 'bg-green-100 text-green-700'
    : icmTe === 'BB' ? 'bg-yellow-100 text-yellow-700'
    : 'bg-amber-100 text-amber-700';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {grade}
    </span>
  );
};

const fateChip = (fate: string | null) => {
  if (!fate) return <span className="text-gray-300 text-[10px]">—</span>;
  const map: Record<string, string> = {
    Frozen: 'bg-blue-100 text-blue-700',
    Transferred: 'bg-green-100 text-green-700',
    Discarded: 'bg-red-100 text-red-700',
    Biopsied: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${map[fate] ?? 'bg-gray-100 text-gray-600'}`}>
      {fate}
    </span>
  );
};

const SECTIONS = [
  { id: 'patient',    label: 'Patient & Cycle Details',   defaultOn: true  },
  { id: 'summary',    label: 'Embryo Summary',             defaultOn: true  },
  { id: 'log',        label: 'Embryo Development Log',     defaultOn: true  },
  { id: 'quality',    label: 'Quality Monitoring',         defaultOn: true  },
  { id: 'images',     label: 'Embryo Images',              defaultOn: false },
  { id: 'notes',      label: 'Grading Notes',              defaultOn: false },
  { id: 'doctor',     label: 'Doctor & Lab Information',   defaultOn: false },
];

const KPI_DEFS = [
  { id: 'incubator_temp',     label: 'Temperature', unit: '°C', color: '#6b1176' },
  { id: 'incubator_co2',      label: 'CO₂',         unit: '%',  color: '#4f46e5' },
  { id: 'incubator_o2',       label: 'O₂',          unit: '%',  color: '#059669' },
  { id: 'incubator_humidity', label: 'Humidity',     unit: '%',  color: '#d97706' },
] as const;

function StatBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="border border-gray-100 rounded-xl p-2.5 text-center bg-[#FDFAFF] flex flex-col items-center gap-1">
      <div className="w-7 h-7 rounded-full bg-primary-bg flex items-center justify-center">
        <Icon size={13} className="text-primary" />
      </div>
      <p className="text-lg font-extrabold text-primary leading-none">{value}</p>
      <p className="text-[9px] text-gray-500 leading-tight">{label}</p>
    </div>
  );
}

export default function EmbryoReportsPage() {
  const { his } = useParams<{ his: string }>();
  const detailHis = his?.trim().toUpperCase() ?? '';

  const [cycle, setCycle] = useState<IvfCycleWithLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<'simple' | 'advanced'>('simple');
  const [included, setIncluded] = useState<Set<string>>(
    new Set(SECTIONS.filter(s => s.defaultOn).map(s => s.id))
  );
  const [showLogo, setShowLogo] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [coverLogo, setCoverLogo] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<Record<string, Array<{ timestamp: string; value: number }>>>({});
  const [labDetails, setLabDetails] = useState({ clinic: '', labId: '', cultureMedia: '', temperature: '', co2Level: '', embryologist: '', clinician: '', labTechnician: '', verifiedBy: '' });
  const [showLabModal, setShowLabModal] = useState(false);
  const [labDraft, setLabDraft] = useState({ clinic: '', labId: '', cultureMedia: '', temperature: '', co2Level: '', embryologist: '', clinician: '', labTechnician: '', verifiedBy: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ivfService.listCycles({ his_id: detailHis }).then(async (cycles: IvfCycle[]) => {
      const matched = cycles.find(c => c.his_id.toUpperCase() === detailHis);
      if (cancelled) return;
      if (!matched) { setLoading(false); return; }
      const full = await ivfService.getCycleWithLogs(matched.cycle_id);
      if (!cancelled) { setCycle(full); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [detailHis]);

  useEffect(() => {
    if (!cycle?.incubator_id) return;
    const date = cycle.opu_date?.split('T')[0] ?? new Date().toISOString().split('T')[0];
    ivfService.getIncubatorKpiHistoryByDate(
      cycle.incubator_id,
      date,
      cycle.chamber_position ?? undefined,
    ).then(res => {
      const sampled: Record<string, Array<{ timestamp: string; value: number }>> = {};
      for (const [kpi, series] of Object.entries(res.kpi_series)) {
        const step = Math.max(1, Math.floor(series.length / 60));
        sampled[kpi] = series.filter((_, i) => i % step === 0).map(p => ({ timestamp: p.timestamp, value: p.value }));
      }
      setKpiData(sampled);
    }).catch(() => {});
  }, [cycle?.incubator_id, cycle?.opu_date, cycle?.chamber_position]);

  useEffect(() => {
    const avg = (series: Array<{ value: number }>) =>
      series.length ? (series.reduce((a, b) => a + b.value, 0) / series.length) : null;
    const t = avg(kpiData['incubator_temp'] ?? []);
    const c = avg(kpiData['incubator_co2'] ?? []);
    setLabDetails(prev => ({
      ...prev,
      temperature: prev.temperature || (t != null ? `${t.toFixed(1)} °C` : ''),
      co2Level:    prev.co2Level    || (c != null ? `${c.toFixed(2)} %`  : ''),
    }));
  }, [kpiData]);

  const logs: IvfCycleLog[] = cycle?.logs ?? [];

  const stats = {
    totalEmbryos: logs.length,
    mii:          cycle?.oocyte_m2 ?? 0,
    mi:           cycle?.oocyte_m1 ?? 0,
    gv:           cycle?.oocyte_gv ?? 0,
    others:       cycle?.oocyte_others ?? 0,
    fertilised:   logs.filter(l => l.d1_pn && l.d1_pn !== '0PN').length,
    day3:         logs.filter(l => l.d3_grade).length,
    day5:         logs.filter(l => l.d5_grade).length,
    day6:         logs.filter(l => l.d6_grade).length,
    frozen:       logs.filter(l => l.fate === 'Frozen').length,
    transferred:  logs.filter(l => l.fate === 'Transferred').length,
    biopsied:     logs.filter(l => l.fate === 'Biopsied').length,
    discarded:    logs.filter(l => l.fate === 'Discarded').length,
  };

  const now = new Date();
  const printDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const printTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const reportId  = `REP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-001`;

  const toggleSection = (id: string) => {
    if (id === 'patient' || id === 'summary') return;
    setTemplate('advanced');
    setIncluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

      {/* ── Left: Configuration ── */}
      <div className="w-64 shrink-0 flex flex-col gap-5 overflow-y-auto bg-white border border-gray-300 rounded-2xl p-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Report Configuration</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Customize your report content and layout</p>
        </div>

        {/* Template */}
        <div>
          <p className="text-xs font-semibold text-gray-800 mb-2.5">Report Template</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'simple'   as const, label: 'Simple',   rec: true,  sub: 'Clean • Brand • Summary'   },
              { id: 'advanced' as const, label: 'Advanced', rec: false, sub: 'Data Rich • Comprehensive' },
            ]).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplate(t.id);
                  if (t.id === 'simple') setIncluded(new Set(['patient', ...SECTIONS.filter(s => s.defaultOn).map(s => s.id)]));
                }}
                className={`relative rounded-xl border-2 p-2 text-left transition-all ${
                  template === t.id ? 'border-primary bg-primary-bg' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {template === t.id && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check size={9} strokeWidth={3} className="text-white" />
                  </div>
                )}
                <div className="w-full aspect-[3/4] bg-white border border-gray-200 rounded-lg mb-2 overflow-hidden p-1.5">
                  <div className="h-1.5 bg-primary rounded-sm mb-1.5 w-full" />
                  {[70, 45, 85, 55, 75, 40, 65].map((w, i) => (
                    <div key={i} className={`h-[3px] rounded-full mb-1 ${i === 0 ? 'bg-gray-400' : 'bg-gray-200'}`} style={{ width: `${w}%` }} />
                  ))}
                </div>
                <p className={`text-[10px] font-bold text-center ${template === t.id ? 'text-primary' : 'text-gray-700'}`}>{t.label}</p>
                {t.rec && <p className="text-[8px] text-primary/70 text-center">(Recommended)</p>}
                <p className="text-[8px] text-gray-400 text-center leading-tight mt-0.5">{t.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Include in Report */}
        <div>
          <p className="text-xs font-semibold text-gray-800 mb-2">Include in Report</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
              <input type="checkbox" checked readOnly className="accent-primary w-3.5 h-3.5 rounded" />
              <span className="text-xs text-gray-700">Patient & Cycle Details</span>
            </div>
            <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
              <input type="checkbox" checked readOnly className="accent-primary w-3.5 h-3.5 rounded" />
              <span className="text-xs text-gray-700">Embryo Summary</span>
            </div>
            {SECTIONS.filter(s => s.id !== 'patient' && s.id !== 'summary').map(s => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={included.has(s.id)}
                  onChange={() => toggleSection(s.id)}
                  className="accent-primary w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span className="text-xs text-gray-700">{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Branding */}
        <div>
          <p className="text-xs font-semibold text-gray-800 mb-2">Branding</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showLogo} onChange={e => { setTemplate('advanced'); setShowLogo(e.target.checked); }} className="accent-primary w-3.5 h-3.5 cursor-pointer" />
              <span className="text-xs text-gray-700">Show mG-SCALE Logo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showFooter} onChange={e => { setTemplate('advanced'); setShowFooter(e.target.checked); }} className="accent-primary w-3.5 h-3.5 cursor-pointer" />
              <span className="text-xs text-gray-700">Show Footer</span>
            </label>
            <div className="pt-1">
              <p className="text-[11px] text-gray-500 mb-1.5">Cover Page Logo</p>
              {coverLogo ? (
                <div className="flex items-center gap-2">
                  <img src={coverLogo} alt="Cover logo" className="h-10 w-auto max-w-[100px] rounded border border-gray-200 object-contain bg-white p-1" />
                  <button
                    type="button"
                    onClick={() => setCoverLogo(null)}
                    className="text-[10px] text-red-500 hover:text-red-600 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 w-full border border-dashed border-gray-300 rounded-lg py-2.5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => setCoverLogo(ev.target?.result as string);
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  <span className="text-[11px] text-gray-400 font-medium">+ Upload logo</span>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-2">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
          >
            <RefreshCw size={14} />
            Update Preview
          </button>
        </div>
      </div>

      {/* ── Center: Report Preview ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-auto bg-white border border-gray-300 rounded-2xl p-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Report Preview</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">See how your report will look</p>
        </div>

        {/* Print root — cover then report; cover forces a page break so the report starts on page 2 */}
        <div id="report-print-root" className="contents">

        <div
          id="report-cover-page"
          className="relative w-full overflow-hidden mb-4 shrink-0"
        >
          <img src="/cover.png" alt="" className="w-full block" style={{ aspectRatio: '210 / 297', objectFit: 'cover' }} />
          <div className="absolute inset-0 flex flex-col justify-between px-10 py-10">
            <div className="flex justify-end">
              {coverLogo && (
                <img src={coverLogo} alt="Clinic logo" className="h-12 w-auto max-w-[160px] object-contain" />
              )}
            </div>
            <div className="ml-5" />
            <div />
          </div>
        </div>

        <div id="embryo-report-print" className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-6 py-6">

          {/* Report Header */}
          <div className="flex items-start justify-between mb-4 ">
            <div className="flex items-start">
              {showLogo && <img src={mGScaleLogo} alt="mGSCALE" className="h-18 w-auto" />}
            </div>
            <div className="text-right">
              <p className="text-base font-extrabold text-gray-900">Embryology Report</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Track and Trace • Quality • Compliance</p>
              <div className="mt-1.5 text-[10px] text-gray-500 space-y-0.5">
                <p>Report ID : {reportId}</p>
                <p>Generated : {printDate}, {printTime}</p>
                {cycle?.opu_date && (
                  <p>OPU Date : {new Date(cycle.opu_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                )}
              </div>
            </div>
          </div>

          {/* Tagline */}
          <div className="border border-primary/20 bg-primary-bg rounded-xl px-4 py-2.5 mb-5">
            <p className="text-xs font-bold text-primary">Built for Life. Delivered with Trust.</p>
            <p className="text-[10px] text-primary/70 mt-0.5">End-to-end visibility for every cell that matters.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading report…</div>
          ) : !cycle ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">No cycle found for HIS {detailHis}.</div>
          ) : (
            <>
              {/* Patient & Cycle Details | Lab & Treatment Details */}
              {included.has('patient') && (
                <div className="grid grid-cols-2 gap-5 mb-5 mt-10" style={{ breakInside: 'avoid' }}>
                  <div>
                    <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Patient & Cycle Details</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                      <Row label="Patient Name"     value={fmt(cycle.patient_name)} />
                      <Row label="Patient ID"       value={fmt(cycle.his_id)} />
                      <Row label="Cycle Type"       value={fmt(cycle.cycle_type)} />
                      <Row label="Injection Method" value={fmt(cycle.injection_method)} />
                      <Row label="Sperm Quality"    value={fmt(cycle.sperm_quality)} />
                      <Row label="Oocyte Quality"   value={fmt(cycle.oocyte_quality)} />
                      <Row label="Status"           value={fmt(cycle.status)} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Lab & Treatment Details</p>
                      <button type="button" onClick={() => { setLabDraft({ ...labDetails }); setShowLabModal(true); }} className="p-0.5 rounded hover:bg-primary-bg transition-colors">
                        <Pencil size={9} className="text-primary/50 hover:text-primary" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                      <Row label="Clinic / Lab"  value={labDetails.clinic       || '—'} />
                      <Row label="Embryologist"  value={labDetails.embryologist || '—'} />
                      <Row label="Lab ID"        value={labDetails.labId        || '—'} />
                      <Row label="Incubator ID"  value={cycle.incubator_id ? `INC-${cycle.incubator_id}` : '—'} />
                      <Row label="Culture Media" value={labDetails.cultureMedia || '—'} />
                      <Row label="Temperature"   value={labDetails.temperature  || '—'} />
                      <Row label="CO₂ Level"     value={labDetails.co2Level     || '—'} />
                    </div>
                  </div>
                </div>
              )}

              {/* Embryo Summary */}
              {included.has('summary') && (
                <div className="mb-5 mt-10" style={{ breakInside: 'avoid' }}>
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Summary</p>
                  <div className="grid grid-cols-5 gap-2 mb-2">
                    <StatBox icon={Microscope}    label="Total Embryos" value={stats.totalEmbryos} />
                    <StatBox icon={Sun}           label="MII (Mature)"  value={stats.mii ?? '—'} />
                    <StatBox icon={CircleDot}     label="MI"            value={stats.mi ?? '—'} />
                    <StatBox icon={Circle}        label="GV"            value={stats.gv ?? '—'} />
                    <StatBox icon={MoreHorizontal} label="Others"       value={stats.others ?? '—'} />
                  </div>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    <StatBox icon={Zap}         label="Fertilised"   value={stats.fertilised} />
                    <StatBox icon={CalendarDays} label="Day 3"        value={stats.day3} />
                    <StatBox icon={Layers}      label="Day 5 Blast"  value={stats.day5} />
                    <StatBox icon={Layers}      label="Day 6 Blast"  value={stats.day6} />
                    <StatBox icon={Snowflake}   label="Frozen"       value={stats.frozen} />
                  </div>

                  {/* Narrative summary */}
                  {(() => {
                    const blasts = stats.day5 + stats.day6;
                    const parts: string[] = [];
                    if (stats.totalEmbryos > 0)
                      parts.push(`${stats.totalEmbryos} oocyte${stats.totalEmbryos !== 1 ? 's' : ''} were retrieved and processed in this cycle`);
                    if (stats.fertilised > 0)
                      parts.push(`${stats.fertilised} fertilised successfully`);
                    if (stats.day3 > 0)
                      parts.push(`${stats.day3} reached Day 3 cleavage stage`);
                    if (blasts > 0)
                      parts.push(`${blasts} developed into blastocyst${blasts !== 1 ? 's' : ''} by Day ${stats.day6 > 0 && stats.day5 === 0 ? '6' : stats.day5 > 0 && stats.day6 > 0 ? '5 and Day 6' : '5'}`);
                    const transferred = stats.transferred > 0
                      ? `${stats.transferred} embryo${stats.transferred !== 1 ? 's' : ''} ${stats.transferred !== 1 ? 'were' : 'was'} transferred`
                      : null;
                    const frozen = stats.frozen > 0
                      ? `${stats.frozen} ${stats.frozen !== 1 ? 'have' : 'has'} been cryopreserved as frozen backup${stats.frozen !== 1 ? 's' : ''} for future use`
                      : null;
                    const biopsied = stats.biopsied > 0
                      ? `${stats.biopsied} underwent biopsy for PGT`
                      : null;
                    const outcomes = [transferred, frozen, biopsied].filter(Boolean);
                    return (
                      <div className="bg-primary-bg border border-primary/10 rounded-xl px-4 py-3">
                        <p className="text-[10px] text-gray-700 leading-relaxed">
                          {parts.length > 0 && (
                            <>{parts.join(', ')}. </>
                          )}
                          {outcomes.length > 0 && (
                            <>{outcomes.join(', and ')}.{' '}</>
                          )}
                          {stats.frozen === 0 && stats.transferred === 0 && stats.totalEmbryos > 0 && (
                            <>Outcome details are pending — no fate has been recorded yet for the embryos in this cycle.</>
                          )}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Embryo Development Log */}
              {included.has('log') && logs.length > 0 && (
                <div className="mb-5 mt-10">
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Development Log (Summary)</p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-[10px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100 text-[8px] font-bold text-primary/70 uppercase tracking-wide">
                            <th className="px-3 py-1.5 text-left" rowSpan={2}>#</th>
                            <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={2}>Day 0</th>
                            <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={2}>Day 1</th>
                            <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={2}>Day 3</th>
                            <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={2}>Day 5</th>
                            <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={2}>Day 6</th>
                            <th className="px-3 py-1.5 text-left border-l border-gray-200" rowSpan={2}>Fate</th>
                          </tr>
                          <tr className="bg-gray-50 border-b border-gray-200 text-[8px] font-medium text-gray-400 uppercase tracking-wide">
                            <th className="px-3 py-1 text-left border-l border-gray-200">Maturity</th>
                            <th className="px-3 py-1 text-left">Drop</th>
                            <th className="px-3 py-1 text-left border-l border-gray-200">PN</th>
                            <th className="px-3 py-1 text-left">Zygote</th>
                            <th className="px-3 py-1 text-left border-l border-gray-200">Drop</th>
                            <th className="px-3 py-1 text-left">Grade</th>
                            <th className="px-3 py-1 text-left border-l border-gray-200">Stage</th>
                            <th className="px-3 py-1 text-left">Grade</th>
                            <th className="px-3 py-1 text-left border-l border-gray-200">Stage</th>
                            <th className="px-3 py-1 text-left">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((log, idx) => (
                            <tr key={log.log_id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FDFAFF]'}`}>
                              <Td>{log.oocyte_no}</Td>
                              <Td>{fmt(log.d0_maturity)}</Td>
                              <Td>{fmt(log.d0_drop_no)}</Td>
                              <Td>{fmt(log.d1_pn)}</Td>
                              <Td>{fmt(log.d1_zygote_status)}</Td>
                              <Td>{fmt(log.d3_drop_no)}</Td>
                              <Td>{gradeChip(parseD3(log.d3_grade), 'd3')}</Td>
                              <Td>{fmt(log.d5_stage)}</Td>
                              <Td>{gradeChip(log.d5_grade, 'd5')}</Td>
                              <Td>{fmt(log.d6_stage)}</Td>
                              <Td>{gradeChip(log.d6_grade, 'd6')}</Td>
                              <Td>{fateChip(log.fate)}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {included.has('log') && logs.length === 0 && (
                <div className="flex items-center justify-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl mb-5">
                  No embryo logs recorded for this cycle.
                </div>
              )}

              {/* Quality Monitoring — Incubator KPI */}
              {included.has('quality') && (
                <div className="mb-5 " style={{ breakInside: 'avoid' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-bold text-primary uppercase tracking-widest mt-10">Quality Monitoring — Incubator Performance</p>
                    {cycle?.incubator_id && (
                      <span className="text-[9px] text-gray-400">INC-{cycle.incubator_id}{cycle.chamber_position ? ` · Ch ${cycle.chamber_position}` : ''}</span>
                    )}
                  </div>
                  {!cycle?.incubator_id ? (
                    <div className="flex items-center justify-center py-6 text-[10px] text-gray-400 border border-dashed border-gray-200 rounded-xl">
                      No incubator assigned to this cycle.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {KPI_DEFS.map(kpi => (
                        <KpiMiniChart
                          key={kpi.id}
                          label={kpi.label}
                          unit={kpi.unit}
                          color={kpi.color}
                          data={kpiData[kpi.id] ?? []}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}



              {/* Embryo Images */}
              {included.has('images') && logs.length > 0 && (
                <div className="mb-5 mt-10" style={{ breakInside: 'avoid' }}>
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Images</p>
                  <div className="grid grid-cols-5 gap-2">
                    {logs.map(log => (
                      <div key={log.log_id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="aspect-square bg-gray-100 flex items-center justify-center text-[9px] text-gray-400">
                          No image
                        </div>
                        <div className="px-2 py-1.5 bg-[#FDFAFF] border-t border-gray-100">
                          <p className="text-[9px] font-semibold text-gray-700">Oocyte #{log.oocyte_no}</p>
                          <p className="text-[8px] text-gray-400">{fmt(log.d0_maturity)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grading Notes */}
              {included.has('notes') && (
                <div className="mb-5 mt-10" style={{ breakInside: 'avoid' }}>
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Grading Notes</p>
                  {logs.some(l => l.oocyte_comments) ? (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full text-[10px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <Th>Oocyte</Th><Th>D0 Maturity</Th><Th>D3 Grade</Th><Th>D5/D6 Grade</Th><Th>Notes</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.filter(l => l.oocyte_comments).map((log, idx) => (
                            <tr key={log.log_id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FDFAFF]'}`}>
                              <Td>#{log.oocyte_no}</Td>
                              <Td>{fmt(log.d0_maturity)}</Td>
                              <Td>{gradeChip(parseD3(log.d3_grade), 'd3')}</Td>
                              <Td>{gradeChip(log.d5_grade ?? log.d6_grade, log.d5_grade ? 'd5' : 'd6')}</Td>
                              <Td><span className="text-gray-600">{log.oocyte_comments}</span></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6 text-[10px] text-gray-400 border border-dashed border-gray-200 rounded-xl">
                      No grading notes recorded for this cycle.
                    </div>
                  )}
                </div>
              )}

              {/* Doctor & Lab Information */}
              {included.has('doctor') && (
                <div className="mb-5 mt-10" style={{ breakInside: 'avoid' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Doctor & Lab Information</p>
                    <button type="button" onClick={() => { setLabDraft({ ...labDetails }); setShowLabModal(true); }} className="p-0.5 rounded hover:bg-primary-bg transition-colors">
                      <Pencil size={9} className="text-primary/50 hover:text-primary" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Clinic / Lab</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                        <Row label="Clinic Name"    value={labDetails.clinic       || '—'} />
                        <Row label="Lab ID"         value={labDetails.labId        || '—'} />
                        <Row label="Incubator"      value={cycle.incubator_id ? `INC-${cycle.incubator_id}` : '—'} />
                        <Row label="Chamber"        value={fmt(cycle.chamber_position)} />
                        <Row label="Culture Media"  value={labDetails.cultureMedia || '—'} />
                        <Row label="CO₂ Level"      value={labDetails.co2Level     || '—'} />
                        <Row label="Temperature"    value={labDetails.temperature  || '—'} />
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Personnel</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                        <Row label="Embryologist"   value={labDetails.embryologist  || '—'} />
                        <Row label="Clinician"      value={labDetails.clinician     || '—'} />
                        <Row label="Lab Technician" value={labDetails.labTechnician || '—'} />
                        <Row label="Verified By"    value={labDetails.verifiedBy    || '—'} />
                        <Row label="Report Date"    value={printDate} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Grading Key */}
              <div className="border border-gray-200 rounded-xl p-3">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Grading Key</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { icon: CircleDot, title: 'ICM Grade',  body: 'A (Many Cells) > B (Several Cells) > C (Few Cells)' },
                    { icon: Layers,    title: 'TE Grade',   body: 'A (Many Cells) > B (Several Cells) > C (Few Cells)' },
                    { icon: Sun,       title: 'Expansion',  body: '1 (Early) < 2 < 3 < 4 < 5 < 6 (Hatched)' },
                    { icon: Zap,       title: 'Quality',    body: 'Excellent > Good > Medium > Poor' },
                  ].map(k => (
                    <div key={k.title} className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-lg bg-primary-bg flex items-center justify-center shrink-0 mt-0.5">
                        <k.icon size={11} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-gray-700">{k.title}</p>
                        <p className="text-[9px] text-gray-400 leading-tight mt-0.5">{k.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              {showFooter && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <img src={mGScaleLogo} alt="mGSCALE" className="h-6 w-auto" />
                    <div>
                      <p className="text-[9px] font-bold text-gray-700">mGSCALE</p>
                    </div>
                  </div>
                  <div className="text-center text-[9px] text-gray-400">
                    <p>Ijzerenpoortkaai 3 bus 24, 2000 Antwerpen</p>
                    <p>admin@mygrape.org</p>
                  </div>
                  <div className="text-right text-[9px] text-gray-500">
                    <div className="flex items-center justify-end gap-1 mb-0.5">
                      <p className="text-gray-400">Verified by</p>
                      <button
                        type="button"
                        onClick={() => { setLabDraft({ ...labDetails }); setShowLabModal(true); }}
                        className="p-0.5 rounded hover:bg-primary-bg transition-colors print:hidden"
                      >
                        <Pencil size={8} className="text-primary/40 hover:text-primary" />
                      </button>
                    </div>
                    <p className="font-semibold text-gray-700">{labDetails.verifiedBy || '—'}</p>
                    <p className="text-gray-400 mt-0.5">{labDetails.embryologist || '—'}</p>
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </div>

        </div>
      </div>

      {/* ── Right: Quick Actions & Info ── */}
      <div className="w-52 shrink-0 flex flex-col gap-4 overflow-y-auto">

        {/* Quick Actions */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <p className="text-xs font-bold text-gray-900 mb-3">Quick Actions</p>
          <div className="flex flex-col gap-1.5">
            {([
              { icon: Download,     label: 'Download PDF',      action: () => window.print() },
              { icon: Printer,      label: 'Print Report',      action: () => window.print() },
              { icon: Share2,       label: 'Share Report',      action: () => {} },
            ]).map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.action}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 border border-gray-100 transition-colors text-left"
              >
                <a.icon size={13} className="text-primary shrink-0" />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Past Reports */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4 flex-1 min-h-0 overflow-y-auto">
          <p className="text-xs font-bold text-gray-900 mb-3">Past Reports</p>
          <div className="flex flex-col gap-2">
            {[
              { id: 'REP-2026-05-07-001', date: '07 May 2026' },
              { id: 'REP-2026-04-22-001', date: '22 Apr 2026' },
              { id: 'REP-2026-04-10-001', date: '10 Apr 2026' },
              { id: 'REP-2026-03-28-001', date: '28 Mar 2026' },
              { id: 'REP-2026-03-14-001', date: '14 Mar 2026' },
            ].map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <div className="w-6 h-6 rounded-md bg-primary-bg flex items-center justify-center shrink-0">
                  <FileText size={11} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-800 truncate">{r.id}</p>
                  <p className="text-[9px] text-gray-400">{r.date}</p>
                </div>
                <button type="button" className="shrink-0 text-gray-300 hover:text-primary transition-colors">
                  <Download size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lab Details Modal */}
      {showLabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-[420px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-primary" />
                <p className="text-sm font-bold text-gray-900">Lab & Treatment Details</p>
              </div>
              <button type="button" onClick={() => setShowLabModal(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-5">

              {/* Clinic / Lab */}
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Clinic / Lab</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'clinic'       as const, label: 'Clinic Name',   placeholder: 'e.g. IVF Lab Brussels', auto: false },
                    { key: 'labId'        as const, label: 'Lab ID',        placeholder: 'e.g. LAB-001',          auto: false },
                    { key: 'cultureMedia' as const, label: 'Culture Media', placeholder: 'e.g. Global Total',     auto: false },
                  ]).map(f => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-gray-600">{f.label}</label>
                      <input
                        type="text"
                        value={labDraft[f.key]}
                        onChange={e => setLabDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-[11px] text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">Incubator ID <span className="text-gray-300 font-normal">(auto)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{cycle?.incubator_id ? `INC-${cycle.incubator_id}` : '—'}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">Chamber <span className="text-gray-300 font-normal">(auto)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{cycle?.chamber_position ?? '—'}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">Temperature <span className="text-gray-300 font-normal">(avg)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{labDraft.temperature || '—'}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">CO₂ Level <span className="text-gray-300 font-normal">(avg)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{labDraft.co2Level || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Personnel */}
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Personnel</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'embryologist'  as const, label: 'Embryologist',   placeholder: 'e.g. Dr. Smith'   },
                    { key: 'clinician'     as const, label: 'Clinician',      placeholder: 'e.g. Dr. Adams'   },
                    { key: 'labTechnician' as const, label: 'Lab Technician', placeholder: 'e.g. J. Müller'   },
                    { key: 'verifiedBy'    as const, label: 'Verified By',    placeholder: 'e.g. Dr. Johnson' },
                  ]).map(f => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-gray-600">{f.label}</label>
                      <input
                        type="text"
                        value={labDraft[f.key]}
                        onChange={e => setLabDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-[11px] text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">Report Date <span className="text-gray-300 font-normal">(auto)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{printDate}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLabModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { setLabDetails({ ...labDraft }); setShowLabModal(false); }}
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-light transition-colors"
                >
                  Save to Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; height: auto !important; }
          * { overflow: visible !important; visibility: hidden; }
          /* Backgrounds, tints and chip colours are dropped by default in print */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #report-print-root, #report-print-root * { visibility: visible !important; }
          #report-print-root button { display: none !important; }
          #report-print-root {
            display: block !important;
            position: absolute;
            top: 0; left: 0;
            width: 210mm;
            margin: 0 !important;
          }
          #report-cover-page {
            width: 210mm; height: 297mm;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            aspect-ratio: unset !important;
            overflow: hidden !important;
            page-break-after: always;
            break-after: page;
          }
          #report-cover-page img {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 210mm !important; height: 297mm !important;
            object-fit: cover;
          }
          #embryo-report-print {
            width: 210mm;
            box-sizing: border-box;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          /* Horizontal page margins; vertical breathing room comes from section spacing */
          #embryo-report-print > div { padding: 10mm 12mm !important; }
          #embryo-report-print table { break-inside: auto; }
          #embryo-report-print thead { display: table-header-group; }
          #embryo-report-print tr { break-inside: avoid; }
          #embryo-report-print .uppercase { break-after: avoid; }
        }
      `}</style>
    </div>
  );
}

const KPI_MOCK_CONFIG: Record<string, { base: number; spread: number }> = {
  'Temperature': { base: 37.0, spread: 0.12 },
  'CO₂':        { base: 5.80, spread: 0.18 },
  'O₂':         { base: 5.20, spread: 0.22 },
  'Humidity':   { base: 95.0, spread: 1.20 },
};

function makeMockSeries(label: string): Array<{ timestamp: string; value: number }> {
  const cfg = KPI_MOCK_CONFIG[label] ?? { base: 50, spread: 2 };
  const now = Date.now();
  return Array.from({ length: 48 }, (_, i) => {
    const noise = Math.sin(i * 0.7) * cfg.spread * 0.5
                + Math.sin(i * 0.23 + 1.1) * cfg.spread * 0.35
                + Math.sin(i * 1.4 + 0.5) * cfg.spread * 0.15;
    return {
      timestamp: new Date(now - (47 - i) * 1800000).toISOString(),
      value: parseFloat((cfg.base + noise).toFixed(2)),
    };
  });
}

function KpiMiniChart({ label, unit, color, data }: {
  label: string; unit: string; color: string;
  data: Array<{ timestamp: string; value: number }>;
}) {
  const isMock = data.length === 0;
  const display = isMock ? makeMockSeries(label) : data;
  const values = display.map(p => p.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const chartData = {
    labels: display.map(p => {
      const d = new Date(p.timestamp);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    }),
    datasets: [{
      data: values,
      borderColor: color,
      backgroundColor: `${color}22`,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.4,
      fill: true,
    }],
  };

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  } as any;

  return (
    <div className="border border-gray-100 rounded-xl p-3 bg-[#FDFAFF]" style={{ breakInside: 'avoid' }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
          {isMock && <span className="text-[7px] text-gray-300 border border-gray-200 rounded px-1">demo</span>}
        </div>
        <span className="text-[11px] font-extrabold" style={{ color }}>
          {avg.toFixed(1)}{unit}
        </span>
      </div>
      <div style={{ height: 64 }}>
        <Line data={chartData} options={opts} />
      </div>
      {min != null && max != null && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[8px] text-gray-400">Min {min.toFixed(1)}{unit}</span>
          <span className="text-[8px] text-gray-400">Max {max.toFixed(1)}{unit}</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
      {children}
    </td>
  );
}
