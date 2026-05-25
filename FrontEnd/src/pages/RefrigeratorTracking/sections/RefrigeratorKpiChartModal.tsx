import { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { X } from 'lucide-react';
import { ivfService } from '../../../services/ivfService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const KPI_LABELS: Record<string, string> = {
  freezer_temperature: 'Freezer Temperature',
  refrigerator_temperature: 'Refrigerator Temperature',
};

const KPI_COLORS: Record<string, string> = {
  freezer_temperature: '#1a7abb',
  refrigerator_temperature: '#7a22c8',
};

type Props = {
  refrigeratorId: number;
  kpiKey: string;
  onClose: () => void;
};

type DataPoint = { timestamp: string; value: number };

export default function RefrigeratorKpiChartModal({ refrigeratorId, kpiKey, onClose }: Props) {
  const [series, setSeries] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    ivfService
      .getRefrigeratorKpiHistory(refrigeratorId, 1440)
      .then((res) => {
        const raw = res.kpi_series?.[kpiKey] ?? [];
        setSeries(raw.map((p) => ({ timestamp: p.timestamp, value: p.value })));
      })
      .catch(() => setError('Failed to load chart data.'))
      .finally(() => setLoading(false));
  }, [refrigeratorId, kpiKey]);

  const labels = series.map((p) => {
    const d = new Date(p.timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  });
  const values = series.map((p) => p.value);
  const color = KPI_COLORS[kpiKey] ?? '#7a22c8';
  const label = KPI_LABELS[kpiKey] ?? kpiKey;

  const chartData = {
    labels,
    datasets: [
      {
        label,
        data: values,
        borderColor: color,
        backgroundColor: `${color}18`,
        borderWidth: 2,
        pointRadius: series.length > 60 ? 0 : 3,
        fill: true,
        tension: 0.3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y?.toFixed(2)} °C`,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 } },
        grid: { color: '#f0ecf6' },
      },
      y: {
        ticks: { font: { size: 10 } },
        grid: { color: '#f0ecf6' },
      },
    },
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Last 24 hours</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 h-72 flex items-center justify-center">
          {loading && (
            <span className="text-sm text-gray-400">Loading…</span>
          )}
          {!loading && error && (
            <span className="text-sm text-red-500">{error}</span>
          )}
          {!loading && !error && series.length === 0 && (
            <span className="text-sm text-gray-400">No data for this period.</span>
          )}
          {!loading && !error && series.length > 0 && (
            <div className="w-full h-full">
              <Line data={chartData} options={chartOptions as any} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
