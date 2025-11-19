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

  // Always show 3 routes (Route A, B, C), padding with empty data if needed
  // Route A should be at the bottom
  const totalRoutes = 3;
  const labels = useMemo(
    () => {
      return Array.from({ length: totalRoutes }, (_, i) => {
        return i < data.length ? `Route ${String.fromCharCode(65 + i)}` : '--';
      });
    },
    [data]
  );

  const scheduled = useMemo(() => {
    return Array.from({ length: totalRoutes }, (_, i) => {
      return i < data.length ? parseDurationToHours(data[i].scheduled_time) : 0;
    });
  }, [data]);

  const actual = useMemo(() => {
    return Array.from({ length: totalRoutes }, (_, i) => {
      return i < data.length ? parseDurationToHours(data[i].actual_time) : 0;
    });
  }, [data]);

  // Fixed scale to 100 as shown in the image
  const maxScale = 100;
  const stepSize = 20; // Steps of 20 (0, 20, 40, 60, 80, 100)

  // Calculate remaining space for background segment
  const remaining = useMemo(
    () => {
      // scheduled and actual are already reversed, so remaining will match
      return scheduled.map((sched, idx) => Math.max(0, maxScale - sched - actual[idx]));
    },
    [scheduled, actual]
  );

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Scheduled',
          data: scheduled,
          backgroundColor: '#6B1176',
          borderRadius: { topLeft: 5, bottomLeft: 5,topRight: 0, bottomRight: 0 },
          borderSkipped: false as any,
          maxBarThickness: 8,
        },
        {
          label: 'Actual',
          data: actual,
          backgroundColor: '#9C3AA6',
          borderRadius: 0,
          borderSkipped: false as any,
          maxBarThickness: 8,
        },
        {
          label: '', // Empty label for background segment
          data: remaining,
          backgroundColor: '#EDEDED',
          borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 5, bottomRight: 5 },
          borderSkipped: false as any,
          maxBarThickness: 8,
          tooltip: {
            enabled: false,
          },
        },
      ],
    }),
    [labels, scheduled, actual, remaining]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y' as const, // Horizontal bars
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          align: 'start' as const, // Left-aligned as shown in image
          labels: {
            usePointStyle: true,
            padding: 15,
            boxWidth: 8,
            boxHeight: 8,
            font: {
              size: 12,
            },
            color: '#4B4B4B',
            filter: (item: any) => item.text !== '', // Hide empty label (background segment)
          },
        },
        tooltip: {
          filter: (item: any) => {
            // Hide tooltip for background segment and empty routes
            if (item.datasetIndex === 2) return false;
            const idx = item.dataIndex;
            // Hide tooltip if this is an empty route (no data from backend)
            if (idx >= data.length) return false;
            return true;
          },
          callbacks: {
            title: (items: any[]) => {
              if (!items?.length) return '';
              const idx = items[0].dataIndex;
              // Only show tooltip for routes with actual data
              if (idx >= data.length) return '';
              const route = data[idx];
              return route
                ? `${route.source_location} -> ${route.destination_location}`
                : '';
            },
            label: (ctx: any) => {
              if (!ctx.dataset.label) return '';
              return `${ctx.dataset.label}: ${ctx.parsed.x}h`;
            },
          },
        },
      },
      scales: {
        // For horizontal bars, x is the value axis (0-100)
        x: {
          beginAtZero: true,
          max: maxScale,
          stacked: true,
          grid: {
            color: '#EDEDED',
            drawBorder: false,
            borderDash: [2, 2],
          },
          ticks: {
            color: '#7C7C7C',
            stepSize: stepSize,
            font: { size: 11 },
            callback: (value: any) => `${value}`,
          },
        },
        // y is the category axis (Route A, Route B, ...)
        y: {
          stacked: true,
          reverse: true, // Reverse so Route A (first item) appears at the bottom
          grid: { 
            display: true,
            color: '#EDEDED',
            drawBorder: false,
          },
          categoryPercentage: 0.6,
          barPercentage: 0.7,
          ticks: { 
            color: '#4B4B4B', 
            font: { size: 12 }, 
            padding: 10,
            callback: (_value: any, index: number) => {
              // Return the label for this index (will be "--" for empty routes)
              return labels[index] || '--';
            },
          },
        },
      },
    }),
    [maxScale, stepSize, data, labels]
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


