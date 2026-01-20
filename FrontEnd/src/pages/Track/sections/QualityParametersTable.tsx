import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  patient_id: string;
  temperature: number;
  humidity: number;
  ph_level: number;
  o2_level: number;
  co2_level: number;
  agitation: number;
  timestamp: string;
  thresholds: {
    temperature: Threshold;
    humidity: Threshold;
    ph_level: Threshold;
    o2_level: Threshold;
    co2_level: Threshold;
    agitation: Threshold;
  };
  threshold_violations: {
    temperature: boolean;
    humidity: boolean;
    ph_level: boolean;
    o2_level: boolean;
    co2_level: boolean;
    agitation: boolean;
  };
  violated_parameters: string[];
  quality_loss?: number;
  quality_status?: string;
  quality_percentage?: number;
}

export default function QualityParametersTable() {
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showQualityLossModal, setShowQualityLossModal] = useState(false);
  const [latest, setLatest] = useState<QualityPayload | null>(null);
  const [exporting, setExporting] = useState(false);
  const { patientId } = useParams<{ patientId: string }>();
  const { token } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const getApiBaseUrl = () => {
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    return envBaseUrl;
  };

  const getWebSocketUrl = () => {
    const baseUrl = getApiBaseUrl();
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/api/quality/ws`;
  };

  const handleExport = async () => {
    if (!patientId) return;

    const authToken = token || authUtils.getToken();
    if (!authToken) {
      console.error('Authentication token not found');
      return;
    }

    setExporting(true);
    try {
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/quality/patients/${patientId}/export`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Get filename from Content-Disposition header or use a default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `quality_export_${patientId}.xlsx`; // Default filename
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // Create a download link and trigger it
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error exporting quality data:', error);
      // You might want to show a toast/notification here
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (!patientId) return;
    const authToken = token || authUtils.getToken();
    if (!authToken) return;

    try {
      const ws = new WebSocket(`${getWebSocketUrl()}?token=${encodeURIComponent(authToken)}`);

      ws.onopen = () => {
        if (patientId) ws.send(JSON.stringify({ patient_id: patientId }));
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: any = JSON.parse(event.data);
          if (data.type === 'subscription_confirmed' || data.type === 'error') return;
          if (data.patient_id && data.timestamp && data.temperature !== undefined) {
            setLatest(data as QualityPayload);
          }
        } catch (e) {
          // ignore parse errors
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
  }, [patientId, token]);

  type Row = { key: keyof QualityPayload['thresholds']; label: string; value: number; threshold: Threshold; violated: boolean };

  const rows: Row[] = useMemo(() => {
    if (!latest) return [];

    const mapping: Array<{ key: Row['key']; label: string; value: number }> = [
      { key: 'temperature', label: 'Temperature', value: latest.temperature },
      { key: 'humidity', label: 'Humidity', value: latest.humidity },
      { key: 'agitation', label: 'Agitation / Vibration', value: latest.agitation },
    ];

    return mapping.map((m) => ({
      key: m.key,
      label: m.label,
      value: m.value,
      threshold: latest.thresholds[m.key],
      violated: latest.threshold_violations[m.key],
    }));
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
    // Add units for specific labels if unit is empty
    if (t.unit) return `${value}${t.unit ? ` ${t.unit}` : ''}`;
    if (label.includes('Temperature')) return `${value} °C`;
    if (label.includes('Humidity')) return `${value} %`;
    if (label.includes('Agitation') || label.includes('Vibration')) {
      // Display as g-force or % index based on unit
      if (t.unit && (t.unit.toLowerCase().includes('g') || t.unit.toLowerCase().includes('force'))) {
        return `${value} ${t.unit}`;
      }
      return `${value} %`;
    }
    return `${value}`;
  };

  return (
    <div className="rounded-[5px] border border-gray-200 h-[320px] bg-white p-4">
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
                  latest.quality_status === 'Critical'
                    ? 'bg-red-600'
                    : latest.quality_status === 'Warning'
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
              onClick={handleExport}
              disabled={exporting || !patientId}
              className="group flex h-8 w-8 items-center justify-center rounded-lg bg-[#6B1176] text-white shadow hover:bg-[#FDF4FF] hover:text-[#6B1176] hover:border-1 hover:border-[#6B1176] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <>
                  <img src={ExtractIcon} alt="Download" className="h-4 w-4 block group-hover:hidden" />
                  <img src={LightExtractIcon} alt="Download" className="h-5 w-5 hidden group-hover:block" />
                </>
              )}
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

      {/* Quality Loss Assessment Modal */}
      <QualityLossModal
        isOpen={showQualityLossModal}
        onClose={() => setShowQualityLossModal(false)}
        qualityLoss={latest?.quality_loss}
        qualityScore={latest?.quality_percentage}
        activeAnomalies={latest ? Object.values(latest.threshold_violations || {}).filter(Boolean).length : 0}
      />
    </div>
  );
}


