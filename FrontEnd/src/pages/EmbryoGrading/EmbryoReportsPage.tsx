import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  Download, Printer, Share2, Check,
  Microscope, Snowflake, Zap, Sun, CircleDot, Circle, MoreHorizontal,
  Layers, CalendarDays, FileText, Pencil, X, Building2,
  Loader2, SlidersHorizontal, Trash2, Lock,
} from 'lucide-react';
const mGScaleLogo = '/mGScaleDark.svg';
import { ivfService, type IvfCycle, type IvfCycleLog, type IvfCycleWithLogs, type IvfCycleReport } from '../../services/ivfService';
import { userService, type HospitalBranding } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import {
  useEmbryoGrades, gradeCls, scoreBarGradient, scorePillStyle, criticalStyle,
  type LeaderboardEmbryo,
} from './useEmbryoGrades';
import { buildReportPdf } from './reportPdf';
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

// ── A4 page geometry (96dpi) ────────────────────────────────────────────────
const PAGE_W = 794;
const PAGE_H = 1123;
const PAGE_PAD_X = 44;
const PAGE_PAD_Y = 40;
const FOOTER_H = 60;
const PAGE_NUM_H = 20;
const CONTENT_W = PAGE_W - PAGE_PAD_X * 2;
const CONTENT_BUDGET = PAGE_H - PAGE_PAD_Y * 2 - FOOTER_H - PAGE_NUM_H;

// Conservative per-row/card px estimates used only to size chunks; the real
// page-packing decision below uses measured heights, so an oversized estimate
// here can never cause a page to overflow — at worst it under-packs a page.
const LOG_ROW_H = 32;
const LOG_HEADER_H = 60;
const LOG_ROWS_PER_CHUNK = Math.max(3, Math.floor((CONTENT_BUDGET - LOG_HEADER_H) / LOG_ROW_H));

const GRADE_CARDS_PER_ROW = 2;
const GRADE_CARD_ROW_H = 300;
const GRADE_HEADER_H = 30;
const GRADE_ROWS_PER_CHUNK = Math.max(1, Math.floor((CONTENT_BUDGET - GRADE_HEADER_H) / GRADE_CARD_ROW_H));
const GRADE_PER_CHUNK = GRADE_ROWS_PER_CHUNK * GRADE_CARDS_PER_ROW;

const IMAGE_PER_ROW = 5;
const IMAGE_ROW_H = CONTENT_W / IMAGE_PER_ROW + 40;
const IMAGE_HEADER_H = 30;
const IMAGE_ROWS_PER_CHUNK = Math.max(1, Math.floor((CONTENT_BUDGET - IMAGE_HEADER_H) / IMAGE_ROW_H));
const IMAGE_PER_CHUNK = IMAGE_ROWS_PER_CHUNK * IMAGE_PER_ROW;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Value / chip helpers — clinical report rule: omit absent values, never render a dash ──
const nonEmpty = (v: string | number | null | undefined): v is string | number => v != null && v !== '';

function val(v: string | number | null | undefined): string | null {
  return nonEmpty(v) ? String(v) : null;
}

const parseD3 = (g: string | null) => {
  if (!g) return null;
  const m = g.match(/^(\d+)C(\d+)$/);
  return m ? `${m[1]}C${m[2]}` : g;
};

function gradeChip(grade: string | null, day: 'd3' | 'd5' | 'd6'): ReactNode {
  if (!grade) return null;
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
}

function fateChip(fate: string | null): ReactNode {
  if (!fate) return null;
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
}

const SECTIONS: { id: string; label: string; defaultOn: boolean; disabled?: boolean }[] = [
  { id: 'patient', label: 'Patient & Cycle Details', defaultOn: true },
  { id: 'summary', label: 'Embryo Summary', defaultOn: true },
  { id: 'log', label: 'Embryo Development Log', defaultOn: true },
  { id: 'grades', label: 'Embryo Grade Details', defaultOn: false },
  { id: 'quality', label: 'Quality Monitoring', defaultOn: false, disabled: true },
  { id: 'images', label: 'Embryo Images', defaultOn: false },
  { id: 'notes', label: 'Grading Notes', defaultOn: false },
  { id: 'doctor', label: 'Doctor & Lab Information', defaultOn: false },
];

const KPI_DEFS = [
  { id: 'incubator_temp', label: 'Temperature', unit: '°C', color: '#6b1176' },
  { id: 'incubator_co2', label: 'CO₂', unit: '%', color: '#4f46e5' },
  { id: 'incubator_o2', label: 'O₂', unit: '%', color: '#059669' },
  { id: 'incubator_humidity', label: 'Humidity', unit: '%', color: '#d97706' },
] as const;

const LOG_COLUMN_GROUPS: { label: string; cols: { key: string; label: string; get: (l: IvfCycleLog) => string | null }[] }[] = [
  { label: 'Day 0', cols: [
    { key: 'd0_maturity', label: 'Maturity', get: l => val(l.d0_maturity) },
    { key: 'd0_drop_no', label: 'Drop', get: l => val(l.d0_drop_no) },
  ] },
  { label: 'Day 1', cols: [
    { key: 'd1_pn', label: 'PN', get: l => val(l.d1_pn) },
    { key: 'd1_zygote_status', label: 'Zygote', get: l => val(l.d1_zygote_status) },
  ] },
  { label: 'Day 3', cols: [
    { key: 'd3_drop_no', label: 'Drop', get: l => val(l.d3_drop_no) },
    { key: 'd3_grade', label: 'Grade', get: l => parseD3(l.d3_grade) },
  ] },
  { label: 'Day 5', cols: [
    { key: 'd5_stage', label: 'Stage', get: l => val(l.d5_stage) },
    { key: 'd5_grade', label: 'Grade', get: l => l.d5_stage === 'Blastocyst' ? val(l.blast_grade) : null },
  ] },
  { label: 'Day 6', cols: [
    { key: 'd6_stage', label: 'Stage', get: l => val(l.d6_stage) },
    { key: 'd6_grade', label: 'Grade', get: l => l.d6_stage === 'Blastocyst' ? val(l.blast_grade) : null },
  ] },
];

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

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!nonEmpty(value)) return null;
  return (
    <>
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-500 uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-2 py-1.5 text-gray-700">
      {children}
    </td>
  );
}

