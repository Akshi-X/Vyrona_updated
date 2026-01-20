import { useMemo, useState, useEffect } from 'react';
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

interface DataPoint {
  timestamp: string;
  temperature: number;
  humidity: number;
  agitation: number;
}

// Simple helper to build nice time-like labels for the mock data
const buildMockTimestamps = (count: number): string[] => {
  const now = new Date();
  const points: string[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 1000); // 1 minute apart
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    points.push(`${displayHours}:${minutes}:${seconds} ${ampm}`);
  }

  return points;
};

export default function IVFQualityTrackingChart() {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);

  // Initialize some mock data once on mount
  useEffect(() => {
    const timestamps = buildMockTimestamps(12);

    // Example gently-varying curves to resemble live data
    const mock: DataPoint[] = timestamps.map((ts, idx) => {
      const base = idx;
      return {
        timestamp: ts,
        temperature: 4 + Math.sin(base / 2) * 1.5 + (idx % 3) * 0.3,
        humidity: 6 + Math.cos(base / 2.3) * 5 + (idx % 2) * 0.4,
        agitation: 2 + Math.sin(base / 1.8) * 0.8,
      };
    });

    setDataPoints(mock);
  }, []);

  const chartData = useMemo(() => {
    const palette = {
      temperature: '#8AB6F9',
      humidity: '#DE88E6',
      agitation: '#BDBDBD',
    } as const;

    const labels = dataPoints.map((point) => point.timestamp);

    const displayLabels = labels.map((label, index) => {
      if (labels.length <= 4) return label;
      if (index === 0) return label;
      if (index === Math.floor(labels.length / 2)) return label;
      if (index === labels.length - 1) return label;
      return '';
    });

    return {
      labels: displayLabels,
      datasets: [
        {
          label: 'Temperature (°C)',
          data: dataPoints.map((point) => point.temperature),
          borderColor: palette.temperature,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.temperature,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Humidity (%)',
          data: dataPoints.map((point) => point.humidity),
          borderColor: palette.humidity,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.humidity,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Agitation / Vibration',
          data: dataPoints.map((point) => point.agitation),
          borderColor: palette.agitation,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.agitation,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.4,
          fill: false,
        },
      ],
    };
  }, [dataPoints]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
            color: '#4B4B4B',
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 11 },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          padding: 10,
          cornerRadius: 6,
          caretSize: 6,
          usePointStyle: true,
          boxWidth: 6,
          boxHeight: 6,
          titleMarginBottom: 6,
          bodySpacing: 4,
          titleFont: {
            size: 12,
          },
          bodyFont: {
            size: 11,
          },
          displayColors: true,
        },
      },
      layout: { padding: { top: 0, right: 8, bottom: 0, left: 0 } },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          grid: {
            display: true,
            color: 'rgba(0,0,0,0.06)',
            borderDash: [2, 6],
          },
          ticks: {
            color: '#4B4B4B',
            font: {
              size: 11,
            },
            maxRotation: 0,
            minRotation: 0,
            autoSkip: false,
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: (() => {
            const allValues = dataPoints.flatMap((p) => [
              p.temperature,
              p.humidity,
              p.agitation,
            ]);
            if (allValues.length === 0) return 10;
            const maxVal = Math.max(...allValues);
            const roundedToTen = Math.ceil(maxVal / 10) * 10;
            return roundedToTen + 2;
          })(),
          grid: {
            color: 'rgba(0,0,0,0.06)',
            drawBorder: false,
            borderDash: [2, 8],
          },
          ticks: {
            stepSize: 2,
            color: '#6B6B6B',
            font: {
              size: 10,
            },
          },
          border: {
            display: false,
          },
        },
      },
    }),
    [dataPoints]
  );

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[460px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-black text-[16px]">Quality Tracking</h3>
      </div>

      <div className="h-[380px]">
        {dataPoints.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#7C7C7C]">
            Loading mock data...
          </div>
        ) : (
          <Line data={chartData} options={chartOptions as any} />
        )}
      </div>
    </div>
  );
}

