import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
);

interface QualityMetric {
  name: string;
  color: string;
  data: number[];
}

interface QualityDeviationChartProps {
  containers: string[];
  metrics: QualityMetric[];
}

export default function QualityDeviationChart({ containers, metrics }: QualityDeviationChartProps) {
  // Fixed color palette matching design
  const getColorForMetric = (name: string): string => {
    const key = name.toLowerCase();
    if (key.includes('temperature')) return '#C7A0E8';
    if (key.includes('humidity')) return '#C9CBCD';
    if (key.includes('top risk driver') || key.includes('top risk')) return '#85A2DF';
    if (key.includes('empty') || key.includes('remaining') || key.includes('unused')) return '#F4F4F4';
    // Agitation / Vibration (default)
    return '#F5A9E1';
  };

  const chartData = useMemo(
    () => {
      // Calculate remaining space for background bar (100 - sum of all metrics for each container)
      const backgroundData = containers.map((_, containerIndex) => {
        const total = metrics.reduce((sum, metric) => sum + (metric.data[containerIndex] || 0), 0);
        return Math.max(0, 100 - total);
      });

      // Create datasets for metrics
      const metricDatasets = metrics.map((metric, index) => ({
        label: metric.name,
        data: metric.data,
        backgroundColor: getColorForMetric(metric.name),
        borderColor: getColorForMetric(metric.name),
        borderWidth: 0,
        stack: 'qualityDeviation',
        barThickness: 8, // Fixed 8px height for horizontal bars
        borderRadius: index === 0 
          ? { topLeft: 8, bottomLeft: 8, topRight: 0, bottomRight: 0 }
          : 0,
      }));

      // Add background bar as the last dataset (rightmost, gets right rounding)
      const backgroundDataset = {
        label: 'Remaining',
        data: backgroundData,
        backgroundColor: '#F4F4F4',
        borderColor: '#F4F4F4',
        borderWidth: 0,
        stack: 'qualityDeviation',
        barThickness: 8, // Fixed 8px height for horizontal bars
        borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 8, bottomRight: 8 },
      };

      return {
        labels: containers,
        datasets: [...metricDatasets, backgroundDataset],
      };
    },
    [containers, metrics]
  );

  const legendItems = useMemo(
    () =>
      metrics
        .filter((m) => {
          // Exclude background/remaining metrics from legend
          const key = m.name.toLowerCase();
          return !key.includes('empty') && !key.includes('remaining') && !key.includes('unused');
        })
        .map((m) => ({
          label: m.name,
          color: getColorForMetric(m.name),
        })),
    [metrics]
  );

  const chartOptions = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
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
          filter: (tooltipItem: any) => {
            // Hide background/remaining bar from tooltips
            return tooltipItem.dataset.label !== 'Remaining';
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: '#E5E5E5',
            drawBorder: false,
            borderDash: [2, 2],
          },
          ticks: {
            stepSize: 20,
            color: '#4B4B4B',
            font: {
              size: 11,
            },
            padding: 10,
          },
          border: {
            display: false,
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#4B4B4B',
            font: {
              size: 11,
            },
            padding: 14,
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
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
