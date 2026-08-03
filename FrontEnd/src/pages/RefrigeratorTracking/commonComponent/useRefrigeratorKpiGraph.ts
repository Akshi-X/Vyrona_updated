import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';
import { useAuth } from '../../../contexts/AuthContext';
import { ivfService } from '../../../services/ivfService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

// chart.js is ambient-declared without types in this project (src/types/chartjs-shim.d.ts),
// so the chart payloads are described locally instead of with its own generics.
type ChartLineData = {
  labels: string[];
  datasets: Array<{ label: string; data: (number | null)[]; [key: string]: unknown }>;
};
type ChartLineOptions = Record<string, unknown>;
type ChartInstanceLike = { update: () => void };

export type KpiConfigMeta = {
  id: number;
  kpi_name: string;
  alert_name: string | null;
  min: number | null;
  max: number | null;
  unit: string;
  zone_id: string | null;
  zone_name: string | null;
};

export const REFRIGERATOR_GRAPH_TIME_RANGES = [
  { id: 'LIVE' as const, label: 'LATEST', minutes: undefined },
  { id: '1H' as const, label: '1H', minutes: 60 },
  { id: '24H' as const, label: '24H', minutes: 1440 },
  { id: '7D' as const, label: '7D', minutes: 10080 },
] as const;

export type RefrigeratorGraphRangeId = (typeof REFRIGERATOR_GRAPH_TIME_RANGES)[number]['id'];

export type RefrigeratorGraphPoint = {
  timestamp: string;
  value: number;
  avg?: number | null;
  min?: number | null;
  max?: number | null;
  count?: number | null;
};

type BucketedChart = {
  labels: string[];
  values: (number | null)[];
  timestampsMs: number[];
};

type LatestSnapshot = Record<string, { value: number; timestamp: string }>;

export type UseRefrigeratorKpiGraphOptions = {
  refrigeratorId: number;
  kpiKey: string;
  zoneId?: string | null;
  variant: 'modal' | 'inline';
  accent: string;
  unit: string;
  label?: string;
  trackLatestSnapshot?: boolean;
};

export type RefrigeratorKpiGraphController = {
  accent: string;
  chartData: ChartLineData;
  chartOptions: ChartLineOptions;
  chartRef: MutableRefObject<ChartInstanceLike | null>;
  error: string | null;
  kpiConfigs: KpiConfigMeta[];
  latestReading: { value: number; timestamp: string } | null;
  loading: boolean;
  range: RefrigeratorGraphRangeId;
  series: RefrigeratorGraphPoint[];
  setRange: Dispatch<SetStateAction<RefrigeratorGraphRangeId>>;
  stats: { min: number | null; max: number | null; avg: number | null };
  threshold: { min: number | null; max: number | null };
  unit: string;
  variant: 'modal' | 'inline';
};

type LiveKpiPoint = {
  name?: string;
  timestamp?: string;
  value?: number;
};

type LiveKpiMessage = {
  kpis?: LiveKpiPoint[];
  refrigerator_id?: number | string | null;
  zone_id?: string | null;
};

