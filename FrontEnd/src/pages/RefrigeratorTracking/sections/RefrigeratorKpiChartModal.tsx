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
import { useAuth } from '../../../contexts/AuthContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

type KpiConfigMeta = {
  id: number;
  kpi_name: string;
  alert_name: string | null;
  min: number | null;
  max: number | null;
  unit: string;
  zone_id: string | null;
  zone_name: string | null;
};

const TIME_RANGES = [
  { id: 'LIVE' as const, label: 'LATEST', minutes: undefined },
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

type BucketedChart = { labels: string[]; values: (number | null)[] };

function buildBucketedChart(
  series: DataPoint[],
  range: RangeId,
  rangeStartMs: number,
  nowMs: number,
): BucketedChart {
  const slotMs =
    range === '1H'  ? 2  * 60_000 :
    range === '24H' ? 30 * 60_000 :
                      6  * 60 * 60_000;

  const labels: string[] = [];
  const values: (number | null)[] = [];

  const slotMap = new Map<number, number>();
  for (const p of series) {
    const d = parseTimestamp(p.timestamp);
    if (!d) continue;
    const offsetMs = d.getTime() - rangeStartMs;
    if (offsetMs < 0 || offsetMs > nowMs - rangeStartMs) continue;
    const slotIdx = Math.floor(offsetMs / slotMs);
    if (!slotMap.has(slotIdx)) slotMap.set(slotIdx, p.value);
  }

  const totalMs = nowMs - rangeStartMs;
  const totalSlots = Math.ceil(totalMs / slotMs);

  for (let i = 0; i <= totalSlots; i++) {
    const slotTimeMs = rangeStartMs + i * slotMs;
    const d = new Date(slotTimeMs);
    const label =
      range === '7D'
        ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    labels.push(label);
    values.push(slotMap.get(i) ?? null);
  }

  return { labels, values };
}

export default function RefrigeratorKpiChartModal({ refrigeratorId, kpiKey, zoneId, onClose }: Props) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(kpiKey ?? 'refrigerator_temp');
  const [range, setRange]         = useState<RangeId>('LIVE');
  const [series, setSeries]       = useState<DataPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [kpiConfigs, setKpiConfigs] = useState<KpiConfigMeta[]>([]);
  const backdropRef               = useRef<HTMLDivElement>(null);
  const wsRef                     = useRef<WebSocket | null>(null);
  const latestKpiTimestampRef     = useRef<Record<string, string>>({});
  const chartRef                  = useRef<any>(null);

  // Fetch history
  useEffect(() => {
    setLoading(true);
    setError(null);
    const minutes = TIME_RANGES.find((r) => r.id === range)?.minutes;
    ivfService
      .getRefrigeratorKpiHistory(refrigeratorId, minutes, zoneId ?? undefined)
      .then((res) => {
        setKpiConfigs(res.kpi_configs ?? []);
        const raw = res.kpi_series?.[activeTab] ?? [];
        setSeries(raw.map((p) => ({ timestamp: p.timestamp, value: p.value })));
      })
      .catch(() => setError('Failed to load chart data.'))
      .finally(() => setLoading(false));
  }, [refrigeratorId, activeTab, range]);

  // WebSocket for LIVE mode
  useEffect(() => {
    if (range !== 'LIVE') {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    if (wsRef.current) return;

    try {
      const wsBase = import.meta.env.VITE_API_BASE_URL?.replace(/^http/, 'ws') || 'ws://localhost:8001';
      const wsUrl = `${wsBase}/api/ivf/quality/refrigerator-kpi-ws?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({ refrigerator_id: refrigeratorId, zone_id: zoneId ?? null }));
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (!parsed.kpis || !Array.isArray(parsed.kpis)) return;

          const kpiName = activeTab;
          const relevantKpis = parsed.kpis.filter((k: any) => k.name === kpiName);

          setSeries((prev) => {
            let updated = [...prev];
            for (const kpi of relevantKpis) {
              const ts = kpi.timestamp || '';
              const lastTs = latestKpiTimestampRef.current[kpiName];
              if (lastTs && ts <= lastTs) continue;

              latestKpiTimestampRef.current[kpiName] = ts;
              updated.push({
                timestamp: ts,
                value: kpi.value,
              });
            }
            return updated;
          });
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onerror = () => {
        setError('Connection error');
      };

      ws.onclose = () => {
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('WS error:', err);
      setError('Failed to connect');
    }

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [range, refrigeratorId, zoneId, token, activeTab]);

  const getAccent = (kpiName: string): string => {
    if (kpiName.includes('temp')) return '#1a7abb';
    if (kpiName.includes('humidity')) return '#7a22c8';
    return '#6b7280';
  };

  const config = kpiConfigs.find((c) => c.kpi_name === activeTab);
  const tab = config ? {
    label: config.alert_name ?? config.kpi_name,
    unit: config.unit || '°C',
    accent: getAccent(config.kpi_name),
  } : { label: activeTab, unit: '°C', accent: '#6b7280' };
  const accent = tab.accent;

  const latestReading = useMemo(() => {
    if (!series || series.length === 0) return null;
    return series[series.length - 1];
  }, [series]);

  const latestValue = useMemo(() => {
    if (!latestReading?.value || latestReading.value == null) return '—';
    return `${latestReading.value.toFixed(1)}${tab.unit}`;
  }, [latestReading, tab.unit]);

  const latestTimestamp = useMemo(() => {
    if (!latestReading?.timestamp) return '—';
    const d = parseTimestamp(latestReading.timestamp);
    if (!d) return '—';
    const nowMs = Date.now();
    const diffMs = Math.max(0, nowMs - d.getTime());
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin <= 0) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    const hours = Math.floor(diffMin / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }, [latestReading]);

  const rangeMinutes = TIME_RANGES.find((r) => r.id === range)?.minutes;
  const nowMs = Date.now();
  const rangeStartMs = rangeMinutes != null ? nowMs - rangeMinutes * 60_000 : null;

  const { labels: chartLabels, values: chartValues } = useMemo(() => {
    if (range === 'LIVE' || rangeStartMs == null) {
      return {
        labels: series.map((p) => {
          const d = parseTimestamp(p.timestamp);
          if (!d) return '';
          if (range === '7D') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }),
        values: series.map((p) => p.value),
      };
    }
    return buildBucketedChart(series, range, rangeStartMs, nowMs);
  }, [series, range, rangeStartMs, nowMs]);

  const values = useMemo(() => series.map((p) => p.value), [series]);

  const stats = useMemo(() => {
    if (values.length === 0) return { min: null, max: null, avg: null };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { min, max, avg };
  }, [values]);

  const chartData = useMemo(() => ({
    labels: chartLabels,
    datasets: [{
      label: tab.label,
      data: chartValues,
      borderColor: accent,
      backgroundColor: range === 'LIVE' ? `${accent}18` : `${accent}18`,
      borderWidth: 2,
      pointRadius: range === 'LIVE' ? 0 : (chartValues.length > 82 ? 0 : 2),
      fill: range === 'LIVE',
      tension: 0.3,
      spanGaps: false,
    }],
  }), [chartLabels, chartValues, accent, tab.label, range]);

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
      x: { ticks: { maxTicksLimit: range === '7D' ? 8 : 6, font: { size: 10 }, color: '#9ca3af' }, grid: { color: '#f0ecf6' } },
      y: { ticks: { font: { size: 10 }, color: '#9ca3af', callback: (v: number | string) => `${v} ${tab.unit}` }, grid: { color: '#f0ecf6' } },
    },
  }), [tab.unit, range]);

  useEffect(() => {
    chartRef.current?.update();
  }, [series]);

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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#8b6c97', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {tab.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: accent, marginTop: 4 }}>
                    {latestValue}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    {latestTimestamp}
                  </div>
                </div>
              </div>
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
            {kpiConfigs.map((c) => {
              const isActive = activeTab === c.kpi_name;
              const tabAccent = getAccent(c.kpi_name);
              const Icon = c.kpi_name.includes('humidity') ? Snowflake : Thermometer;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveTab(c.kpi_name)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: isActive ? `1px solid ${tabAccent}` : '1px solid #e6d6ee',
                    background: isActive ? `${tabAccent}14` : '#fff',
                    color: isActive ? tabAccent : '#6b5a70',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Icon size={12} />
                  {c.alert_name ?? c.kpi_name}
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
              <Line ref={chartRef} data={chartData} options={chartOptions as any} />
            )}
          </div>
        </div>

        {/* Stats + time range */}
        <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #f0e8f4', marginTop: 12 }}>
          {/* Min / Max / Avg */}
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
                  {stats[key] !== null ? `${stats[key]!.toFixed(1)}` : '—'}<span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>{tab.unit}</span>
                </div>
              </div>
            ))}
          </div>

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
