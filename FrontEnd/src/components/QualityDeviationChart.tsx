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
  const REQUIRED_METRIC_ORDER = [
    'Battery Level',
    'Lid State',
    'LN2',
    'Evaporation Rate',
    'Internal Temperature',
    'External Temperature',
    'Shock Detection',
  ];

  // Fixed color palette matching current KPI names from API
  const getColorForMetric = (name: string): string => {
    const key = name.toLowerCase();
    if (key.includes('battery')) return '#94A3B8';
    if (key.includes('lid')) return '#A78BFA';
    if (key.includes('ln2')) return '#60A5FA';
    if (key.includes('evaporation')) return '#F59E0B';
    if (key.includes('internal temperature')) return '#EA580C';
    if (key.includes('external temperature')) return '#77DD77';
    if (key.includes('shock')) return '#F5A9E1';
    // Default color
    return '#F5A9E1';
  };

  // Keep requested metrics only, in fixed order.
  const visibleMetrics = useMemo(
    () =>
      REQUIRED_METRIC_ORDER.map((name) => metrics.find((m) => m.name === name))
        .filter((m): m is QualityMetric => !!m),
    [metrics]
  );

  // Calculate maximum value from all metrics data
  const maxValue = useMemo(() => {
    if (visibleMetrics.length === 0 || containers.length === 0) return 100;
    
    let max = 0;
    visibleMetrics.forEach((metric) => {
      metric.data.forEach((value) => {
        if (value > max) max = value;
      });
    });
    
    // Round up to the next nice number (multiple of 10, 20, 50, or 100)
    if (max <= 0) return 100;
    if (max <= 10) return Math.ceil(max / 5) * 5;
    if (max <= 50) return Math.ceil(max / 10) * 10;
    if (max <= 200) return Math.ceil(max / 20) * 20;
    if (max <= 500) return Math.ceil(max / 50) * 50;
    return Math.ceil(max / 100) * 100;
  }, [visibleMetrics, containers]);

  const chartData = useMemo(
    () => {
      // Create grouped datasets so each branch shows separate bars per metric.
      const groupedDatasets = visibleMetrics.map((metric) => ({
        label: metric.name,
        data: metric.data,
        backgroundColor: getColorForMetric(metric.name),
        borderColor: getColorForMetric(metric.name),
        borderWidth: 0,
        barThickness: 7,
        borderRadius: { topLeft: 6, bottomLeft: 6, topRight: 6, bottomRight: 6 },
      }));

      return {
        labels: containers,
        datasets: groupedDatasets,
      };
    },
    [containers, visibleMetrics]
  );

  const legendItems = useMemo(
    () =>
      visibleMetrics.map((m) => ({
        label: m.name,
        color: getColorForMetric(m.name),
      })),
    [visibleMetrics]
  );

  // Calculate required chart height based on number of containers
  const minChartHeight = useMemo(() => {
    if (containers.length === 0) return 200;
    // Need more row height because each branch now has multiple grouped bars.
    const perBranchHeight = Math.max(42, visibleMetrics.length * 7 + 10);
    const totalHeight = containers.length * perBranchHeight;
    // Add padding for labels and margins
    return Math.max(200, totalHeight + 40);
  }, [containers.length, visibleMetrics.length]);

  // Max height for scrollable area (keeping some space for legend and title)
  const maxScrollHeight = 250; // Adjust this value as needed

  const chartOptions = useMemo(
    () => {
      const categoryPercentage = containers.length > 1 ? 0.68 : 0.8;
      
      return {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        categoryPercentage: categoryPercentage,
        barPercentage: 0.9,
        maxBarThickness: 8,
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
        },
          position: 'top' as const,
      },
      scales: {
        x: {
          position: 'top' as const,
          beginAtZero: true,
          max: maxValue,
          grid: {
            color: '#E5E5E5',
            drawBorder: false,
            borderDash: [2, 2],
          },
          ticks: {
            stepSize: maxValue / 5, // Divide into 5 steps for consistent spacing
            callback: (value: string | number) => {
              const numericValue = Number(value);
              if (!Number.isFinite(numericValue)) return String(value);
              return String(Math.round(numericValue));
            },
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
      };
    },
    [maxValue, containers.length]
  );

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[347px] flex flex-col">
      <h3 className="font-semibold text-black text-base text-[16px] mb-2">Deviation Distribution (Site Level)</h3>

      {/* Legend above the graph - single row, wraps on small screens */}
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mb-3 sm:gap-x-5 md:gap-x-6">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 shrink-0">
            <span
              className="inline-block w-[10px] h-[10px] rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-[11px] text-[#4B4B4B] whitespace-nowrap">{item.label}</span>
          </div>
        ))}
      </div>
      <div 
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ 
          maxHeight: `${maxScrollHeight}px`,
        }}
      >
        <div style={{ height: `${minChartHeight}px` }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
