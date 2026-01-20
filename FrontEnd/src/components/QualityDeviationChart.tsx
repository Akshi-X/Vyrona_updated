import { useMemo } from 'react';
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

interface QualityMetric {
  name: string;
  color: string;
  data: number[];
}

interface QualityDeviationChartProps {
  timestamps: string[];
  metrics: QualityMetric[];
}

export default function QualityDeviationChart({ timestamps, metrics }: QualityDeviationChartProps) {
  // Fixed color palette matching design
  const getColorForMetric = (name: string): string => {
    const key = name.toLowerCase();
    if (key.includes('temperature')) return '#C7A0E8';
    if (key.includes('humidity')) return '#C9CBCD';
    // Agitation / Vibration (default)
    return '#F5A9E1';
  };

  const chartData = useMemo(
    () => ({
      labels: timestamps,
      datasets: metrics.map((metric) => ({
        label: metric.name,
        data: metric.data,
        borderColor: getColorForMetric(metric.name),
        backgroundColor: 'transparent',
        borderWidth: 2,
        // filled markers (matching legend)
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: getColorForMetric(metric.name),
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1,
        tension: 0.4,
        fill: false,
      })),
    }),
    [timestamps, metrics]
  );

  const legendItems = useMemo(
    () =>
      metrics.map((m) => ({
        label: m.name,
        color: getColorForMetric(m.name),
      })),
    [metrics]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          // Render custom legend above the chart (under the title)
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 8,
          titleFont: {
            size: 12,
          },
          bodyFont: {
            size: 11,
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#4B4B4B',
            font: {
              size: 11,
            },
            maxRotation: 0,
            minRotation: 0,
            padding: 14,
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          max: 8,
          grid: {
            color: '#E5E5E5',
            drawBorder: false,
            borderDash: [2, 2],
          },
          ticks: {
            stepSize: 2,
            color: '#666666',
            font: {
              size: 11,
            },
            padding: 10,
          },
          border: {
            display: false,
          },
        },
      },
    }),
    []
  );

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[347px] flex flex-col">
      <h3 className="font-semibold text-black text-base text-[16px] mb-2">Quality deviation</h3>

      {/* Legend above the graph */}
      <div className="flex items-center gap-6 mb-3">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="inline-block w-[10px] h-[10px] rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-[11px] text-[#4B4B4B]">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
