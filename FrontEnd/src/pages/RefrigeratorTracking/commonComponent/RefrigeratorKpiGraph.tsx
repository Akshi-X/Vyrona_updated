import { Line } from 'react-chartjs-2';
import {
  REFRIGERATOR_GRAPH_TIME_RANGES,
  type RefrigeratorKpiGraphController,
} from './useRefrigeratorKpiGraph';

type RefrigeratorKpiGraphProps = {
  controller: RefrigeratorKpiGraphController;
};

export default function RefrigeratorKpiGraph({ controller }: RefrigeratorKpiGraphProps) {
  const {
    accent,
    chartData,
    chartOptions,
    chartRef,
    error,
    loading,
    range,
    series,
    setRange,
    stats,
    unit,
    variant,
  } = controller;

  if (variant === 'inline') {
    return (
      <div>
        <div style={{ padding: '10px 12px 0', minHeight: 120 }}>
          <div style={{ height: 120, position: 'relative' }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg className="animate-spin" style={{ width: 20, height: 20, color: accent }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {!loading && error && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#dc2626', textAlign: 'center', padding: '0 8px' }}>
                {error}
              </div>
            )}
            {!loading && !error && series.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#9ca3af' }}>
                No data
              </div>
            )}
            {!loading && !error && series.length > 0 && (
              <Line ref={chartRef} data={chartData} options={chartOptions} />
            )}
          </div>
        </div>
        <div style={{ padding: '8px 12px 10px', borderTop: '1px solid #f0e8f4', marginTop: 6 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {(['min', 'max', 'avg'] as const).map((key, index) => (
              <div
                key={key}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  borderRight: index < 2 ? '1px solid #f0e8f4' : undefined,
                  paddingRight: index < 2 ? 8 : 0,
                  paddingLeft: index > 0 ? 8 : 0,
                }}
              >
                <div style={{ fontSize: 8, fontWeight: 600, color: '#a07ab8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {key}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginTop: 1 }}>
                  {stats[key] !== null ? `${stats[key]!.toFixed(1)}` : '—'}
                  <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 1 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500 }}>Range:</span>
            <div style={{ display: 'flex', borderRadius: 6, border: '1px solid #e6d6ee', overflow: 'hidden', background: '#fdfbfe' }}>
              {REFRIGERATOR_GRAPH_TIME_RANGES.map((timeRange) => (
                <button
                  key={timeRange.id}
                  type="button"
                  onClick={() => setRange(timeRange.id)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 9,
                    fontWeight: 600,
                    background: range === timeRange.id ? accent : 'transparent',
                    color: range === timeRange.id ? '#fff' : '#6b5a70',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {timeRange.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '16px 18px 0', flex: 1 }}>
        <div style={{ height: 240, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="animate-spin" style={{ width: 28, height: 28, color: accent }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          {!loading && error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}
          {!loading && !error && series.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9ca3af' }}>
              No data for this period.
            </div>
          )}
          {!loading && !error && series.length > 0 && (
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #f0e8f4', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
          {(['min', 'max', 'avg'] as const).map((key, index) => (
            <div
              key={key}
              style={{
                flex: 1,
                textAlign: 'center',
                borderRight: index < 2 ? '1px solid #f0e8f4' : undefined,
                paddingRight: index < 2 ? 12 : 0,
                paddingLeft: index > 0 ? 12 : 0,
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 600, color: '#a07ab8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {key}
              </div>
              {loading ? (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
                  <div className="animate-pulse" style={{ width: 36, height: 16, borderRadius: 4, background: '#ece3f2' }} />
                </div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: accent, marginTop: 2 }}>
                  {stats[key] !== null ? `${stats[key]!.toFixed(1)}` : '—'}
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>{unit}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#9ca3af', marginRight: 4, fontWeight: 500 }}>Range:</span>
          <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #e6d6ee', overflow: 'hidden', background: '#fdfbfe' }}>
            {REFRIGERATOR_GRAPH_TIME_RANGES.map((timeRange) => (
              <button
                key={timeRange.id}
                type="button"
                onClick={() => setRange(timeRange.id)}
                style={{
                  padding: '5px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: range === timeRange.id ? accent : 'transparent',
                  color: range === timeRange.id ? '#fff' : '#6b5a70',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {timeRange.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
