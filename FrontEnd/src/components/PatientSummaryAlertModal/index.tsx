import React, { useEffect, useState } from 'react';
import AlertCard from '../AlertCard';
import { shipmentService, type PatientJourneySummaryResponse, type ShipmentLegSummary, type ReengineeringStage } from '../../services/shipmentService';

interface PatientSummaryAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string; // Patient ID to fetch summary for
  onViewSummary?: () => void;
}

const PatientSummaryAlertModal: React.FC<PatientSummaryAlertModalProps> = ({
  isOpen,
  onClose,
  patientId,
  onViewSummary: _onViewSummary, // Reserved for future use
}) => {
  const [summary, setSummary] = useState<PatientJourneySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && patientId) {
      fetchPatientSummary();
    }
  }, [isOpen, patientId]);

  const fetchPatientSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await shipmentService.getPatientJourneySummary(patientId);
      setSummary(data);
    } catch (err) {
      console.error('Error fetching patient summary:', err);
      setError('Failed to load patient summary');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string): { label: string; className: string } => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('completed') || statusLower.includes('complete')) {
      return { label: 'Completed', className: 'bg-green-100 text-green-700' };
    } else if (statusLower.includes('ongoing') || statusLower.includes('in_progress') || statusLower.includes('in progress')) {
      return { label: 'In Progress', className: 'bg-blue-100 text-blue-700' };
    } else if (statusLower.includes('upcoming') || statusLower.includes('scheduled')) {
      return { label: 'Upcoming', className: 'bg-orange-100 text-orange-700' };
    }
    return { label: status, className: 'bg-gray-100 text-gray-700' };
  };

  const renderLegSection = (leg: ShipmentLegSummary, title: string, borderColor: string, bgColor: string, textColor: string) => {
    const badge = getStatusBadge(leg.status);
    
    return (
      <div className={`pl-3 border-l-4 ${borderColor}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${badge.className}`}>
            {badge.label}
          </span>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <div className={`rounded-lg border ${bgColor} p-4`}>
          <div className="space-y-3 text-sm">
            {leg.provider_name && (
              <div className="flex items-start gap-2">
                <span className={`mt-2 w-2 h-2 rounded-full ${textColor}`} />
                <div>
                  <span className="font-semibold text-gray-900">Provider:</span>
                  <span className="text-gray-800"> {leg.provider_name}</span>
                </div>
              </div>
            )}
            
            {leg.legs.map((legDetail, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className={`mt-2 w-2 h-2 rounded-full ${textColor}`} />
                <div>
                  <div className="font-semibold text-gray-900">{legDetail.mode_of_transport}:</div>
                  <div className="text-gray-800">
                    {legDetail.from_location} → {legDetail.to_location}
                    {legDetail.carrier_name && ` (${legDetail.carrier_name})`}
                  </div>
                </div>
              </div>
            ))}

            {leg.arrival_date && (
              <div className="mt-2 rounded-md border border-green-200 bg-white text-green-700 p-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-semibold">Arrived on {formatDate(leg.arrival_date)}</span>
              </div>
            )}
            
            {leg.planned_date && !leg.arrival_date && (
              <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 text-orange-700 p-3 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-semibold">Planned Date: {formatDate(leg.planned_date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderReengineeringSection = (reengineering: ReengineeringStage) => {
    const badge = getStatusBadge(reengineering.status);
    
    return (
      <div className="pl-3 border-l-4 border-blue-300">
        <div className="flex items-center gap-3 mb-2">
          <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${badge.className}`}>
            {badge.label}
          </span>
          <h3 className="text-sm font-semibold text-gray-900">Reengineering (Manufacturing Phase)</h3>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="space-y-2 text-sm">
            {reengineering.start_date && reengineering.end_date && (
              <div className="flex items-start gap-2 text-gray-800">
                <span className="mt-2 w-2 h-2 rounded-full bg-blue-600" />
                <span>
                  Cryopreservation + CAR-T reengineering ({formatDate(reengineering.start_date)} – {formatDate(reengineering.end_date)}).
                </span>
              </div>
            )}
            {reengineering.scheduled_start && reengineering.scheduled_end && (
              <div className="flex items-start gap-2 text-gray-800">
                <span className="mt-2 w-2 h-2 rounded-full bg-blue-600" />
                <span>
                  Scheduled: {formatDate(reengineering.scheduled_start)} – {formatDate(reengineering.scheduled_end)}.
                </span>
              </div>
            )}
            {reengineering.description && (
              <div className="flex items-start gap-2 text-gray-800">
                <span className="mt-2 w-2 h-2 rounded-full bg-blue-600" />
                <span>{reengineering.description}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!summary && !loading && !error) {
    return null;
  }

  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title="Patient Summary"
      description={summary ? `Supply Chain Summary for ${summary.patient_id}` : `Loading summary for ${patientId}...`}
      icon={
        <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/>
        </svg>
      }
      containerClassName="w-3/5"
      contentHeightClassName="h-[520px]"
      loading={loading}
      dataLength={summary ? 1 : 0}
      emptyText={error || "No summary available for this patient"}
    >
      {error && (
        <div className="text-center text-red-600 py-4">
          {error}
        </div>
      )}
      
      {summary && (
        <div className="space-y-4">
          {/* Patient Information (gradient card like screenshot) */}
          <div className="rounded-xl p-[1px] bg-gradient-to-r from-purple-300/40 to-blue-300/40">
            <div className="rounded-[10px] bg-gradient-to-r from-purple-50 to-blue-50 p-4">
              <h3 className="text-sm font-semibold text-purple-700 mb-3">Patient Information</h3>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-800">Patient ID:</span>
                  <span className="text-gray-900">{summary.patient_id}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-800">Condition:</span>
                  <span className="text-gray-900">{summary.condition}</span>
                </div>
                {summary.hospital_name && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-800">Hospital:</span>
                    <span className="text-gray-900">{summary.hospital_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Leg 1 — Only show if not null */}
          {summary.leg1 && renderLegSection(
            summary.leg1,
            'Leg 1 — Hospital to Pharma Manufacturing Site',
            'border-green-400',
            'border border-green-200 bg-green-50',
            'bg-green-500'
          )}

          {/* Reengineering — Only show if not null */}
          {summary.reengineering && renderReengineeringSection(summary.reengineering)}

          {/* Leg 2 — Only show if not null */}
          {summary.leg2 && renderLegSection(
            summary.leg2,
            'Leg 2 — Pharma to Hospital',
            'border-yellow-400',
            'border border-yellow-200 bg-yellow-50',
            'bg-yellow-500'
          )}

          {/* Current Status */}
          {summary.current_status && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Current Status</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-gray-800">
                  <svg className={`w-4 h-4 mt-0.5 ${
                    summary.current_status.leg1_status.toLowerCase().includes('completed') || summary.current_status.leg1_status.toLowerCase().includes('complete')
                      ? 'text-green-600'
                      : summary.current_status.leg1_status.toLowerCase().includes('in_progress') || summary.current_status.leg1_status.toLowerCase().includes('in progress')
                      ? 'text-blue-600'
                      : 'text-amber-600'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    {summary.current_status.leg1_status.toLowerCase().includes('completed') || summary.current_status.leg1_status.toLowerCase().includes('complete') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2l3 6-3 6 3 6" />
                    )}
                  </svg>
                  <span>Leg 1: {summary.current_status.leg1_status}</span>
                </div>
                <div className="flex items-start gap-2 text-gray-800">
                  <svg className={`w-4 h-4 mt-0.5 ${
                    summary.current_status.reengineering_status.toLowerCase().includes('completed') || summary.current_status.reengineering_status.toLowerCase().includes('complete')
                      ? 'text-green-600'
                      : summary.current_status.reengineering_status.toLowerCase().includes('ongoing') || summary.current_status.reengineering_status.toLowerCase().includes('in_progress') || summary.current_status.reengineering_status.toLowerCase().includes('in progress')
                      ? 'text-blue-600'
                      : 'text-gray-600'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    {summary.current_status.reengineering_status.toLowerCase().includes('completed') || summary.current_status.reengineering_status.toLowerCase().includes('complete') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3a.75.75 0 00-.75.75V6H6.75A.75.75 0 006 6.75v2.5c0 .414.336.75.75.75H9V12H6.75A.75.75 0 006 12.75v2.5c0 .414.336.75.75.75H9v2.25c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V16h2.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75H13V10h2.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75H13V3.75A.75.75 0 0012.25 3h-2.5z" />
                    )}
                  </svg>
                  <span>Reengineering: {summary.current_status.reengineering_status}</span>
                </div>
                <div className="flex items-start gap-2 text-gray-800">
                  <svg className={`w-4 h-4 mt-0.5 ${
                    summary.current_status.leg2_status.toLowerCase().includes('completed') || summary.current_status.leg2_status.toLowerCase().includes('complete')
                      ? 'text-green-600'
                      : summary.current_status.leg2_status.toLowerCase().includes('in_progress') || summary.current_status.leg2_status.toLowerCase().includes('in progress')
                      ? 'text-blue-600'
                      : 'text-amber-600'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    {summary.current_status.leg2_status.toLowerCase().includes('completed') || summary.current_status.leg2_status.toLowerCase().includes('complete') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2l3 6-3 6 3 6" />
                    )}
                  </svg>
                  <span>Leg 2: {summary.current_status.leg2_status}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AlertCard>
  );
};

export default PatientSummaryAlertModal;


