import { useMemo, useState } from 'react';
import ExtractIcon from '../../../assets/TrackAndTraceIcons/Extract.svg';
import LightExtractIcon from '../../../assets/TrackAndTraceIcons/LightExtract.svg';
import QualityLossModal from '../../../components/QualityLossModal';

interface Threshold {
  min: number | null;
  max: number | null;
  unit: string;
}

interface QualityPayload {
  temperature: number;
  humidity: number;
  agitation: number;
  thresholds: {
    temperature: Threshold;
    humidity: Threshold;
    agitation: Threshold;
  };
  threshold_violations: {
    temperature: boolean;
    humidity: boolean;
    agitation: boolean;
  };
  quality_loss?: number;
  quality_status?: string;
  quality_percentage?: number;
}

const mockQualityPayload: QualityPayload = {
  temperature: 11.8,
  humidity: 72,
  agitation: 18,
  thresholds: {
    temperature: { min: 2, max: 8, unit: '°C' },
    humidity: { min: 40, max: 60, unit: '%' },
    agitation: { min: 0, max: 10, unit: '%' },
  },
  threshold_violations: {
    temperature: true,
    humidity: true,
    agitation: true,
  },
  quality_loss: 11.5,
  quality_status: 'Warning',
  quality_percentage: 88.5,
};

export function IVFQualityParametersTable() {
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showQualityLossModal, setShowQualityLossModal] = useState(false);
  const [latest] = useState<QualityPayload | null>(mockQualityPayload);

  type Row = {
    key: keyof QualityPayload['thresholds'];
    label: string;
    value: number;
    threshold: Threshold;
    violated: boolean;
  };

  const rows: Row[] = useMemo(() => {
    if (!latest) return [];

    const mapping: Array<{ key: Row['key']; label: string; value: number }> = [
      { key: 'temperature', label: 'Temperature (°C)', value: latest.temperature },
      { key: 'humidity', label: 'Humidity (%)', value: latest.humidity },
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
    if (t.unit) return `${value}${t.unit ? ` ${t.unit}` : ''}`;
    if (label.includes('Temperature')) return `${value} °C`;
    if (label.includes('Humidity')) return `${value} %`;
    if (label.includes('Agitation') || label.includes('Vibration')) return `${value} %`;
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
                    {latest ? 'No anomalies' : 'Waiting for data...'}
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
        activeAnomalies={latest ? Object.values(latest.threshold_violations || {}).filter(Boolean).length : 0}
      />
    </div>
  );
}

