import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { authUtils } from '../../../utils/auth';
import ExtractIcon from '../../../assets/TrackAndTraceIcons/Extract.svg';
import LightExtractIcon from '../../../assets/TrackAndTraceIcons/LightExtract.svg';
import QualityLossModal from '../../../components/QualityLossModal';

interface Threshold {
  min: number | null;
  max: number | null;
  unit: string;
}

interface QualityPayload {
  temp_internal: number;
  temp_external: number | null;
  humidity: number;
  shock: number;
  thresholds: {
    temp_internal: Threshold;
    temp_external: Threshold;
    humidity: Threshold;
    shock: Threshold;
  };
  threshold_violations: {
    temp_internal: boolean;
    temp_external: boolean;
    humidity: boolean;
    shock: boolean;
  };
  quality_loss?: number;
  quality_status?: string;
  quality_percentage?: number;
}

interface IVFQualityParametersTableProps {
  canisterNumber?: string;
}

export function IVFQualityParametersTable({ canisterNumber }: IVFQualityParametersTableProps) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showQualityLossModal, setShowQualityLossModal] = useState(false);
  const [latest, setLatest] = useState<QualityPayload | null>(null);

  const getWebSocketUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    const baseUrl = envBaseUrl && envBaseUrl !== 'undefined' ? envBaseUrl : 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/ivf/quality/ws`;
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (!canisterNumber) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) return;

    try {
      const ws = new WebSocket(`${getWebSocketUrl()}?token=${encodeURIComponent(authToken)}`);

      ws.onopen = () => {
        if (canisterNumber) ws.send(JSON.stringify({ canister_number: canisterNumber }));
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: any = JSON.parse(event.data);
          
          if (data.type === 'subscription_confirmed') {
            return;
          }
          
          if (data.type === 'error') {
            return;
          }
          
          // Check if this is quality data (has canister_number or canister_id and timestamp)
          // IVF data uses temp_internal (not temperature) and shock (not agitation)
          const hasCanisterId = data.canister_number || data.canister_id;
          const hasTimestamp = data.timestamp;
          const hasTemperature = data.temperature !== undefined || data.temp_internal !== undefined;
          
          if (hasCanisterId && hasTimestamp && hasTemperature) {
            // Extract IVF field names
            const temp_internal = data.temp_internal !== undefined ? data.temp_internal : data.temperature;
            const temp_external = data.temp_external !== undefined && data.temp_external !== null ? data.temp_external : null;
            const humidity = data.humidity;
            const shock = data.shock !== undefined ? data.shock : data.agitation;
            
            // Only process if we have valid numeric values for required fields
            if (temp_internal !== undefined && temp_internal !== null && 
                humidity !== undefined && humidity !== null && 
                shock !== undefined && shock !== null) {
              // Map the data to QualityPayload format
              const qualityPayload: QualityPayload = {
                temp_internal: typeof temp_internal === 'number' ? temp_internal : parseFloat(temp_internal),
                temp_external: temp_external !== null ? (typeof temp_external === 'number' ? temp_external : parseFloat(temp_external)) : null,
                humidity: typeof humidity === 'number' ? humidity : parseFloat(humidity),
                shock: typeof shock === 'number' ? shock : parseFloat(shock),
                thresholds: {
                  temp_internal: data.thresholds?.temperature || data.thresholds?.temp_internal || { min: null, max: null, unit: '°C' },
                  temp_external: data.thresholds?.temp_external || { min: null, max: null, unit: '°C' },
                  humidity: data.thresholds?.humidity || { min: null, max: null, unit: '%' },
                  shock: data.thresholds?.agitation || data.thresholds?.shock || { min: null, max: null, unit: 'G' },
                },
                threshold_violations: {
                  temp_internal: data.threshold_violations?.temperature || data.threshold_violations?.temp_internal || false,
                  temp_external: data.threshold_violations?.temp_external || false,
                  humidity: data.threshold_violations?.humidity || false,
                  shock: data.threshold_violations?.agitation || data.threshold_violations?.shock || false,
                },
                quality_loss: data.quality_loss,
                quality_status: data.quality_status,
                quality_percentage: data.quality_percentage,
              };
              
              setLatest(qualityPayload);
            }
          }
        } catch (e) {
          // Error parsing WebSocket message
        }
      };

      ws.onerror = () => {};
      ws.onclose = () => {};

      wsRef.current = ws;
    } catch (e) {
      // ignore connection errors here
    }

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'component unmount');
        } catch {}
        wsRef.current = null;
      }
    };
  }, [canisterNumber, token]);

  type Row = {
    key: keyof QualityPayload['thresholds'];
    label: string;
    value: number;
    threshold: Threshold;
    violated: boolean;
  };

  const rows: Row[] = useMemo(() => {
    if (!latest) return [];

    const mapping: Array<{ key: Row['key']; label: string; value: number | null }> = [
      { key: 'temp_internal', label: 'Temperature Internal (°C)', value: latest.temp_internal },
      { key: 'temp_external', label: 'Temperature External (°C)', value: latest.temp_external },
      { key: 'humidity', label: 'Humidity (%)', value: latest.humidity },
      { key: 'shock', label: 'Shock (G)', value: latest.shock },
    ];

    const isViolated = (value: number | null, t: Threshold) => {
      if (value === null || value === undefined) return false;
      const belowMin = t.min !== null && t.min !== undefined && value < t.min;
      const aboveMax = t.max !== null && t.max !== undefined && value > t.max;
      return belowMin || aboveMax;
    };

    return mapping
      .filter((m) => m.value !== null && m.value !== undefined) // Filter out null values
      .map((m) => {
        const threshold = latest.thresholds[m.key];
        return {
          key: m.key,
          label: m.label,
          value: m.value as number,
          threshold,
          violated: isViolated(m.value, threshold),
        };
      });
  }, [latest]);

  const filteredRows = useMemo(() => {
    return showAnomalies ? rows.filter((r) => r.violated) : rows;
  }, [rows, showAnomalies]);

  const hasRows = filteredRows.length > 0;

  const formatRange = (t: Threshold) => {
    const min = t.min !== null && t.min !== undefined ? `${t.min}` : '-';
    const max = t.max !== null && t.max !== undefined ? `${t.max}` : '-';
    const unit = t.unit || '';
    if (min !== '-' && max !== '-') return `${min}${unit ? ` ${unit}` : ''} - ${max}${unit ? ` ${unit}` : ''}`;
    if (min !== '-') return `≥ ${min}${unit ? ` ${unit}` : ''}`;
    if (max !== '-') return `≤ ${max}${unit ? ` ${unit}` : ''}`;
    return '—';
  };

  const formatValueWithUnit = (value: number, t: Threshold, label: string) => {
    if (t.unit) return `${value}${t.unit ? ` ${t.unit}` : ''}`;
    if (label.includes('Temperature')) return `${value} °C`;
    if (label.includes('Humidity')) return `${value} %`;
    if (label.includes('Shock')) return `${value} G`;
    return `${value}`;
  };

  return (
    <div className="rounded-[5px] border border-gray-200 h-[460px] bg-white p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900 text-[16px] mb-2">Quality Parameter</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-black text-[14px] font-medium">Anomalies</span>
            {/* Toggle */}
            <button
              type="button"
              aria-pressed={showAnomalies}
              onClick={() => setShowAnomalies((v) => !v)}
              className={`h-5 w-9 rounded-full transition-colors ${
                showAnomalies ? 'bg-[#6B1176]' : 'bg-gray-300'
              } relative`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  showAnomalies ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {latest?.quality_loss !== undefined ? (
              <button
                type="button"
                onClick={() => setShowQualityLossModal(true)}
                className={`rounded-[6px] px-3 py-2 text-xs font-semibold h-[30px] text-white ${
                  latest.quality_loss >= 30
                    ? 'bg-red-600'
                    : latest.quality_loss >= 15
                    ? 'bg-[#EAB308]'
                    : 'bg-green-600'
                }`}
              >
                Quality Loss: {latest.quality_loss}%
              </button>
            ) : (
              <span className="rounded-[6px] bg-gray-400 px-3 py-2 text-xs font-semibold h-[30px] text-white">
                Quality Loss: —
              </span>
            )}
            <button
              type="button"
              aria-label="Download"
              disabled
              className="group flex h-8 w-8 items-center justify-center rounded-lg bg-[#6B1176] text-white shadow opacity-50 cursor-not-allowed"
            >
              <img src={ExtractIcon} alt="Download" className="h-4 w-4 block group-hover:hidden" />
              <img src={LightExtractIcon} alt="Download" className="h-5 w-5 hidden group-hover:block" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`overflow-x-auto ${hasRows ? 'h-[224px] overflow-y-auto' : ''}`}
        style={{ scrollbarWidth: 'thin' as any }}
      >
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-1.5/6" />
            <col className="w-1.5/6" />
            <col className="w-1/6" />
            <col className="w-2/6" />
          </colgroup>
          <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px] sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px]">Parameter</th>
              <th className="px-3 py-2 text-left">Current Value</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px]">Acceptable Range</th>
            </tr>
          </thead>
          <tbody>
            {hasRows === false ? (
              <tr>
                <td className="px-3 py-4 text-gray-600 text-center" colSpan={4}>
                  <div className="flex items-center justify-center">
                    {latest ? 'No anomalies' : 'Waiting for live data...'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((r, i) => (
                <tr key={i} className="text-black text-[14px] h-[56px] hover:bg-gray-50">
                  <td className="px-3 py-2 text-black text-[14px] ">{r.label}</td>
                  <td className={`px-3 py-2  ${r.violated ? 'text-red-600' : 'text-green-700'}`}>
                    {formatValueWithUnit(r.value, r.threshold, r.label)}
                  </td>
                  <td className={`px-3 py-2 ${r.violated ? 'text-red-600' : 'text-green-700'}`}>
                    {r.violated ? 'Anomaly' : 'Normal'}
                  </td>
                  <td className="px-3 py-2">{formatRange(r.threshold)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <QualityLossModal
        isOpen={showQualityLossModal}
        onClose={() => setShowQualityLossModal(false)}
        qualityLoss={latest?.quality_loss}
        qualityScore={latest?.quality_percentage}
        activeAnomalies={filteredRows.filter((r) => r.violated).length}
      />
    </div>
  );
}

