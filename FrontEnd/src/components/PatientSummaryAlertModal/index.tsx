import React from 'react';
import AlertCard from '../AlertCard';

type AlertType = 'success' | 'warning' | 'error' | 'info';

interface PatientInfo {
  patientId: string;
  condition: string;
  currentStage: string;
  lastUpdated: string;
}

interface PatientAlert {
  id: string;
  type: AlertType;
  message: string;
  timestamp: string;
  provider: string;
}

interface PatientSummaryAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientInfo;
  alerts: PatientAlert[];
  statusSummary: string[]; // e.g., ["Leg 1 Completed", "Reengineering in progress", "Leg 2 Scheduled"]
  progressPercent?: number; // 0..100
  onAcknowledge?: () => void;
  onViewSummary?: () => void;
}

const badgeStyles: Record<AlertType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const dotStyles: Record<AlertType, string> = {
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

const PatientSummaryAlertModal: React.FC<PatientSummaryAlertModalProps> = ({
  isOpen,
  onClose,
  patient,
  alerts,
  statusSummary,
  progressPercent = 0,
  onAcknowledge,
  onViewSummary,
}) => {
  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title="Patient Summary"
      description={`Supply Chain Summary for ${patient.patientId}`}
      icon={
        <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/>
        </svg>
      }
      containerClassName="w-3/5"
      contentHeightClassName="h-[520px]"
      loading={false}
      dataLength={Math.max(1, alerts.length)}
      emptyText="No alerts for this patient"
    >
      <div className="space-y-4">
        {/* Patient Information (gradient card like screenshot) */}
        <div className="rounded-xl p-[1px] bg-gradient-to-r from-purple-300/40 to-blue-300/40">
          <div className="rounded-[10px] bg-gradient-to-r from-purple-50 to-blue-50 p-4">
            <h3 className="text-sm font-semibold text-purple-700 mb-3">Patient Information</h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex gap-2"><span className="font-semibold text-gray-800">Patient ID:</span><span className="text-gray-900">{patient.patientId.replace('Patient ', '')}</span></div>
              <div className="flex gap-2"><span className="font-semibold text-gray-800">Condition:</span><span className="text-gray-900">{patient.condition}</span></div>
            </div>
          </div>
        </div>

        {/* Leg 1 — Completed card (green) */}
        <div className="pl-3 border-l-4 border-green-400">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Completed</span>
            <h3 className="text-sm font-semibold text-gray-900">Leg 1 — Hospital to Pharma Manufacturing Site</h3>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <span className="font-semibold text-gray-900">Provider:</span>
                  <span className="text-gray-800"> DHL (End-to-End Managed Service)</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-2 w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <div className="font-semibold text-gray-900">Collection:</div>
                  <div className="text-gray-800">Apheresis completed at Paris Hospital, custody initiated, sample packaged in LN₂ shipper.</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-2 w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <div className="font-semibold text-gray-900">Road:</div>
                  <div className="text-gray-800">Paris Hospital → CDG Airport (Temp stable, custody verified).</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-2 w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <div className="font-semibold text-gray-900">Air:</div>
                  <div className="text-gray-800">CDG → Frankfurt (In-flight monitoring, custody maintained).</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-2 w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <div className="font-semibold text-gray-900">Road:</div>
                  <div className="text-gray-800">FRA → Pharma Facility (LN₂ refill, custody check).</div>
                </div>
              </div>

              <div className="mt-2 rounded-md border border-green-200 bg-white text-green-700 p-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-semibold">Arrived at Pharma Facility on 05/01/25, 14:15</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reengineering (Manufacturing Phase) block */}
        <div className="pl-3 border-l-4 border-blue-300">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">Completed</span>
            <h3 className="text-sm font-semibold text-gray-900">Reengineering (Manufacturing Phase)</h3>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 text-gray-800">
                <span className="mt-2 w-2 h-2 rounded-full bg-blue-600" />
                <span>
                  Cryopreservation + CAR-T reengineering ongoing (05/02/25 – 05/08/25).
                </span>
              </div>
              <div className="flex items-start gap-2 text-gray-800">
                <span className="mt-2 w-2 h-2 rounded-full bg-blue-600" />
                <span>
                  QC testing and CoA release scheduled for 05/09/25.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Leg card */}
        <div className="pl-3 border-l-4 border-yellow-400">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">Upcoming</span>
            <h3 className="text-sm font-semibold text-gray-900">Leg 2 — Pharma to Hospital</h3>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-2 h-2 rounded-full bg-yellow-500"/>
              <div>
                <div className="font-semibold text-gray-900">Provider:</div>
                <div className="text-gray-800">World Courier</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-2 w-2 h-2 rounded-full bg-yellow-500"/>
              <div>
                <div className="font-semibold text-gray-900">Road:</div>
                <div className="text-gray-800">Pharma Facility → Frankfurt Airport</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-2 w-2 h-2 rounded-full bg-yellow-500"/>
              <div>
                <div className="font-semibold text-gray-900">Air:</div>
                <div className="text-gray-800">FRA → Paris CDG</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-2 w-2 h-2 rounded-full bg-yellow-500"/>
              <div>
                <div className="font-semibold text-gray-900">Road:</div>
                <div className="text-gray-800">Paris CDG → Paris Hospital</div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-2 w-2 h-2 rounded-full bg-yellow-500"/>
              <div>
                <div className="font-semibold text-gray-900">Delivery:</div>
                <div className="text-gray-800">Final custody transfer + infusion readiness at hospital</div>
              </div>
            </div>

            <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 text-orange-700 p-3 flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-semibold">Planned Date: 05/10/25</span>
            </div>
          </div>
        </div>
        </div>

        {/* Current Status */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Current Status</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 text-gray-800">
              <svg className="w-4 h-4 text-green-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Leg 1 completed successfully.</span>
            </div>
            <div className="flex items-start gap-2 text-gray-800">
              <svg className="w-4 h-4 text-gray-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3a.75.75 0 00-.75.75V6H6.75A.75.75 0 006 6.75v2.5c0 .414.336.75.75.75H9V12H6.75A.75.75 0 006 12.75v2.5c0 .414.336.75.75.75H9v2.25c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V16h2.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75H13V10h2.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75H13V3.75A.75.75 0 0012.25 3h-2.5z" />
              </svg>
              <span>Reengineering completed.</span>
            </div>
            <div className="flex items-start gap-2 text-gray-800">
              <svg className="w-4 h-4 text-amber-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2l3 6-3 6 3 6" />
              </svg>
              <span>Leg 2 transport scheduled and confirmed with provider.</span>
            </div>
          </div>
        </div>

        {/* Footer intentionally left empty (no close button) */}
      </div>
    </AlertCard>
  );
};

export default PatientSummaryAlertModal;