export function parseRefrigeratorGraphTimestamp(ts: string): Date | null {
  try {
    const norm = ts.trim().replace(' ', 'T');
    const withZ = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(norm) ? norm : `${norm}Z`;
    const date = new Date(withZ);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function buildBucketedChart(
  series: RefrigeratorGraphPoint[],
  range: RefrigeratorGraphRangeId,
  rangeStartMs: number,
  nowMs: number,
): BucketedChart {
  const slotMs =
    range === '1H' ? 2 * 60_000 :
    range === '24H' ? 30 * 60_000 :
    6 * 60 * 60_000;

  const labels: string[] = [];
  const values: (number | null)[] = [];
  const timestampsMs: number[] = [];
  const slotMap = new Map<number, { weightedSum: number; totalWeight: number }>();

  for (const point of series) {
    const date = parseRefrigeratorGraphTimestamp(point.timestamp);
    if (!date) continue;

    const offsetMs = date.getTime() - rangeStartMs;
    if (offsetMs < 0 || offsetMs > nowMs - rangeStartMs) continue;

    const slotIdx = Math.floor(offsetMs / slotMs);
    const weight = point.count ?? 1;
    const value = point.avg ?? point.value;
    const entry = slotMap.get(slotIdx) ?? { weightedSum: 0, totalWeight: 0 };
    entry.weightedSum += value * weight;
    entry.totalWeight += weight;
    slotMap.set(slotIdx, entry);
  }

  const totalMs = nowMs - rangeStartMs;
  const totalSlots = Math.ceil(totalMs / slotMs);

  for (let i = 0; i <= totalSlots; i++) {
    const slotTimeMs = rangeStartMs + i * slotMs;
    const date = new Date(slotTimeMs);
    const label =
      range === '7D'
        ? date.toLocaleDateString([], { month: 'short', day: 'numeric' })
        : `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    labels.push(label);
    timestampsMs.push(slotTimeMs);

    const bucket = slotMap.get(i);
    values.push(bucket && bucket.totalWeight > 0 ? bucket.weightedSum / bucket.totalWeight : null);
  }

  return { labels, values, timestampsMs };
}

export function useRefrigeratorKpiGraph({
  refrigeratorId,
  kpiKey,
  zoneId,
  variant,
  accent,
  unit,
  label,
  trackLatestSnapshot = false,
}: UseRefrigeratorKpiGraphOptions): RefrigeratorKpiGraphController {
  const { token } = useAuth();
  const [range, setRange] = useState<RefrigeratorGraphRangeId>('LIVE');
  const [series, setSeries] = useState<RefrigeratorGraphPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpiConfigs, setKpiConfigs] = useState<KpiConfigMeta[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<LatestSnapshot>({});
  const chartRef = useRef<ChartInstanceLike | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const latestKpiTimestampRef = useRef<Record<string, string>>({});
  const prevScopeRef = useRef<string>(`${kpiKey}::${zoneId ?? ''}`);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError(null);

    const minutes = REFRIGERATOR_GRAPH_TIME_RANGES.find((item) => item.id === range)?.minutes;
    ivfService
      .getRefrigeratorKpiHistory(refrigeratorId, minutes, zoneId ?? undefined)
      .then((res) => {
        if (ignore) return;

        setKpiConfigs(res.kpi_configs ?? []);
        const raw = res.kpi_series?.[kpiKey] ?? [];
        const points = raw.map((point) => ({
          timestamp: point.timestamp,
          value: point.value,
          avg: point.avg,
          min: point.min,
          max: point.max,
          count: point.count,
        }));
        setSeries(points);

        const last = points[points.length - 1];
        if (last) latestKpiTimestampRef.current[kpiKey] = last.timestamp;
      })
      .catch(() => {
        if (ignore) return;
        setError('Failed to load chart data.');
        setSeries([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [refrigeratorId, kpiKey, range, zoneId]);

  useEffect(() => {
    if (!trackLatestSnapshot) return undefined;

    let cancelled = false;

    const fetchLatest = () => {
      ivfService
        .getRefrigeratorZoneLatest(refrigeratorId, zoneId ?? undefined)
        .then((res) => {
          if (cancelled || !res) return;

          setLatestSnapshot((prev) => {
            const next = { ...prev };
            let changed = false;

            for (const reading of res) {
              if (reading.value != null && reading.timestamp) {
                next[reading.kpi_name] = { value: reading.value, timestamp: reading.timestamp };
                changed = true;
              }
            }

            return changed ? next : prev;
          });
        })
        .catch(() => {});
    };

    fetchLatest();
    if (range === 'LIVE') {
      return () => {
        cancelled = true;
      };
    }

    const interval = setInterval(fetchLatest, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refrigeratorId, range, trackLatestSnapshot, zoneId]);

  useEffect(() => {
    const scope = `${kpiKey}::${zoneId ?? ''}`;
    if (range === 'LIVE' && prevScopeRef.current !== scope) {
      setSeries([]);
      latestKpiTimestampRef.current = {};
    }
    prevScopeRef.current = scope;
  }, [kpiKey, range, zoneId]);

  useEffect(() => {
    if (range !== 'LIVE') {
      wsRef.current?.close();
      wsRef.current = null;
      return undefined;
    }

    if (wsRef.current) return undefined;

    let dataReceived = false;

    try {
      const wsBase = import.meta.env.VITE_API_BASE_URL?.replace(/^http/, 'ws') || 'ws://localhost:8001';
      const wsUrl = `${wsBase}/api/ivf/quality/refrigerator-kpi-ws?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setError(null);
        ws.send(JSON.stringify({ refrigerator_id: refrigeratorId, zone_id: zoneId ?? null }));
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as LiveKpiMessage;
          if (!parsed.kpis || !Array.isArray(parsed.kpis)) return;

          // The socket also pushes readings tagged with other refrigerators/zones,
          // so scope them the same way useRefrigeratorKpiSnapshot does — otherwise
          // a zone's chart absorbs its sibling zones' values in LIVE mode.
          const messageMatches =
            parsed.refrigerator_id == null ||
            String(parsed.refrigerator_id) === String(refrigeratorId);
          const zoneMatches =
            zoneId == null || parsed.zone_id == null || parsed.zone_id === zoneId;
          if (!messageMatches || !zoneMatches) return;

          const liveKpis = parsed.kpis;

          if (trackLatestSnapshot) {
            setLatestSnapshot((prev) => {
              const next = { ...prev };
              let changed = false;

              for (const liveKpi of liveKpis) {
                if (liveKpi?.name && liveKpi.value != null && liveKpi.timestamp) {
                  next[liveKpi.name] = { value: liveKpi.value, timestamp: liveKpi.timestamp };
                  changed = true;
                }
              }

              return changed ? next : prev;
            });
          }

          const relevantKpis = liveKpis.filter(
            (liveKpi): liveKpi is { name: string; timestamp: string; value: number } =>
              liveKpi.name === kpiKey &&
              typeof liveKpi.timestamp === 'string' &&
              typeof liveKpi.value === 'number',
          );
          if (relevantKpis.length === 0) return;

          dataReceived = true;
          setLoading(false);

          setSeries((prev) => {
            const updated = [...prev];

            for (const liveKpi of relevantKpis) {
              const timestamp = liveKpi.timestamp;
              const lastTimestamp = latestKpiTimestampRef.current[kpiKey];
              if (lastTimestamp && timestamp <= lastTimestamp) continue;

              latestKpiTimestampRef.current[kpiKey] = timestamp;
              updated.push({
                timestamp,
                value: liveKpi.value,
              });
            }

            return updated;
          });
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onerror = () => {
        // A socket closed by a range switch can still emit after its replacement
        // is live; ignore it so it can't error out the chart that is now working.
        if (wsRef.current !== ws) return;
        if (!dataReceived) {
          setError('Connection error');
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (dataReceived || event.code === 1000) return;

        const messageMap: Record<number, string> = {
          4401: 'Session expired — please log in again.',
          4403: 'You don\'t have access to live refrigerator data.',
          1006: 'Connection lost.',
        };
        setError(messageMap[event.code] || 'Connection error');
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
  }, [kpiKey, range, refrigeratorId, token, trackLatestSnapshot, zoneId]);

  const rangeMinutes = REFRIGERATOR_GRAPH_TIME_RANGES.find((item) => item.id === range)?.minutes;
  const nowMs = Date.now();
  const rangeStartMs = rangeMinutes != null ? nowMs - rangeMinutes * 60_000 : null;

  const { labels, values, timestampsMs } = useMemo(() => {
    if (range === 'LIVE' || rangeStartMs == null) {
      return {
        labels: series.map((point) => {
          const date = parseRefrigeratorGraphTimestamp(point.timestamp);
          if (!date) return '';
          if (range === '7D') return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }),
        values: series.map((point) => point.value),
        timestampsMs: series.map((point) => parseRefrigeratorGraphTimestamp(point.timestamp)?.getTime() ?? Number.NaN),
      };
    }

    return buildBucketedChart(series, range, rangeStartMs, nowMs);
  }, [nowMs, range, rangeStartMs, series]);

  const stats = useMemo(() => {
    if (series.length === 0) return { min: null, max: null, avg: null };

    const hasBackendAggregates = series.every((point) => point.avg != null && point.count != null);
    if (hasBackendAggregates) {
      const mins = series.map((point) => point.min ?? point.value);
      const maxs = series.map((point) => point.max ?? point.value);
      let weightedSum = 0;
      let totalCount = 0;

      for (const point of series) {
        weightedSum += point.avg! * point.count!;
        totalCount += point.count!;
      }

      return {
        min: Math.min(...mins),
        max: Math.max(...maxs),
        avg: totalCount > 0 ? weightedSum / totalCount : null,
      };
    }

    const rawValues = series.map((point) => point.value);
    return {
      min: Math.min(...rawValues),
      max: Math.max(...rawValues),
      avg: rawValues.reduce((sum, value) => sum + value, 0) / rawValues.length,
    };
  }, [series]);

  // The backend already scopes configs when a zone is requested, but the no-zone
  // call returns every zone's config — match on zone first so the band drawn is
  // never a sibling zone's.
  const activeConfig =
    kpiConfigs.find((config) => config.kpi_name === kpiKey && config.zone_id === (zoneId ?? null))
    ?? kpiConfigs.find((config) => config.kpi_name === kpiKey);
  const thresholdMin = activeConfig?.min ?? null;
  const thresholdMax = activeConfig?.max ?? null;
  const threshold = useMemo(
    () => ({ min: thresholdMin, max: thresholdMax }),
    [thresholdMax, thresholdMin],
  );

  const yAxisRange = useMemo(() => {
    if (variant !== 'modal' || stats.min == null || stats.max == null) {
      return { min: undefined, max: undefined };
    }
    // The threshold lines are only useful if they stay on screen, so the axis has
    // to cover them even when every reading sits far outside the configured band.
    const lows = [stats.min, thresholdMin].filter((v): v is number => v != null);
    const highs = [stats.max, thresholdMax].filter((v): v is number => v != null);
    const low = Math.min(...lows);
    const high = Math.max(...highs);
    if (low === high) {
      return { min: low - 1, max: high + 1 };
    }
    const padding = (high - low) * 0.1;
    return { min: low - padding, max: high + padding };
  }, [stats.max, stats.min, thresholdMax, thresholdMin, variant]);

  // The KPI config is the source of truth for the unit, but it only arrives with
  // the history response — the caller's unit covers the render before that. Every
  // consumer of the unit reads it back off the controller so the axis, tooltip
  // and footer stats can never disagree.
  const resolvedUnit = activeConfig?.unit || unit;

  const chartData = useMemo(() => {
    // Chart.js has no annotation plugin here, so the KPI's configured band is drawn
    // as two flat dashed datasets. They are inert: no points, no hit area, and the
    // tooltip filters them out so hovering only ever reports the reading itself.
    const thresholdLine = (value: number, color: string, name: string) => ({
      label: name,
      data: labels.map(() => value),
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true,
    });

    return {
      labels,
      datasets: [
        {
          label: label ?? kpiKey,
          data: values,
          borderColor: accent,
          backgroundColor: `${accent}18`,
          borderWidth: 2,
          pointRadius: range === 'LIVE'
            ? (variant === 'modal' ? 2 : 0)
            : (values.length > 82 ? 0 : 2),
          // Only the modal widened the hover/hit targets; inline keeps chart.js defaults.
          ...(variant === 'modal' ? { pointHoverRadius: 4, pointHitRadius: 8 } : {}),
          fill: variant === 'modal' ? range === 'LIVE' : true,
          tension: 0.3,
          spanGaps: false,
        },
        ...(thresholdMax != null ? [thresholdLine(thresholdMax, '#e11d48', `Max ${thresholdMax}`)] : []),
        ...(thresholdMin != null ? [thresholdLine(thresholdMin, '#2563eb', `Min ${thresholdMin}`)] : []),
      ],
    };
  }, [accent, kpiKey, label, labels, range, thresholdMax, thresholdMin, values, variant]);

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
        filter: (item: { datasetIndex: number }) => item.datasetIndex === 0,
        callbacks: {
          // The inline variant keeps chart.js's default title (the bucket label);
          // only the modal swaps in the full date-time of the hovered point.
          ...(variant === 'modal' ? {
            title: (items: Array<{ dataIndex: number }>) => {
              const idx = items[0]?.dataIndex;
              const ms = idx != null ? timestampsMs[idx] : Number.NaN;
              if (idx == null || !Number.isFinite(ms)) return '';
              return new Date(ms).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
            },
          } : {}),
          label: (ctx: { parsed: { y: number } }) => `${ctx.parsed.y?.toFixed(2)} ${resolvedUnit}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: range === '7D' ? 8 : 6,
          font: { size: variant === 'modal' ? 10 : 9 },
          color: '#9ca3af',
        },
        grid: { color: '#f0ecf6' },
      },
      y: {
        min: yAxisRange.min,
        max: yAxisRange.max,
        ticks: {
          font: { size: variant === 'modal' ? 10 : 9 },
          color: '#9ca3af',
          callback: (value: number | string) => (
            variant === 'modal'
              ? `${Number(value).toFixed(1)} ${resolvedUnit}`
              : `${value}`
          ),
        },
        grid: { color: '#f0ecf6' },
      },
    },
  }), [range, resolvedUnit, timestampsMs, variant, yAxisRange.max, yAxisRange.min]);

  useEffect(() => {
    chartRef.current?.update();
  }, [series]);

  return {
    accent,
    chartData,
    chartOptions,
    chartRef,
    error,
    kpiConfigs,
    latestReading: latestSnapshot[kpiKey] ?? null,
    loading,
    range,
    series,
    setRange,
    stats,
    threshold,
    unit: resolvedUnit,
    variant,
  };
}
