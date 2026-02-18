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

// Plugin to remove gap between different stacks for horizontal bars
const removeStackGapPlugin = {
  id: 'removeStackGap',
  afterUpdate: (chart: any) => {
    const topRiskDriverStackIndex = chart.data.datasets.findIndex(
      (ds: any) => ds.stack === 'topRiskDriver'
    );

    if (topRiskDriverStackIndex === -1) return;

    // Find the background bar from main stack as reference point
    const backgroundIndex = chart.data.datasets.findIndex(
      (ds: any) => ds.stack === 'qualityDeviation' && ds.label === 'Remaining'
    );

    if (backgroundIndex === -1) return;

    const backgroundMeta = chart.getDatasetMeta(backgroundIndex);
    if (!backgroundMeta || !backgroundMeta.data) return;

    // Adjust top risk driver bar positions to be directly below main stack
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      if (dataset.stack === 'topRiskDriver') {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta && meta.data) {
          meta.data.forEach((bar: any, index: number) => {
            const mainBar = backgroundMeta.data[index];
            if (mainBar) {
              // For horizontal bars, y is the vertical center
              // To place below, we need to move down by bar thickness (8px)
              // Since bars are 8px thick, move down by 8px from the bottom of main bar
              bar.y = mainBar.y + 8; // Move down by bar thickness
            }
          });
        }
      }
    });
  },
};

ChartJS.register(removeStackGapPlugin);

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
    if (key.includes('internal temperature')) return '#C7A0E8';
    if (key.includes('external temperature')) return '#4A90E2';
    if (key.includes('shock')) return '#F5A9E1';
    if (key.includes('top risk driver') || key.includes('top risk')) return '#85A2DF';
    if (key.includes('empty') || key.includes('remaining') || key.includes('unused')) return '#F4F4F4';
    // Default color
    return '#F5A9E1';
  };

  // Filter out agitation/vibration metrics and humidity (but keep shock)
  const visibleMetrics = useMemo(
    () => metrics.filter((m) => {
      const key = m.name.toLowerCase();
      return !key.includes('humidity') && 
             !key.includes('agitation') && 
             !key.includes('vibration');
    }),
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

  // Check if top risk driver metric exists (used for height calculation and chart data)
  const topRiskDriverMetric = useMemo(
    () => visibleMetrics.find(
      (m) => m.name.toLowerCase().includes('top risk driver') || m.name.toLowerCase().includes('top risk')
    ),
    [visibleMetrics]
  );
  const hasTopRiskDriver = !!topRiskDriverMetric;

  const chartData = useMemo(
    () => {
      // Separate top risk driver from other metrics (using pre-calculated topRiskDriverMetric)
      const otherMetrics = visibleMetrics.filter(
        (m) => !(m.name.toLowerCase().includes('top risk driver') || m.name.toLowerCase().includes('top risk'))
      );

      // Calculate remaining space for background bar (maxValue - sum of other metrics for each container)
      const backgroundData = containers.map((_, containerIndex) => {
        const total = otherMetrics.reduce((sum, metric) => sum + (metric.data[containerIndex] || 0), 0);
        return Math.max(0, maxValue - total);
      });

      // Create datasets for other metrics (main stack)
      const mainStackDatasets = otherMetrics.map((metric, index) => ({
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

      // Add background bar for main stack
      const mainBackgroundDataset = {
        label: 'Remaining',
        data: backgroundData,
        backgroundColor: '#F4F4F4',
        borderColor: '#F4F4F4',
        borderWidth: 0,
        stack: 'qualityDeviation',
        barThickness: 8, // Fixed 8px height for horizontal bars
        borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 8, bottomRight: 8 },
      };

      // Create top risk driver dataset (separate stack, appears below)
      const topRiskDriverDataset = topRiskDriverMetric
        ? {
            label: topRiskDriverMetric.name,
            data: topRiskDriverMetric.data,
            backgroundColor: getColorForMetric(topRiskDriverMetric.name),
            borderColor: getColorForMetric(topRiskDriverMetric.name),
            borderWidth: 0,
            stack: 'topRiskDriver', // Different stack ID to separate it
            barThickness: 8, // Fixed 8px height for horizontal bars
            borderRadius: { topLeft: 8, bottomLeft: 8, topRight: 8, bottomRight: 8 },
          }
        : null;

      // Calculate remaining space for top risk driver (if it exists)
      const topRiskDriverBackgroundData = topRiskDriverMetric
        ? containers.map((_, containerIndex) => {
            const riskDriverValue = topRiskDriverMetric.data[containerIndex] || 0;
            return Math.max(0, maxValue - riskDriverValue);
          })
        : [];

      const topRiskDriverBackgroundDataset = topRiskDriverMetric
        ? {
            label: 'Remaining',
            data: topRiskDriverBackgroundData,
            backgroundColor: '#F4F4F4',
            borderColor: '#F4F4F4',
            borderWidth: 0,
            stack: 'topRiskDriver',
            barThickness: 8, // Fixed 8px height for horizontal bars
            borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 8, bottomRight: 8 },
          }
        : null;

      return {
        labels: containers,
        datasets: [
          ...mainStackDatasets,
          mainBackgroundDataset,
          ...(topRiskDriverDataset ? [topRiskDriverDataset] : []),
          ...(topRiskDriverBackgroundDataset ? [topRiskDriverBackgroundDataset] : []),
        ],
      };
    },
    [containers, visibleMetrics, maxValue, topRiskDriverMetric]
  );

  const legendItems = useMemo(
    () =>
      visibleMetrics
        .filter((m) => {
          // Exclude background/remaining metrics from legend
          const key = m.name.toLowerCase();
          return !key.includes('empty') && !key.includes('remaining') && !key.includes('unused');
        })
        .map((m) => ({
          label: m.name,
          color: getColorForMetric(m.name),
        })),
    [visibleMetrics]
  );

  // Calculate required chart height based on number of containers
  // Each bar is 8px thick, with exactly 10px spacing between containers
  // If top risk driver exists, each container has 2 bars (16px total)
  const minChartHeight = useMemo(() => {
    if (containers.length === 0) return 200;
    const barHeight = hasTopRiskDriver ? 16 : 8; // 2 bars stacked or 1 bar
    const spacingBetweenContainers = 10; // 10px spacing between each container
    // Formula: (n-1) * spacing + n * barHeight
    // For n containers: (n-1) spaces of 10px + n bars
    const totalHeight = (containers.length - 1) * spacingBetweenContainers + containers.length * barHeight;
    // Add padding for labels and margins
    return Math.max(200, totalHeight + 40);
  }, [containers.length, hasTopRiskDriver]);

  // Max height for scrollable area (keeping some space for legend and title)
  const maxScrollHeight = 250; // Adjust this value as needed

  const chartOptions = useMemo(
    () => {
      // Calculate categoryPercentage to achieve approximately 10px spacing
      // Lower percentage = more spacing between categories
      // With our height calculation, we ensure 10px spacing, so adjust categoryPercentage accordingly
      const categoryPercentage = containers.length > 1 ? 0.5 : 0.8; // Lower value creates more spacing
      
      return {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        categoryPercentage: categoryPercentage, // Adjusted to create more spacing
        barPercentage: 1.0, // Bars fill their group completely
        maxBarThickness: 8, // Fixed bar thickness
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
          max: maxValue,
          grid: {
            color: '#E5E5E5',
            drawBorder: false,
            borderDash: [2, 2],
          },
          ticks: {
            stepSize: maxValue / 5, // Divide into 5 steps for consistent spacing
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
