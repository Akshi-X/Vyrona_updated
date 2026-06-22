import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { X, Snowflake, Thermometer } from 'lucide-react';
import { ivfService } from '../../../services/ivfService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const KPI_TABS = [
  { id: 'refrigerator_humidity', label: 'Humidity',      unit: '%',  accent: '#7a22c8', ring: 'rgba(122,34,200,0.10)' },
  { id: 'refrigerator_temp',     label: 'Temperature',   unit: '°C', accent: '#1a7abb', ring: 'rgba(26,122,187,0.10)' },
] as const;

type TabId = (typeof KPI_TABS)[number]['id'];

const TIME_RANGES = [
  { id: '1H'  as const, label: '1H',  minutes: 60    },
  { id: '24H' as const, label: '24H', minutes: 1440  },
  { id: '7D'  as const, label: '7D',  minutes: 10080 },
] as const;
type RangeId = (typeof TIME_RANGES)[number]['id'];

type DataPoint = { timestamp: string; value: number };

type Props = {
  refrigeratorId: number;
  kpiKey: string;
  zoneId?: string | null;
  onClose: () => void;
};

function parseTimestamp(ts: string): Date | null {
  try {
    const norm = ts.trim().replace(' ', 'T');
    const withZ = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(norm) ? norm : `${norm}Z`;
    const d = new Date(withZ);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

export default function RefrigeratorKpiChartModal({ refrigeratorId, kpiKey, zoneId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(kpiKey as TabId ?? 'temp_external');
  const [range, setRange]         = useState<RangeId>('24H');
  const [series, setSeries]       = useState<DataPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const backdropRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const minutes = TIME_RANGES.find((r) => r.id === range)?.minutes ?? 1440;
    ivfService
      .getRefrigeratorKpiHistory(refrigeratorId, minutes, zoneId ?? undefined)
      .then((res) => {
        const raw = res.kpi_series?.[activeTab] ?? [];
        setSeries(raw.map((p) => ({ timestamp: p.timestamp, value: p.value })));
      })
      .catch(() => setError('Failed to load chart data.'))
      .finally(() => setLoading(false));
  }, [refrigeratorId, activeTab, range]);

  const tab    = KPI_TABS.find((t) => t.id === activeTab) ?? KPI_TABS[0];
  const accent = tab.accent;

  const labels = useMemo(() => series.map((p) => {
    const d = parseTimestamp(p.timestamp);
    if (!d) return '';
    if (range === '7D') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }), [series, range]);

  const values = useMemo(() => series.map((p) => p.value), [series]);

  const stats = useMemo(() => {
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { min, max, avg };
  }, [values]);

  const chartData = useMemo(() => ({
    labels,
    datasets: [{
      label: tab.label,
      data: values,
      borderColor: accent,
      backgroundColor: `${accent}18`,
      borderWidth: 2,
      pointRadius: values.length > 80 ? 0 : 2,
      fill: true,
      tension: 0.3,
    }],
  }), [labels, values, accent, tab.label]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a0a1f',
        titleColor: '#d4b8e0',
        bodyColor: '#ffffff',
        padding: 10,
        callbacks: { label: (ctx: { parsed: { y: number } }) => `${ctx.parsed.y?.toFixed(2)} ${tab.unit}` },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8, font: { size: 10 }, color: '#9ca3af' }, grid: { color: '#f0ecf6' } },
      y: { ticks: { font: { size: 10 }, color: '#9ca3af', callback: (v: number | string) => `${v} ${tab.unit}` }, grid: { color: '#f0ecf6' } },
    },
  }), [tab.unit]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
        style={{ background: '#fff', borderRadius: 20, border: '1px solid #e6d6ee', boxShadow: '0 20px 60px -10px #40115340, 0 4px 16px #4011530a' }}
      >
        {/* Header */}
        <div style={{ background: '#f7f2fa', borderBottom: '1px solid #efe5f4', padding: '14px 18px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: '#5f3b73' }}>KPI Trend</span>
              <span style={{ display: 'block', fontSize: 10, color: '#a07ab8', marginTop: 2 }}>Historical sensor readings</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '6px', borderRadius: 8, border: '1px solid #d9c9e6', background: '#fff', color: '#6b4a78', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* KPI Tabs */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {KPI_TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: isActive ? `1px solid ${t.accent}` : '1px solid #e6d6ee',
                    background: isActive ? `${t.accent}14` : '#fff',
                    color: isActive ? t.accent : '#6b5a70',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {t.id === 'temp_external' ? <Thermometer size={12} /> : <Snowflake size={12} />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart body */}
        <div style={{ padding: '16px 18px 0', flex: 1 }}>
          <div style={{ height: 240, position: 'relative' }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="animate-spin" style={{ width: 28, height: 28, color: accent }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {!loading && error && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#dc2626' }}>{error}</div>
            )}
            {!loading && !error && series.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9ca3af' }}>No data for this period.</div>
            )}
            {!loading && !error && series.length > 0 && (
              <Line data={chartData} options={chartOptions as any} />
            )}
          </div>
        </div>

        {/* Stats + time range */}
        <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #f0e8f4', marginTop: 12 }}>
          {/* Min / Max / Avg */}
          {stats && (
            <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
              {(['min', 'max', 'avg'] as const).map((key, i) => (
                <div
                  key={key}
                  style={{
                    flex: 1, textAlign: 'center',
                    borderRight: i < 2 ? '1px solid #f0e8f4' : undefined,
                    paddingRight: i < 2 ? 12 : 0,
                    paddingLeft: i > 0 ? 12 : 0,
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 600, color: '#a07ab8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{key}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: accent, marginTop: 2 }}>
                    {stats[key].toFixed(1)}<span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>{tab.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Time range switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', marginRight: 4, fontWeight: 500 }}>Range:</span>
            <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #e6d6ee', overflow: 'hidden', background: '#fdfbfe' }}>
              {TIME_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  style={{
                    padding: '5px 14px', fontSize: 11, fontWeight: 600,
                    background: range === r.id ? accent : 'transparent',
                    color: range === r.id ? '#fff' : '#6b5a70',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
