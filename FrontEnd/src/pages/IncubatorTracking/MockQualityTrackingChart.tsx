import { useMemo, useState } from 'react';

type TimeRangeId = 'LIVE' | '1H' | '24H' | '7D';
type KpiId = 'temp' | 'co2' | 'ph' | 'humidity';

const KPI_TABS: Array<{ id: KpiId; label: string; unit: string }> = [
  { id: 'temp', label: 'Temperature', unit: '°C' },
  { id: 'co2', label: 'CO₂ Conc', unit: '%' },
  { id: 'ph', label: 'pH Level', unit: '' },
  { id: 'humidity', label: 'Humidity', unit: '%' },
];

const RANGE_MINUTES: Record<TimeRangeId, number> = {
  LIVE: 20,
  '1H': 60,
  '24H': 24 * 60,
  '7D': 7 * 24 * 60,
};

const now = Date.now();
const mockSeriesByKpi: Record<KpiId, Array<{ timestamp: number; value: number }>> = {
  temp: Array.from({ length: 36 }, (_, i) => ({
    timestamp: now - (35 - i) * 20 * 60 * 1000,
    value: 37 + Math.sin(i / 5) * 0.25,
  })),
  co2: Array.from({ length: 36 }, (_, i) => ({
    timestamp: now - (35 - i) * 20 * 60 * 1000,
    value: 6 + Math.sin(i / 4) * 0.2,
  })),
  ph: Array.from({ length: 36 }, (_, i) => ({
    timestamp: now - (35 - i) * 20 * 60 * 1000,
    value: 7.35 + Math.sin(i / 6) * 0.04,
  })),
  humidity: Array.from({ length: 36 }, (_, i) => ({
    timestamp: now - (35 - i) * 20 * 60 * 1000,
    value: 95 + Math.sin(i / 7) * 1.1,
  })),
};

function buildPath(values: number[], width: number, height: number) {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 12) - 6;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export default function MockQualityTrackingChart() {
  const [activeKpi, setActiveKpi] = useState<KpiId>('temp');
  const [timeRange, setTimeRange] = useState<TimeRangeId>('LIVE');
  const rangeMinutes = RANGE_MINUTES[timeRange];
  const activeUnit = KPI_TABS.find((tab) => tab.id === activeKpi)?.unit ?? '';

  const filteredSeries = useMemo(() => {
    const series = mockSeriesByKpi[activeKpi];
    const startMs = Date.now() - rangeMinutes * 60 * 1000;
    return series.filter((point) => point.timestamp >= startMs);
  }, [activeKpi, rangeMinutes]);

  const values = filteredSeries.map((item) => item.value);
  const chartPath = buildPath(values, 840, 210);
  const latestValue = filteredSeries.length ? filteredSeries[filteredSeries.length - 1].value : null;

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-black text-[16px]">Quality Tracking</h3>
        <div className="flex items-center gap-1 text-[13px] text-[#22a06b]">
          <span className="h-2 w-2 rounded-full bg-[#22a06b]" />
          <span>Connected</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {KPI_TABS.map((tab) => {
          const isActive = tab.id === activeKpi;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveKpi(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-[#6B1176] text-white border-[#6B1176]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#6B1176] hover:text-[#6B1176]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 rounded-lg border border-[#E7E1E1] bg-[#FBF9FD] p-3 min-h-[210px]">
        {filteredSeries.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">Waiting for data...</div>
        ) : (
          <svg viewBox="0 0 840 210" className="w-full h-full">
            <defs>
              <linearGradient id="incuChartLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#8b48a0" />
                <stop offset="100%" stopColor="#6B1176" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((row) => (
              <line
                key={row}
                x1="0"
                x2="840"
                y1={12 + row * 62}
                y2={12 + row * 62}
                stroke="#ECE7F2"
                strokeWidth="1"
              />
            ))}
            <path d={chartPath} fill="none" stroke="url(#incuChartLine)" strokeWidth="3" />
            {values.map((value, idx) => {
              const min = Math.min(...values);
              const max = Math.max(...values);
              const span = Math.max(max - min, 0.0001);
              const x = (idx / (values.length - 1 || 1)) * 840;
              const y = 210 - ((value - min) / span) * (210 - 12) - 6;
              return <circle key={`${idx}-${value}`} cx={x} cy={y} r="2.8" fill="#6B1176" />;
            })}
          </svg>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-gray-500">
        <div>
          Latest: {latestValue == null ? '—' : `${latestValue.toFixed(activeKpi === 'ph' ? 2 : 1)}${activeUnit}`}
        </div>
        <div className="flex items-center gap-2">
          <span>Range:</span>
          {(['LIVE', '1H', '24H', '7D'] as TimeRangeId[]).map((range) => {
            const isActive = range === timeRange;
            return (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={`px-2 py-1 rounded text-xs font-medium border ${
                  isActive
                    ? 'bg-[#6B1176] text-white border-[#6B1176]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#6B1176] hover:text-[#6B1176]'
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}