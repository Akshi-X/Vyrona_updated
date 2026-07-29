import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Snowflake, Thermometer } from 'lucide-react';
import RefrigeratorKpiGraph from '../commonComponent/RefrigeratorKpiGraph';
import { parseRefrigeratorGraphTimestamp, useRefrigeratorKpiGraph } from '../commonComponent/useRefrigeratorKpiGraph';

type Props = {
  refrigeratorId: number;
  kpiKey: string;
  zoneId?: string | null;
  onClose: () => void;
};

export default function RefrigeratorKpiChartModal({ refrigeratorId, kpiKey, zoneId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<string>(kpiKey ?? 'refrigerator_temp');
  const backdropRef               = useRef<HTMLDivElement>(null);

  const getAccent = (kpiName: string): string => {
    if (kpiName.includes('temp')) return '#1a7abb';
    if (kpiName.includes('humidity')) return '#7a22c8';
    return '#6b7280';
  };

  const fallbackTab = {
    label: activeTab,
    unit: activeTab.includes('humidity') ? '%' : '°C',
    accent: getAccent(activeTab),
  };
  const graphController = useRefrigeratorKpiGraph({
    refrigeratorId,
    kpiKey: activeTab,
    zoneId,
    variant: 'modal',
    accent: fallbackTab.accent,
    unit: fallbackTab.unit,
    label: fallbackTab.label,
    trackLatestSnapshot: true,
  });
  const kpiConfigs = graphController.kpiConfigs;
  const config = kpiConfigs.find((c) => c.kpi_name === activeTab);
  const tab = config ? {
    label: config.alert_name ?? config.kpi_name,
    unit: config.unit || fallbackTab.unit,
    accent: getAccent(config.kpi_name),
  } : fallbackTab;
  const accent = tab.accent;
  const latestReading = graphController.latestReading;

  const latestValue = useMemo(() => {
    if (latestReading?.value == null) return '—';
    return `${latestReading.value.toFixed(1)}${tab.unit}`;
  }, [latestReading, tab.unit]);

  const latestTimestamp = useMemo(() => {
    if (!latestReading?.timestamp) return '—';
    const d = parseRefrigeratorGraphTimestamp(latestReading.timestamp);
    if (!d) return '—';
    const nowMs = Date.now();
    const diffMs = Math.max(0, nowMs - d.getTime());
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin <= 0) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    const hours = Math.floor(diffMin / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }, [latestReading]);

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
        style={{ background: '#fff', borderRadius: 20, border: '1px solid #e6d6ee', boxShadow: '0 20px 60px -10px #40115340, 0 4px 16px #4011530a' }}
      >
        {/* Header */}
        <div style={{ background: '#f7f2fa', borderBottom: '1px solid #efe5f4', padding: '14px 18px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#8b6c97', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {tab.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: accent, marginTop: 4 }}>
                    {latestValue}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    {latestTimestamp}
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '6px', borderRadius: 8, border: '1px solid #d9c9e6', background: '#fff', color: '#6b4a78', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* KPI Tabs */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {kpiConfigs.map((c) => {
              const isActive = activeTab === c.kpi_name;
              const tabAccent = getAccent(c.kpi_name);
              const Icon = c.kpi_name.includes('humidity') ? Snowflake : Thermometer;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveTab(c.kpi_name)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: isActive ? `1px solid ${tabAccent}` : '1px solid #e6d6ee',
                    background: isActive ? `${tabAccent}14` : '#fff',
                    color: isActive ? tabAccent : '#6b5a70',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Icon size={12} />
                  {c.alert_name ?? c.kpi_name}
                </button>
              );
            })}
          </div>
        </div>

        <RefrigeratorKpiGraph controller={graphController} />
      </div>
    </div>,
    document.body
  );
}
