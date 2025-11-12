import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { shipmentService } from '../../../services/shipmentService';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type TransportItem = {
  source_location: string;
  destination_location: string;
  scheduled_time: string; // e.g. "24h" or "1d 6h"
  actual_time: string;    // e.g. "22h"
};

function parseDurationToHours(input: string): number {
  // Supports formats like "24h", "1d 6h", "2d", "90m"
  const lower = (input || '').toLowerCase().trim();
  const dayMatch = lower.match(/(\d+)\s*d/);
  const hourMatch = lower.match(/(\d+)\s*h/);
  const minuteMatch = lower.match(/(\d+)\s*m/);

  const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minuteMatch ? parseInt(minuteMatch[1], 10) : 0;

  if (!dayMatch && !hourMatch && !minuteMatch) {
    // Fallback: extract first number and treat as hours
    const n = parseInt(lower.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  return days * 24 + hours + minutes / 60;
}

function niceMax(maxValue: number): number {
  // Round up to the next multiple of the current magnitude (e.g., 24 -> 30, 67 -> 70)
  if (maxValue <= 10) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
  return Math.ceil(maxValue / magnitude) * magnitude;
}

export default function TransportTimeComparison() {
  const [data, setData] = useState<TransportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: wire patient id from route/context; using the sample here
  const patientId = 'PAT013';

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    shipmentService
      .getTransportTimeComparison(patientId)
      .then((res) => {
        if (mounted) setData(Array.isArray(res) ? res : []);
      })
      .catch((e: any) => {
        if (mounted) setError(e?.message || 'Failed to load chart');
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [patientId]);

  const labels = useMemo(
    () => data.map((_, idx) => `Route ${String.fromCharCode(65 + idx)}`),
    [data]
  );

  const scheduled = useMemo(() => data.map((d) => parseDurationToHours(d.scheduled_time)), [data]);
  const actual = useMemo(() => data.map((d) => parseDurationToHours(d.actual_time)), [data]);

  const maxY = useMemo(() => niceMax(Math.max(1, ...scheduled, ...actual)), [scheduled, actual]);
  const stepY = useMemo(() => Math.max(1, Math.round(maxY / 5)), [maxY]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Scheduled (hrs)'
          , data: scheduled,
          backgroundColor: '#6B1176',
          borderRadius: 6,
          borderSkipped: 'bottom' as any,
          barThickness: 32,
          categoryPercentage: 0.6 as any,
          barPercentage: 0.7 as any,
        },
        {
          label: 'Actual (hrs)'
          , data: actual,
          backgroundColor: '#9C3AA6',
          borderRadius: 6,
          borderSkipped: 'bottom' as any,
          barThickness: 32,
          categoryPercentage: 0.6 as any,
          barPercentage: 0.7 as any,
        },
      ],
    }),
    [labels, scheduled, actual]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'x' as const,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          align: 'center' as const,
          labels: {
            usePointStyle: true,
            padding: 15,
            boxWidth: 8,
            boxHeight: 8,
            font: {
              size: 12,
            },
            color: '#4B4B4B',
          },
        },
        tooltip: {
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return '';
              const idx = items[0].dataIndex;
              const route = data[idx];
              return route
                ? `${route.source_location} -> ${route.destination_location}`
                : '';
            },
            label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}h`,
          },
        },
      },
      scales: {
        // For vertical bars, x is the category axis (Route A, Route B, ...)
        x: {
          grid: { display: false },
          ticks: { color: '#4B4B4B', font: { size: 12 }, padding: 10 },
          stacked: false,
        },
        // y is the value axis
        y: {
          beginAtZero: true,
          max: maxY,
          grid: {
            color: '#EDEDED',
            drawBorder: false,
            borderDash: [2, 2],
          },
          ticks: {
            color: '#7C7C7C',
            callback: (value: any) => `${value}`,
            stepSize: stepY,
            font: { size: 11 },
          },
        },
      },
    }),
    [maxY, stepY, data]
  );

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-full">
      <h3 className="font-semibold text-black text-sm mb-3 text-[16px]">Transport Time Comparison</h3>

      {error && (
        <div className="text-red-500 text-xs mb-2" role="alert">{error}</div>
      )}

      <div className="h-[200px]">
        {loading ? (
          <div className="text-xs text-[#7C7C7C]">Loading...</div>
        ) : (
          <Bar data={chartData} options={options as any} />
        )}
      </div>
    </div>
  );
}


