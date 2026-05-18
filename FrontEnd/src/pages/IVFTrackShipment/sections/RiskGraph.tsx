import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useMemo } from 'react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export type RiskGraphSeries = {
  /** Display name used only for tooltips (legend is hidden) */
  name: string;
  /** Series values (must match the internal label count) */
  data: number[];
  color: string;
};

export type RiskGraphProps = {
  /**
   * X-axis labels to display (only these will render; intermediate ticks remain blank).
   * Defaults to the 3 labels in the UI screenshot.
   */
  displayedCategories?: [string, string, string];
  /**
   * Two-series line chart: a primary series and a comparison series.
   * If not provided, a UI-matching mock is rendered.
   */
  series?: [RiskGraphSeries, RiskGraphSeries];
  /** Y-axis max (defaults to 14 to match screenshot) */
  yMax?: number;
};

const DEFAULT_CATEGORIES: [string, string, string] = [
  'Quality Deviations',
  'Returns & Regulatory',
  '3PL Reliability',
];

// UI-matching mock data: smooth, wavy lines in the 0-14 range.
const DEFAULT_SERIES: [RiskGraphSeries, RiskGraphSeries] = [
  {
    name: 'Baseline',
    color: '#C9CBCD',
    data: [5.2, 4.8, 5.6, 6.2, 6.8, 7.1, 6.9, 6.4, 6.8, 7.0, 6.6, 6.0, 6.7, 7.1, 6.2, 6.8, 7.3],
  },
  {
    name: 'Current',
    color: '#C7A0E8',
    data: [5.8, 4.9, 4.2, 5.0, 6.1, 5.2, 4.6, 4.8, 5.4, 3.9, 4.7, 5.9, 4.8, 5.4, 4.6, 4.2, 4.5],
  },
];

export default function RiskGraph(props: RiskGraphProps) {
  const displayedCategories = props.displayedCategories ?? DEFAULT_CATEGORIES;
  const yMax = props.yMax ?? 14;
  const series = props.series ?? DEFAULT_SERIES;

  const labels = useMemo(() => {
    const points = Math.max(series[0].data.length, series[1].data.length);
    // Show the 3 category labels roughly across the chart; keep the rest blank.
    const idx1 = Math.max(0, Math.floor(points * 0.15));
    const idx2 = Math.max(idx1 + 1, Math.floor(points * 0.55));
    const idx3 = Math.max(idx2 + 1, Math.floor(points * 0.9));
    return Array.from({ length: points }, (_, i) => {
      if (i === idx1) return displayedCategories[0];
      if (i === idx2) return displayedCategories[1];
      if (i === idx3) return displayedCategories[2];
      return '';
    });
  }, [displayedCategories, series]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: series[0].name,
          data: series[0].data,
          borderColor: series[0].color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.42,
          fill: false,
        },
        {
          label: series[1].name,
          data: series[1].data,
          borderColor: series[1].color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.42,
          fill: false,
        },
      ],
    }),
    [labels, series]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          padding: 10,
          cornerRadius: 6,
          titleFont: {
            size: 12,
          },
          bodyFont: {
            size: 11,
          },
          callbacks: {
            label: (context: any) => `${context.dataset.label}: ${context.parsed.y}`,
          },
        },
      },
      layout: { padding: { top: 0, right: 8, bottom: 0, left: 0 } },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#4B4B4B',
            font: { size: 11 },
            maxRotation: 0,
            minRotation: 0,
            autoSkip: false,
            callback: function (_value: any, index: number) {
              const labels = (this as any).chart.data.labels as string[];
              return labels[index] || '';
            },
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          max: yMax,
          grid: {
            color: 'rgba(0,0,0,0.06)',
            drawBorder: false,
            borderDash: [2, 8],
          },
          ticks: {
            stepSize: 2,
            color: '#6B6B6B',
            font: { size: 10 },
          },
          border: { display: false },
        },
      },
    }),
    [yMax]
  );

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[398px]">
      <h3 className="font-semibold text-black text-[16px] mb-12">Risk graph</h3>
      <div className="h-[278px]">
        <Line data={chartData} options={chartOptions as any} />
      </div>
    </div>
  );
}