function KpiMiniChart({ label, unit, color, data }: {
  label: string; unit: string; color: string;
  data: Array<{ timestamp: string; value: number }>;
}) {
  if (data.length === 0) {
    return (
      <div className="border border-gray-100 rounded-xl p-3 bg-[#FDFAFF] flex flex-col items-center justify-center text-center" style={{ breakInside: 'avoid', minHeight: 96 }}>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-[9px] text-gray-300 mt-1.5">No readings recorded</p>
      </div>
    );
  }
  const values = data.map(p => p.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const chartData = {
    labels: data.map(p => {
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
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
        <span className="text-[11px] font-extrabold" style={{ color }}>
          {avg.toFixed(1)}{unit}
        </span>
      </div>
      <div style={{ height: 64 }}>
        <Line data={chartData} options={opts} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[8px] text-gray-400">Min {min.toFixed(1)}{unit}</span>
        <span className="text-[8px] text-gray-400">Max {max.toFixed(1)}{unit}</span>
      </div>
    </div>
  );
}

function GradeDetailCard({ embryo, groups }: { embryo: LeaderboardEmbryo; groups: Set<string> }) {
  const gc = gradeCls(embryo.grade);
  const morphRows = [
    { label: 'Hatching', value: embryo.morphology.hatching, critical: true },
    { label: 'Zona Pellucida', value: embryo.morphology.zonaPellucida, critical: false },
    { label: 'Blastocoel', value: embryo.morphology.blastocoelQuality, critical: false },
  ].filter(r => nonEmpty(r.value) && r.value !== '—');
  const inferenceRows = [
    { label: 'Expansion', value: embryo.morphology.expInference },
    { label: 'ICM', value: embryo.morphology.icmInference },
    { label: 'TE', value: embryo.morphology.teInference },
  ].filter(r => nonEmpty(r.value) && !r.value.startsWith('No '));

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ breakInside: 'avoid' }}>
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-black flex items-center justify-center shrink-0">{embryo.rank}</span>
        <span className="text-[10px] font-bold text-gray-700 flex-1">Oocyte #{embryo.oocyteNo}</span>
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${gc.bg} ${gc.border} ${gc.text}`}>{embryo.grade}</span>
      </div>

      {groups.has('core') && (
        <>
          <div className="aspect-[4/3] bg-gray-100">
            <img src={embryo.src} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="px-3 py-2 flex items-center gap-1.5">
            <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md leading-none shrink-0" style={scorePillStyle(embryo.aiScore)}>{embryo.aiScore}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${embryo.aiScore * 10}%`, background: scoreBarGradient(embryo.aiScore) }} />
            </div>
          </div>
        </>
      )}

      {groups.has('morphology') && morphRows.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 space-y-1.5">
          {morphRows.map(r => {
            const s = criticalStyle(r.value);
            return (
              <div key={r.label} className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-gray-400 font-medium">{r.label}</span>
                {r.critical ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border" style={s}>{r.value}</span>
                ) : (
                  <span className="text-[9px] font-bold text-gray-700">{r.value}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {groups.has('inference') && inferenceRows.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 space-y-1.5" style={{ background: '#faf4ff' }}>
          {inferenceRows.map(r => (
            <div key={r.label}>
              <span className="text-[8px] font-bold text-primary uppercase tracking-wide">{r.label}</span>
              <p className="text-[9px] text-gray-600 leading-snug">{r.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Report page block model ─────────────────────────────────────────────────

interface ReportBlock {
  id: string;
  kind: 'header' | 'patient' | 'summary' | 'log' | 'log-empty' | 'grades' | 'quality'
      | 'images' | 'notes' | 'notes-empty' | 'doctor' | 'gradingKey';
  logRows?: IvfCycleLog[];
  gradeItems?: LeaderboardEmbryo[];
}

type LabDetails = {
  clinic: string; labId: string; cultureMedia: string; temperature: string;
  co2Level: string; embryologist: string; clinician: string; labTechnician: string; verifiedBy: string;
};

const EMPTY_LOGS: IvfCycleLog[] = [];

const EMPTY_LAB_DETAILS: LabDetails = {
  clinic: '', labId: '', cultureMedia: '', temperature: '', co2Level: '',
  embryologist: '', clinician: '', labTechnician: '', verifiedBy: '',
};

type ReportConfig = {
  template: 'simple' | 'advanced';
  included: Set<string>;
  gradeGroups: Set<string>;
  showLogo: boolean;
  showFooter: boolean;
  labDetails: LabDetails;
};

export default function EmbryoReportsPage() {
  const { his } = useParams<{ his: string }>();
  const detailHis = his?.trim().toUpperCase() ?? '';
  const { userRole } = useAuth();
  const isAdmin = ['admin', 'manager'].includes((userRole || '').toLowerCase());

  const [cycle, setCycle] = useState<IvfCycleWithLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const { embryos } = useEmbryoGrades(cycle);

  const [template, setTemplate] = useState<'simple' | 'advanced'>('simple');
  const [included, setIncluded] = useState<Set<string>>(
    new Set(SECTIONS.filter(s => s.defaultOn).map(s => s.id))
  );
  const [gradeGroups, setGradeGroups] = useState<Set<string>>(new Set(['core', 'inference', 'morphology']));
  const [showLogo, setShowLogo] = useState(true);
  const [showFooter, setShowFooter] = useState(true);

  const [branding, setBranding] = useState<HospitalBranding | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [kpiData, setKpiData] = useState<Record<string, Array<{ timestamp: string; value: number }>>>({});
  const [labDetails, setLabDetails] = useState<LabDetails>(EMPTY_LAB_DETAILS);
  const [showLabModal, setShowLabModal] = useState(false);
  const [labDraft, setLabDraft] = useState<LabDetails>(EMPTY_LAB_DETAILS);

  const [reportState, setReportState] = useState<'draft' | 'saving' | 'saved'>('draft');
  const [pastReports, setPastReports] = useState<IvfCycleReport[]>([]);
  const [lastSavedConfig, setLastSavedConfig] = useState<ReportConfig | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [activeSheet, setActiveSheet] = useState<'none' | 'configure' | 'actions'>('none');
  const [displayScale, setDisplayScale] = useState(1);
  const scale = capturing ? 1 : displayScale;

  const previewWrapRef = useRef<HTMLDivElement>(null);
  const previewRootRef = useRef<HTMLDivElement>(null);
  const markDraft = () => setReportState(prev => (prev === 'saving' ? prev : 'draft'));

  function snapshotConfig(): ReportConfig {
    return { template, included: new Set(included), gradeGroups: new Set(gradeGroups), showLogo, showFooter, labDetails: { ...labDetails } };
  }

  function applyConfig(cfg: ReportConfig) {
    setTemplate(cfg.template);
    setIncluded(new Set(cfg.included));
    setGradeGroups(new Set(cfg.gradeGroups));
    setShowLogo(cfg.showLogo);
    setShowFooter(cfg.showFooter);
    setLabDetails({ ...cfg.labDetails });
  }

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
      co2Level: prev.co2Level || (c != null ? `${c.toFixed(2)} %` : ''),
    }));
  }, [kpiData]);

  useEffect(() => {
    let cancelled = false;
    userService.getHospitalBranding().then(b => { if (!cancelled) setBranding(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cycle) return;
    let cancelled = false;
    ivfService.listCycleReports(cycle.cycle_id).then(reports => {
      if (cancelled) return;
      setPastReports(reports);
      if (reports.length > 0) {
        setReportState('saved');
        setLastSavedConfig(snapshotConfig());
      } else {
        setReportState('draft');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.cycle_id]);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? PAGE_W;
      setDisplayScale(Math.min(1, w / PAGE_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const logs: IvfCycleLog[] = cycle?.logs ?? EMPTY_LOGS;

  const stats = {
    totalEmbryos: logs.length,
    mii: cycle?.oocyte_m2 ?? 0,
    mi: cycle?.oocyte_m1 ?? 0,
    gv: cycle?.oocyte_gv ?? 0,
    others: cycle?.oocyte_others ?? 0,
    fertilised: logs.filter(l => l.d1_pn && l.d1_pn !== '0PN').length,
    day3: logs.filter(l => l.d3_grade).length,
    day5: logs.filter(l => l.d5_stage === 'Blastocyst' && l.blast_grade).length,
    day6: logs.filter(l => l.d6_stage === 'Blastocyst' && l.blast_grade).length,
    frozen: logs.filter(l => l.fate === 'Frozen').length,
    transferred: logs.filter(l => l.fate === 'Transferred').length,
    biopsied: logs.filter(l => l.fate === 'Biopsied').length,
    discarded: logs.filter(l => l.fate === 'Discarded').length,
  };

  const now = new Date();
  const printDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const printTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const reportId = `REP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-001`;

  const toggleSection = (id: string) => {
    const meta = SECTIONS.find(s => s.id === id);
    if (id === 'patient' || id === 'summary' || meta?.disabled) return;
    setTemplate('advanced');
    setIncluded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    markDraft();
  };

  const toggleGradeGroup = (id: string) => {
    setGradeGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    markDraft();
  };

  // Always show every day group — a column with no data yet still tells the
  // reader what's pending; only individual empty cells are left blank.
  const visibleLogGroups = LOG_COLUMN_GROUPS;

  const patientRows = cycle ? [
    { label: 'Patient ID', value: val(cycle.his_id) },
    { label: 'Cycle Type', value: val(cycle.cycle_type) },
    { label: 'Injection Method', value: val(cycle.injection_method) },
    { label: 'Sperm Quality', value: val(cycle.sperm_quality) },
    { label: 'Oocyte Quality', value: val(cycle.oocyte_quality) },
    { label: 'Status', value: val(cycle.status) },
  ].filter(r => r.value != null) : [];

  const labRows = cycle ? [
    { label: 'Clinic / Lab', value: val(labDetails.clinic) },
    { label: 'Embryologist', value: val(labDetails.embryologist) },
    { label: 'Lab ID', value: val(labDetails.labId) },
    { label: 'Incubator ID', value: cycle.incubator_id ? `INC-${cycle.incubator_id}` : null },
    { label: 'Culture Media', value: val(labDetails.cultureMedia) },
    { label: 'Temperature', value: val(labDetails.temperature) },
    { label: 'CO₂ Level', value: val(labDetails.co2Level) },
  ].filter(r => r.value != null) : [];

  const clinicRows = cycle ? [
    { label: 'Clinic Name', value: val(labDetails.clinic) },
    { label: 'Lab ID', value: val(labDetails.labId) },
    { label: 'Incubator', value: cycle.incubator_id ? `INC-${cycle.incubator_id}` : null },
    { label: 'Chamber', value: val(cycle.chamber_position) },
    { label: 'Culture Media', value: val(labDetails.cultureMedia) },
    { label: 'CO₂ Level', value: val(labDetails.co2Level) },
    { label: 'Temperature', value: val(labDetails.temperature) },
  ].filter(r => r.value != null) : [];

  const personnelRows = [
    { label: 'Embryologist', value: val(labDetails.embryologist) },
    { label: 'Clinician', value: val(labDetails.clinician) },
    { label: 'Lab Technician', value: val(labDetails.labTechnician) },
    { label: 'Verified By', value: val(labDetails.verifiedBy) },
    { label: 'Report Date', value: printDate },
  ].filter(r => r.value != null);

  // ── Blocks (ordered) ──────────────────────────────────────────────────────
  const blocks = useMemo<ReportBlock[]>(() => {
    if (!cycle) return [];
    const out: ReportBlock[] = [{ id: 'header', kind: 'header' }];
    if (included.has('patient') && (patientRows.length > 0 || labRows.length > 0)) {
      out.push({ id: 'patient', kind: 'patient' });
    }
    if (included.has('summary')) out.push({ id: 'summary', kind: 'summary' });
    if (included.has('log')) {
      if (logs.length > 0) {
        chunk(logs, LOG_ROWS_PER_CHUNK).forEach((rows, i) => out.push({ id: `log-${i}`, kind: 'log', logRows: rows }));
      } else {
        out.push({ id: 'log-empty', kind: 'log-empty' });
      }
    }
    if (included.has('grades') && embryos.length > 0) {
      chunk(embryos, GRADE_PER_CHUNK).forEach((items, i) => out.push({ id: `grades-${i}`, kind: 'grades', gradeItems: items }));
    }
    if (included.has('quality')) out.push({ id: 'quality', kind: 'quality' });
    if (included.has('images') && logs.length > 0) {
      chunk(logs, IMAGE_PER_CHUNK).forEach((rows, i) => out.push({ id: `images-${i}`, kind: 'images', logRows: rows }));
    }
    if (included.has('notes')) {
      const withNotes = logs.filter(l => l.oocyte_comments);
      if (withNotes.length > 0) out.push({ id: 'notes', kind: 'notes', logRows: withNotes });
      else out.push({ id: 'notes-empty', kind: 'notes-empty' });
    }
    if (included.has('doctor') && (clinicRows.length > 0 || personnelRows.length > 0)) {
      out.push({ id: 'doctor', kind: 'doctor' });
    }
    out.push({ id: 'gradingKey', kind: 'gradingKey' });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, included, logs, embryos, labDetails, gradeGroups]);

  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pages, setPages] = useState<ReportBlock[][]>([]);

  useLayoutEffect(() => {
    const packed: ReportBlock[][] = [];
    let current: ReportBlock[] = [];
    let currentH = 0;
    blocks.forEach(b => {
      const h = blockRefs.current[b.id]?.getBoundingClientRect().height ?? 0;
      if (current.length > 0 && currentH + h > CONTENT_BUDGET) {
        packed.push(current);
        current = [];
        currentH = 0;
      }
      current.push(b);
      currentH += h;
    });
    if (current.length > 0) packed.push(current);
    setPages(packed);
  }, [blocks]);

  // ── Save / share ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!cycle || !previewRootRef.current || reportState === 'saving') return;
    setReportState('saving');
    setSaveError(null);
    setCapturing(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const blob = await buildReportPdf(previewRootRef.current);
      const fileName = `embryo-report-${cycle.his_id}-${Date.now()}.pdf`;
      await ivfService.uploadCycleReport(cycle.cycle_id, blob, fileName, 'embryo_console');
      const reports = await ivfService.listCycleReports(cycle.cycle_id);
      setPastReports(reports);
      setLastSavedConfig(snapshotConfig());
      setReportState('saved');
    } catch (e) {
      console.error('Report save failed', e);
      setSaveError(e instanceof Error ? e.message : 'Failed to save report');
      setReportState('draft');
    } finally {
      setCapturing(false);
    }
  }

  function handleDiscard() {
    if (!lastSavedConfig) return;
    applyConfig(lastSavedConfig);
    setSaveError(null);
    setReportState('saved');
  }

  async function handleDeleteReport(reportId: number) {
    if (!cycle) return;
    try {
      await ivfService.deleteCycleReport(cycle.cycle_id, reportId);
      const reports = await ivfService.listCycleReports(cycle.cycle_id);
      setPastReports(reports);
      if (reports.length === 0) { setReportState('draft'); setLastSavedConfig(null); }
    } catch { /* leave list as-is */ }
  }

  async function handleShare() {
    const latest = pastReports[0];
    if (!latest) return;
    if (navigator.share) {
      navigator.share({ title: 'Embryology Report', url: latest.file_url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(latest.file_url).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }).catch(() => {});
    }
  }

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    try {
      const b = await userService.uploadHospitalLogo(file);
      setBranding(b);
      markDraft();
    } catch { /* keep previous branding on failure */ }
    setLogoUploading(false);
  }

  // ── Block rendering ──────────────────────────────────────────────────────
  function renderBlock(block: ReportBlock): ReactNode {
    switch (block.kind) {
      case 'header':
        return (
          <div key={block.id}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {showLogo && branding?.logo_url && (
                  <img src={branding.logo_url} alt={branding.hospital_name} className="h-14 w-auto object-contain" />
                )}
                {branding?.hospital_name && (
                  <p className="text-sm font-extrabold text-gray-900">{branding.hospital_name}</p>
                )}
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
            <div className="border border-primary/20 bg-primary-bg rounded-xl px-4 py-2.5">
              <p className="text-xs font-bold text-primary">Built for Life. Delivered with Trust.</p>
              <p className="text-[10px] text-primary/70 mt-0.5">End-to-end visibility for every cell that matters.</p>
            </div>
          </div>
        );

      case 'patient':
        return (
          <div key={block.id} className="grid grid-cols-2 gap-5">
            {patientRows.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Patient & Cycle Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  {patientRows.map(r => <Row key={r.label} label={r.label} value={r.value} />)}
                </div>
              </div>
            )}
            {labRows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Lab & Treatment Details</p>
                  <button type="button" onClick={() => { setLabDraft({ ...labDetails }); setShowLabModal(true); }} className="p-0.5 rounded hover:bg-primary-bg transition-colors no-print">
                    <Pencil size={9} className="text-primary/50 hover:text-primary" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  {labRows.map(r => <Row key={r.label} label={r.label} value={r.value} />)}
                </div>
              </div>
            )}
          </div>
        );

      case 'summary': {
        const blasts = stats.day5 + stats.day6;
        const parts: string[] = [];
        if (stats.totalEmbryos > 0) parts.push(`${stats.totalEmbryos} oocyte${stats.totalEmbryos !== 1 ? 's' : ''} were retrieved and processed in this cycle`);
        if (stats.fertilised > 0) parts.push(`${stats.fertilised} fertilised successfully`);
        if (stats.day3 > 0) parts.push(`${stats.day3} reached Day 3 cleavage stage`);
        if (blasts > 0) parts.push(`${blasts} developed into blastocyst${blasts !== 1 ? 's' : ''} by Day ${stats.day6 > 0 && stats.day5 === 0 ? '6' : stats.day5 > 0 && stats.day6 > 0 ? '5 and Day 6' : '5'}`);
        const transferred = stats.transferred > 0 ? `${stats.transferred} embryo${stats.transferred !== 1 ? 's' : ''} ${stats.transferred !== 1 ? 'were' : 'was'} transferred` : null;
        const frozen = stats.frozen > 0 ? `${stats.frozen} ${stats.frozen !== 1 ? 'have' : 'has'} been cryopreserved as frozen backup${stats.frozen !== 1 ? 's' : ''} for future use` : null;
        const biopsied = stats.biopsied > 0 ? `${stats.biopsied} underwent biopsy for PGT` : null;
        const outcomes = [transferred, frozen, biopsied].filter(Boolean);
        return (
          <div key={block.id}>
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Summary</p>
            <div className="grid grid-cols-5 gap-2 mb-2">
              <StatBox icon={Microscope} label="Total Embryos" value={stats.totalEmbryos} />
              <StatBox icon={Sun} label="MII (Mature)" value={stats.mii} />
              <StatBox icon={CircleDot} label="MI" value={stats.mi} />
              <StatBox icon={Circle} label="GV" value={stats.gv} />
              <StatBox icon={MoreHorizontal} label="Others" value={stats.others} />
            </div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              <StatBox icon={Zap} label="Fertilised" value={stats.fertilised} />
              <StatBox icon={CalendarDays} label="Day 3" value={stats.day3} />
              <StatBox icon={Layers} label="Day 5 Blast" value={stats.day5} />
              <StatBox icon={Layers} label="Day 6 Blast" value={stats.day6} />
              <StatBox icon={Snowflake} label="Frozen" value={stats.frozen} />
            </div>
            {(parts.length > 0 || outcomes.length > 0) && (
              <div className="bg-primary-bg border border-primary/10 rounded-xl px-4 py-3">
                <p className="text-[10px] text-gray-700 leading-relaxed">
                  {parts.length > 0 && <>{parts.join(', ')}. </>}
                  {outcomes.length > 0 && <>{outcomes.join(', and ')}.</>}
                </p>
              </div>
            )}
          </div>
        );
      }

      case 'log': {
        const rows = block.logRows ?? [];
        return (
          <div key={block.id}>
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Development Log</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full table-fixed text-[10px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[8px] font-bold text-primary/70 uppercase tracking-wide">
                    <th className="px-2 py-1.5 text-left" rowSpan={2} style={{ width: 28 }}>#</th>
                    {visibleLogGroups.map(g => (
                      <th key={g.label} className="px-2 py-1.5 text-center border-l border-gray-200" colSpan={g.cols.length}>{g.label}</th>
                    ))}
                    <th className="px-2 py-1.5 text-left border-l border-gray-200" rowSpan={2} style={{ width: 60 }}>Fate</th>
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[8px] font-medium text-gray-400 uppercase tracking-wide">
                    {visibleLogGroups.map(g => g.cols.map((c, ci) => (
                      <th key={c.key} className={`px-2 py-1 text-left ${ci === 0 ? 'border-l border-gray-200' : ''}`}>{c.label}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log, idx) => (
                    <tr key={log.log_id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FDFAFF]'}`}>
                      <Td>{log.oocyte_no}</Td>
                      {visibleLogGroups.map(g => g.cols.map(c => {
                        const v = c.get(log);
                        return <Td key={c.key}>{c.key === 'd3_grade' ? gradeChip(v, 'd3') : c.key === 'd5_grade' ? gradeChip(v, 'd5') : c.key === 'd6_grade' ? gradeChip(v, 'd6') : v}</Td>;
                      }))}
                      <Td>{fateChip(log.fate)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'log-empty':
        return (
          <div key={block.id} className="flex items-center justify-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
            No embryo logs recorded for this cycle.
          </div>
        );

      case 'grades': {
        const items = block.gradeItems ?? [];
        return (
          <div key={block.id}>
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Grade Details</p>
            <div className="grid grid-cols-2 gap-3">
              {items.map(e => <GradeDetailCard key={e.id} embryo={e} groups={gradeGroups} />)}
            </div>
          </div>
        );
      }

      case 'quality':
        return (
          <div key={block.id}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Quality Monitoring — Incubator Performance</p>
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
                  <KpiMiniChart key={kpi.id} label={kpi.label} unit={kpi.unit} color={kpi.color} data={kpiData[kpi.id] ?? []} />
                ))}
              </div>
            )}
          </div>
        );

      case 'images': {
        const rows = block.logRows ?? [];
        return (
          <div key={block.id}>
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Embryo Images</p>
            <div className="grid grid-cols-5 gap-2">
              {rows.map(log => (
                <div key={log.log_id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center text-[9px] text-gray-400">
                    No image
                  </div>
                  <div className="px-2 py-1.5 bg-[#FDFAFF] border-t border-gray-100">
                    <p className="text-[9px] font-semibold text-gray-700">Oocyte #{log.oocyte_no}</p>
                    {nonEmpty(log.d0_maturity) && <p className="text-[8px] text-gray-400">{log.d0_maturity}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'notes': {
        const rows = block.logRows ?? [];
        return (
          <div key={block.id}>
            <p className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2">Grading Notes</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full table-fixed text-[10px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Oocyte</Th><Th>D0 Maturity</Th><Th>D3 Grade</Th><Th>D5/D6 Grade</Th><Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log, idx) => (
                    <tr key={log.log_id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FDFAFF]'}`}>
                      <Td>#{log.oocyte_no}</Td>
                      <Td>{val(log.d0_maturity)}</Td>
                      <Td>{gradeChip(parseD3(log.d3_grade), 'd3')}</Td>
                      <Td>{gradeChip(log.blast_grade, log.d5_stage === 'Blastocyst' ? 'd5' : 'd6')}</Td>
                      <Td><span className="text-gray-600">{log.oocyte_comments}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'notes-empty':
        return (
          <div key={block.id} className="flex items-center justify-center py-6 text-[10px] text-gray-400 border border-dashed border-gray-200 rounded-xl">
            No grading notes recorded for this cycle.
          </div>
        );

      case 'doctor':
        return (
          <div key={block.id}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Doctor & Lab Information</p>
              <button type="button" onClick={() => { setLabDraft({ ...labDetails }); setShowLabModal(true); }} className="p-0.5 rounded hover:bg-primary-bg transition-colors no-print">
                <Pencil size={9} className="text-primary/50 hover:text-primary" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {clinicRows.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Clinic / Lab</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                    {clinicRows.map(r => <Row key={r.label} label={r.label} value={r.value} />)}
                  </div>
                </div>
              )}
              {personnelRows.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Personnel</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                    {personnelRows.map(r => <Row key={r.label} label={r.label} value={r.value} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'gradingKey':
        return (
          <div key={block.id} className="border border-gray-200 rounded-xl p-3">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Grading Key</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: CircleDot, title: 'ICM Grade', body: 'A (Many Cells) > B (Several Cells) > C (Few Cells)' },
                { icon: Layers, title: 'TE Grade', body: 'A (Many Cells) > B (Several Cells) > C (Few Cells)' },
                { icon: Sun, title: 'Expansion', body: '1 (Early) < 2 < 3 < 4 < 5 < 6 (Hatched)' },
                { icon: Zap, title: 'Quality', body: 'Excellent > Good > Medium > Poor' },
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
        );

      default:
        return null;
    }
  }

  function renderFooter() {
    if (!showFooter) return null;
    return (
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-gray-400">Powered by</span>
          <img src={mGScaleLogo} alt="mGSCALE" className="h-4 w-auto" />
        </div>
        <div className="text-center text-[8px] text-gray-400">
          <p>Ijzerenpoortkaai 3 bus 24, 2000 Antwerpen</p>
          <p>admin@mygrape.org</p>
        </div>
        <div className="text-right text-[8px] text-gray-500">
          {nonEmpty(labDetails.verifiedBy) && <p className="font-semibold text-gray-700">{labDetails.verifiedBy}</p>}
          {nonEmpty(labDetails.embryologist) && <p className="text-gray-400 mt-0.5">{labDetails.embryologist}</p>}
        </div>
      </div>
    );
  }

  const coverLogoUrl = branding?.logo_url ?? null;

  function renderConfigPanel() {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Report Configuration</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Customize your report content and layout</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-800 mb-2.5">Report Template</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'simple' as const, label: 'Simple', rec: true, sub: 'Clean • Brand • Summary' },
              { id: 'advanced' as const, label: 'Advanced', rec: false, sub: 'Data Rich • Comprehensive' },
            ]).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplate(t.id);
                  if (t.id === 'simple') setIncluded(new Set(['patient', ...SECTIONS.filter(s => s.defaultOn).map(s => s.id)]));
                  markDraft();
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
              <div key={s.id}>
                <label className={`flex items-center gap-2 ${s.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={included.has(s.id)}
                    disabled={s.disabled}
                    onChange={() => toggleSection(s.id)}
                    className="accent-primary w-3.5 h-3.5 rounded cursor-pointer"
                  />
                  <span className="text-xs text-gray-700 flex-1">{s.label}</span>
                  {s.disabled && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[9px] font-bold uppercase tracking-wide">
                      <Lock size={8} /> Coming soon
                    </span>
                  )}
                </label>
                {s.id === 'grades' && included.has('grades') && (
                  <div className="ml-5 mt-1.5 flex flex-col gap-1.5">
                    {([
                      { id: 'core', label: 'Image, grade & AI score' },
                      { id: 'inference', label: 'AI inference (Exp / ICM / TE)' },
                      { id: 'morphology', label: 'Morphology & hatching' },
                    ]).map(g => (
                      <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gradeGroups.has(g.id)}
                          onChange={() => toggleGradeGroup(g.id)}
                          className="accent-primary w-3 h-3 rounded cursor-pointer"
                        />
                        <span className="text-[11px] text-gray-600">{g.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-800 mb-2">Branding</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showLogo} onChange={e => { setShowLogo(e.target.checked); markDraft(); }} className="accent-primary w-3.5 h-3.5 cursor-pointer" />
              <span className="text-xs text-gray-700">Show Hospital Logo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showFooter} onChange={e => { setShowFooter(e.target.checked); markDraft(); }} className="accent-primary w-3.5 h-3.5 cursor-pointer" />
              <span className="text-xs text-gray-700">Show Footer</span>
            </label>
            <div className="pt-1">
              <p className="text-[11px] text-gray-500 mb-1.5">Hospital Logo</p>
              {coverLogoUrl ? (
                <div className="flex items-center gap-2">
                  <img src={coverLogoUrl} alt="Hospital logo" className="h-10 w-auto max-w-[100px] rounded border border-gray-200 object-contain bg-white p-1" />
                  {isAdmin && (
                    <label className="text-[10px] text-primary hover:text-primary-light font-medium cursor-pointer">
                      {logoUploading ? 'Uploading…' : 'Replace'}
                      <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              ) : isAdmin ? (
                <label className="flex items-center justify-center gap-1.5 w-full border border-dashed border-gray-300 rounded-lg py-2.5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }} />
                  <span className="text-[11px] text-gray-400 font-medium">{logoUploading ? 'Uploading…' : '+ Upload logo'}</span>
                </label>
              ) : (
                <p className="text-[11px] text-gray-300">No hospital logo set</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderActionsPanel() {
    return (
      <div className="flex flex-col gap-4">
        <div className={`rounded-2xl p-4 border ${reportState !== 'saved' ? 'border-transparent text-white' : 'bg-white border-gray-300'}`}
          style={reportState !== 'saved' ? { background: 'linear-gradient(135deg,#6b1176,#9333ea)' } : undefined}>
          <p className={`text-xs font-bold mb-3 ${reportState !== 'saved' ? 'text-white' : 'text-gray-900'}`}>Quick Actions</p>
          {reportState !== 'saved' ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={reportState === 'saving' || !cycle || pages.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors"
              >
                {reportState === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                {reportState === 'saving' ? 'Generating PDF…' : 'Save Report'}
              </button>
              {lastSavedConfig && reportState !== 'saving' && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-white/10 border border-white/30 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
                >
                  <X size={13} />
                  Discard Changes
                </button>
              )}
              {saveError && (
                <p className="text-[10px] text-white/90 bg-black/15 rounded-lg px-2.5 py-1.5">{saveError}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {[
                { icon: Download, label: 'Download PDF', action: () => pastReports[0] && window.open(pastReports[0].file_url, '_blank') },
                { icon: Printer, label: 'Print Report', action: () => window.print() },
                { icon: Share2, label: shareCopied ? 'Link copied' : 'Share Report', action: handleShare },
              ].map(a => (
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
          )}
        </div>

        <div className="bg-white border border-gray-300 rounded-2xl p-4 flex-1 min-h-0 overflow-y-auto">
          <p className="text-xs font-bold text-gray-900 mb-3">Past Reports</p>
          {pastReports.length === 0 ? (
            <p className="text-[11px] text-gray-300">No saved reports yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pastReports.map(r => (
                <div key={r.report_id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="w-6 h-6 rounded-md bg-primary-bg flex items-center justify-center shrink-0">
                    <FileText size={11} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-800 truncate">{r.file_name ?? `Report #${r.report_id}`}</p>
                    <p className="text-[9px] text-gray-400">{new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <button type="button" onClick={() => window.open(r.file_url, '_blank')} className="shrink-0 text-gray-300 hover:text-primary transition-colors">
                    <Download size={11} />
                  </button>
                  <button type="button" onClick={() => handleDeleteReport(r.report_id)} className="shrink-0 text-gray-300 hover:text-rose-500 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0 md:overflow-hidden pb-14 md:pb-0">

      {/* ── Left: Configuration (desktop) ── */}
      <div className="hidden md:flex w-64 shrink-0 flex-col gap-5 overflow-y-auto bg-white border border-gray-300 rounded-2xl p-4">
        {renderConfigPanel()}
      </div>

      {/* ── Center: Report Preview ── */}
      <div ref={previewWrapRef} className="flex-1 min-w-0 flex flex-col gap-3 overflow-auto bg-white border border-gray-300 rounded-2xl p-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Report Preview</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">See how your report will look — pages match the exported PDF exactly</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading report…</div>
        ) : !cycle ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No cycle found for HIS {detailHis}.</div>
        ) : (
          <div id="report-print-root" ref={previewRootRef} className="flex flex-col items-center gap-4">
            {/* Cover page */}
            <div className="report-page-frame relative shadow-sm border border-gray-200 rounded overflow-hidden bg-white"
              style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
              <div className="report-page relative" style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
                <img src="/cover.png" alt="" className="w-full block" style={{ width: PAGE_W, height: PAGE_H, objectFit: 'cover' }} />
                <div className="absolute inset-0 flex flex-col justify-between px-10 py-10">
                  <div className="flex justify-end">
                    {showLogo && coverLogoUrl && (
                      <img src={coverLogoUrl} alt="Hospital logo" className="h-12 w-auto max-w-[160px] object-contain" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Hidden measurement pass — same blocks, off-screen, native size */}
            <div style={{ position: 'fixed', top: 0, left: -99999, width: CONTENT_W, visibility: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
              {blocks.map(b => (
                <div key={b.id} ref={el => { blockRefs.current[b.id] = el; }} className="flex flex-col gap-4 pb-4">
                  {renderBlock(b)}
                </div>
              ))}
            </div>

            {/* Content pages */}
            {pages.map((page, pi) => (
              <div key={pi} className="report-page-frame relative shadow-sm border border-gray-200 rounded overflow-hidden bg-white"
                style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
                <div className="report-page relative flex flex-col" style={{ width: PAGE_W, height: PAGE_H, padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, background: '#fff' }}>
                  <div className="flex flex-col gap-4">
                    {page.map(b => renderBlock(b))}
                  </div>
                  <div className="mt-auto pt-3">
                    {renderFooter()}
                    <p className="text-center text-[8px] text-gray-300 mt-1.5">Page {pi + 1} of {pages.length}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Quick Actions & Info (desktop) ── */}
      <div className="hidden md:flex w-52 shrink-0 flex-col gap-4 overflow-y-auto">
        {renderActionsPanel()}
      </div>

      {/* ── Mobile bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200 bg-white">
        <button type="button" onClick={() => setActiveSheet('configure')} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-gray-700">
          <SlidersHorizontal size={14} className="text-primary" /> Configure
        </button>
        <div className="w-px bg-gray-200" />
        <button type="button" onClick={() => setActiveSheet('actions')} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-gray-700">
          {reportState === 'saved' ? <Download size={14} className="text-primary" /> : <FileText size={14} className="text-primary" />} Actions
        </button>
      </div>

      {/* ── Mobile sheets ── */}
      {activeSheet !== 'none' && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setActiveSheet('none')}>
          <div className="w-full max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-gray-900">{activeSheet === 'configure' ? 'Report Configuration' : 'Quick Actions'}</span>
              <button type="button" onClick={() => setActiveSheet('none')} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            {activeSheet === 'configure' ? renderConfigPanel() : renderActionsPanel()}
          </div>
        </div>
      )}

      {/* Lab Details Modal */}
      {showLabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[420px] mx-4 max-h-[90vh] overflow-y-auto">
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

              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Clinic / Lab</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'clinic' as const, label: 'Clinic Name', placeholder: 'e.g. IVF Lab Brussels' },
                    { key: 'labId' as const, label: 'Lab ID', placeholder: 'e.g. LAB-001' },
                    { key: 'cultureMedia' as const, label: 'Culture Media', placeholder: 'e.g. Global Total' },
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
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{cycle?.incubator_id ? `INC-${cycle.incubator_id}` : 'Not assigned'}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">Chamber <span className="text-gray-300 font-normal">(auto)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{cycle?.chamber_position ?? 'Not assigned'}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">Temperature <span className="text-gray-300 font-normal">(avg)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{labDraft.temperature || 'No readings'}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-600">CO₂ Level <span className="text-gray-300 font-normal">(avg)</span></label>
                    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-400">{labDraft.co2Level || 'No readings'}</div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Personnel</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'embryologist' as const, label: 'Embryologist', placeholder: 'e.g. Dr. Smith' },
                    { key: 'clinician' as const, label: 'Clinician', placeholder: 'e.g. Dr. Adams' },
                    { key: 'labTechnician' as const, label: 'Lab Technician', placeholder: 'e.g. J. Müller' },
                    { key: 'verifiedBy' as const, label: 'Verified By', placeholder: 'e.g. Dr. Johnson' },
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
                  onClick={() => { setLabDetails({ ...labDraft }); setShowLabModal(false); markDraft(); }}
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
          html, body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden; }
          #report-print-root, #report-print-root * { visibility: visible; }
          #report-print-root { position: absolute; top: 0; left: 0; display: flex; flex-direction: column; }
          #report-print-root .no-print, #report-print-root button { display: none !important; }
          .report-page-frame {
            width: 210mm !important; height: 297mm !important;
            box-shadow: none !important; border: none !important; border-radius: 0 !important;
            overflow: visible !important;
            page-break-after: always; break-after: page;
          }
          .report-page-frame:last-child { page-break-after: auto; }
          .report-page {
            transform: none !important; position: static !important;
            width: 210mm !important; height: 297mm !important;
          }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
