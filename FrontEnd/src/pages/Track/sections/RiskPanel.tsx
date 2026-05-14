import { useMemo } from 'react';
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

export default function RiskPanel() {
  // Line chart data for Phase Risk Prediction
  // Light gray line: fluctuating between 6-10
  // Magenta line: fluctuating between 4-8
  
  // Data points for smooth wavy lines (matching the image description)
  const lightGrayData = [
    7, 8.8, 9.5, 8.2, 7.5, 8.8, 9.2, 9.8, 10, 8.5, 6.5, 7.8, 9, 7.5, 8.2, 9.5, 8
  ];

  const magentaData = [
    7, 5.8, 7, 5.5, 4.5, 5.8, 6.5, 7.5, 8, 6.2, 4, 5.5, 7, 6, 5.5, 7.5, 5.5
  ];

  // Generate labels for phases (matching the image which shows Phase 2 and Phase 4)
  // Since we have 17 data points, we'll use empty strings for most labels and only show Phase 2 and Phase 4
  const labels = useMemo(() => {
    const totalPoints = lightGrayData.length;
    return Array.from({ length: totalPoints }, (_, i) => {
      switch (i) {
        case 2:
          return 'Phase 1';
        case 6:
          return 'Phase 2';
        case 10:
          return 'Phase 3';
        case 14:
          return 'Phase 4';
        default:
          return '';
      }
    });
  }, []);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Gray Line',
          data: lightGrayData,
          borderColor: '#C9CBCD',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4, // Smooth curves
          fill: false,
        },
        {
          label: 'Magenta Line',
          data: magentaData,
          borderColor: '#C7A0E8',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4, // Smooth curves
          fill: false,
        },
      ],
    }),
    [labels]
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
            autoSkip: false,
            // Show labels only where they're not empty
            callback: function (_value: any, index: number) {
              const labels = (this as any).chart.data.labels as string[];
              return labels[index] || '';
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          max: 12,
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
            callback: function (value: any) {
              return value;
            },
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
    <div className="bg-white border border-line rounded-lg p-4 h-full flex flex-col">
      <h3 className="font-semibold text-black text-sm text-[16px]">Risk</h3>

      {/* Phase Risk Prediction - Line Chart */}
      <div className="mt-2 flex-1 flex flex-col">
        <div className="text-xs text-gray-600 mb-2">Phase Risk Prediction</div>
        <div className="flex-1 w-full min-h-0">
          <Line data={chartData} options={chartOptions as any} />
        </div>
      </div>
    </div>
  );
}
