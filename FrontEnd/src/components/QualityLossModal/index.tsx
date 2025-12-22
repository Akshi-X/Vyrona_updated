import React from 'react';
import Modal from '../Modal';

interface QualityLossModalProps {
  isOpen: boolean;
  onClose: () => void;
  qualityLoss?: number;
  qualityScore?: number;
  activeAnomalies?: number;
}

const QualityLossModal: React.FC<QualityLossModalProps> = ({
  isOpen,
  onClose,
  qualityLoss,
  qualityScore,
  activeAnomalies,
}) => {
  if (!isOpen) return null;

  const lossValue =
    typeof qualityLoss === 'number' && !Number.isNaN(qualityLoss)
      ? qualityLoss
      : undefined;

  const score =
    typeof qualityScore === 'number' && !Number.isNaN(qualityScore)
      ? Number(qualityScore.toFixed(1))
      : lossValue !== undefined
      ? Number((100 - lossValue).toFixed(1))
      : undefined;

  const anomalies =
    typeof activeAnomalies === 'number' && !Number.isNaN(activeAnomalies)
      ? activeAnomalies
      : 0;

  const getQualityBucket = () => {
    if (lossValue === undefined) {
      return {
        label: 'Not Available',
        chipText: 'No Data',
        chipClass: 'bg-gray-300 text-gray-900',
        riskLevel: 'N/A',
        riskColor: 'text-gray-700',
      };
    }

    // 0–15% -> Green / Good
    if (lossValue <= 15) {
      return {
        label: 'Good Quality',
        chipText: 'Good Quality',
        chipClass: 'bg-emerald-100 text-emerald-700',
        riskLevel: 'Green',
        riskColor: 'text-emerald-600',
      };
    }

    // 16–30% -> Yellow / Moderate
    if (lossValue <= 30) {
      return {
        label: 'Moderate Quality Impact',
        chipText: 'Moderate Risk',
        chipClass: 'bg-amber-100 text-amber-700',
        riskLevel: 'Yellow',
        riskColor: 'text-amber-500',
      };
    }

    // 31%+ -> Red / High Risk
    return {
      label: 'High Quality Risk',
      chipText: 'High Risk',
      chipClass: 'bg-red-100 text-red-700',
      riskLevel: 'Red',
      riskColor: 'text-red-600',
    };
  };

  const bucket = getQualityBucket();

  // Risk level strictly follows loss percentage bands defined above
  const riskLabel = bucket.riskLevel;

  const riskColorClass =
    riskLabel === 'Red'
      ? 'text-red-600'
      : riskLabel === 'Yellow'
      ? 'text-amber-600'
      : riskLabel === 'Green'
      ? 'text-emerald-600'
      : bucket.riskColor;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quality Loss Assessment"
      description="Real-time quality impact based on parameter excursions"
      // No icon for this modal to match design
      containerClassName="w-full max-w-lg text-[16px]"
    >
      <div className="space-y-6">
        {/* Quality summary (centered, large, like design) */}
        <div className="text-center">
          <p className="text-[22px] font-semibold text-[#059669] mb-2">
            Quality Loss: {lossValue !== undefined ? `${lossValue}%` : '—'}
          </p>
          <div className="inline-flex items-center justify-center px-5 py-1.5 rounded-full text-xs font-semibold bg-[#BBF7D0] text-[#166534]">
            {bucket.chipText}
          </div>
        </div>

        {/* Metrics (single column rows, label left, value right) */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Current Score:</span>
            <span className="text-gray-900">
              {score !== undefined ? `${score}%` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Active Anomalies:</span>
            <span className="text-gray-900">{anomalies}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Risk Level:</span>
            <span className={`font-semibold ${riskColorClass}`}>
              {riskLabel}
            </span>
          </div>
        </div>

        {/* Scale info */}
        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs font-semibold text-gray-800 mb-2 mt-1">
            Scale Information
          </p>
          <ul className="space-y-1 text-xs text-gray-700">
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>Good (0–15% loss)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
              <span>Moderate (16–30% loss)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              <span>High Risk (31%+ loss)</span>
            </li>
          </ul>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-[#005C99] text-white text-sm font-semibold hover:bg-[#004b80] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005C99]"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default QualityLossModal;


