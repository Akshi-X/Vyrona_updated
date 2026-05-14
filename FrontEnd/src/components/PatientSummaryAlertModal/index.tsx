import React, { useEffect, useState } from 'react';
import AlertCard from '../AlertCard';
import { shipmentService, type PatientJourneySummaryResponse, type ShipmentLegSummary, type ShipmentLegDetail, type ReengineeringStage } from '../../services/shipmentService';
import PatientSummaryIcon from '../../assets/TrackAndTraceIcons/PatientSummary.svg';
import ProcessingTimeIcon from '../../assets/TrackAndTraceIcons/processing-time.svg';

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

  const formatDateTime = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${dateStr}, ${timeStr}`;
    } catch {
      return dateString;
    }
  };

  const getStatusColors = (status: string): { borderColor: string; bgColor: string; textColor: string } | null => {
    if (!status) return null;
    
    const statusLower = status.toLowerCase();
    
    // Don't display if not started or null
    if (statusLower.includes('not started') || statusLower === 'null' || statusLower === '') {
      return null;
    }
    
    // Completed -> green
    if (statusLower.includes('completed') || statusLower.includes('complete')) {
      return {
        borderColor: 'border-[#00990A]',
        bgColor: 'border border-[#F3FFF2] bg-[#F3FFF2]',
        textColor: 'bg-[#22DC0E]'
      };
    }
    
    // In progress -> orange
    if (statusLower.includes('ongoing') || statusLower.includes('in_progress') || statusLower.includes('in progress')) {
      return {
        borderColor: 'border-orange-300',
        bgColor: 'border border-orange-100 bg-orange-50',
        textColor: 'bg-orange-300'
      };
    }
    
    // Default to gray if status doesn't match
    return {
      borderColor: 'border-gray-400',
      bgColor: 'border border-gray-200 bg-gray-50',
      textColor: 'bg-gray-500'
    };
  };

  const formatLegDescription = (legDetail: ShipmentLegDetail): string => {
    const mode = legDetail.mode_of_transport.toLowerCase();
    const from = legDetail.from_location;
    const to = legDetail.to_location;
    
    // Build description based on mode - matching the image format
    if (mode === 'collection') {
      return `Apheresis completed at ${from}, custody initiated, sample packaged in LN₂ shipper`;
    } else if (mode === 'road') {
      return `${from} → ${to} (Temp stable, custody verified)`;
    } else if (mode === 'air') {
      return `${from} → ${to} (In-flight monitoring, custody maintained)`;
    } else if (mode === 'mixed') {
      if (legDetail.ln2_refill && legDetail.ln2_refill.toLowerCase() === 'yes') {
        return `${from} → ${to} (LN₂ refill, custody check)`;
      }
      return `${from} → ${to} (Custody maintained)`;
    }
    
    // Default fallback
    return `${from} → ${to}`;
  };

  const renderLegSection = (leg: ShipmentLegSummary, title: string) => {
    const colors = getStatusColors(leg.status);
    
    // Don't render if status is not started or null
    if (!colors) return null;
    
    const isCompleted = leg.status.toLowerCase().includes('completed') || leg.status.toLowerCase().includes('complete');
    const isInProgress = leg.status.toLowerCase().includes('in_progress') || leg.status.toLowerCase().includes('in progress') || leg.status.toLowerCase().includes('ongoing');
    
    // Determine destination based on title
    const destination = title.includes('Pharma') ? 'Pharma Facility' : 'Hospital';
    
    // Determine bullet color based on status
    const bulletColor = isCompleted ? 'bg-[#22DC0E]' : isInProgress ? 'bg-orange-300' : 'bg-gray-300';
    
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[14px] text-black">{title}</h3>
          {isCompleted && (
            <span className="bg-[#F3FFF2] font-bold text-[10px] rounded-md px-3 py-1.5 flex items-center gap-2">
              <div className="w-[12px] h-[12px] bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-[8px] h-[8px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              Completed
            </span>
          )}
          {isInProgress && (
            <span className="bg-orange-50 font-semibold text-[10px] rounded-md px-3 py-1.5 flex items-center gap-2 text-orange-600">
              <div className="w-[16px] h-[16px] flex items-center justify-center flex-shrink-0">
                <img
                  src={ProcessingTimeIcon}
                  alt="In progress"
                  className="w-[14px] h-[14px]"
                />
              </div>
              In Progress
            </span>
          )}
        </div>
        
        {leg.provider_name && (
          <p className="text-[12px] text-gray-600 mb-8">Provider: {leg.provider_name}</p>
        )}
        
        <div className="space-y-3 mb-4">
          {leg.legs.map((legDetail, index) => {
            const mode = legDetail.mode_of_transport;
            const description = formatLegDescription(legDetail);
            
            return (
              <div key={index} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full ${bulletColor} mt-2 flex-shrink-0 mb-6`}/>
                <div className="flex-1 mb-2">
                  <span className="font-semibold text-gray-900 text-[12px] capitalize ml-3">{mode}:</span><br/>
                  <span className="text-gray-800 text-[12px] ml-3">{description}.</span>
                </div>
              </div>
            );
          })}
        </div>

        {leg.arrival_date && isCompleted && (
          <div className="mt-4 rounded-md bg-[#F3FFF2] text-green-700 p-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[12px] text-[#00990A] font-semibold">
              Arrived at {destination} on {formatDateTime(leg.arrival_date)}
            </span>
          </div>
        )}
        
        {isInProgress && leg.planned_date && (
          <div className="mt-4 rounded-md bg-orange-50 text-orange-600 p-3 flex items-center gap-2">
            <img
              src={ProcessingTimeIcon}
              alt="In progress"
              className="w-4 h-4 flex-shrink-0"
            />
            <span className="text-[12px] text-orange-600 font-semibold">
              Arrived at {destination} on {formatDateTime(leg.planned_date)}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderReengineeringSection = (reengineering: ReengineeringStage) => {
    const colors = getStatusColors(reengineering.status);
    
    // Don't render if status is not started or null
    if (!colors) return null;
    
    const isCompleted = reengineering.status.toLowerCase().includes('completed') || reengineering.status.toLowerCase().includes('complete');
    
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[14px] text-black">Reengineering (Manufacturing Phase)</h3>
          {isCompleted && (
            <span className="bg-[#F3FFF2] font-bold text-[10px] rounded-md px-3 py-1.5 flex items-center gap-2">
              <div className="w-[12px] h-[12px] bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-[8px] h-[8px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              Completed
            </span>
          )}
        </div>
        
        <div className="space-y-3 mb-4 mt-4">
          {reengineering.start_date && reengineering.end_date && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#22DC0E] mt-2 flex-shrink-0"/>
              <div className="flex-1">
                <span className="text-gray-800 text-[12px] ml-3">
                  Cryopreservation + CAR-T reengineering ({formatDate(reengineering.start_date)} – {formatDate(reengineering.end_date)}).
                </span>
              </div>
            </div>
          )}
          {reengineering.scheduled_start && reengineering.scheduled_end && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#22DC0E] mt-2 flex-shrink-0"/>
              <div className="flex-1">
                <span className="text-gray-800 text-[12px] ml-3">
                  Scheduled: {formatDate(reengineering.scheduled_start)} – {formatDate(reengineering.scheduled_end)}.
                </span>
              </div>
            </div>
          )}
          {reengineering.description && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#22DC0E] mt-2 flex-shrink-0"/>
              <div className="flex-1">
                <span className="text-gray-800 text-[12px] ml-3">{reengineering.description}</span>
              </div>
            </div>
          )}
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
      description={summary ? `Supply Chain Summary for Patient ${summary.patient_id}` : `Loading summary for ${patientId}...`}
      icon={
        <img
          className="w-[24px] h-[24px]"
          alt="Patient Summary"
          src={PatientSummaryIcon}
        />
      }
      containerClassName="w-full max-w-[750px]"
      loading={loading}
      dataLength={summary ? 1 : 0}
      emptyText={error || "No summary available for this patient"}
      disableInnerScroll={false}
      thinScrollbar={true}
      contentHeightClassName="max-h-[60vh]"
    >
      {error && (
        <div className="text-center text-red-600 py-4">
          {error}
        </div>
      )}
      
      {summary && (
        <div className="space-y-6">
          {/* Patient Information Card - sticky, does not scroll */}
          <div className="rounded-lg bg-purple-50 p-4 sticky top-0 z-10">
            <div className="flex items-center gap-4">
              
              {/* Patient Details */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[#6B1176] text-[14px] mb-1">
                  {summary.hospital_name || 'Hospital Name'}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-[#6B1176] text-400">
                    <span className="font-medium text-sm">Patient ID :</span> {summary.patient_id}
                  </span>
                  <span className="text-[#6B1176] text-400">
                    <span className="font-medium text-sm">Condition :</span> {summary.condition}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Leg 1 — Only show if not null and status is not "not started" */}
          {summary.leg1 && renderLegSection(
            summary.leg1,
            'Leg 1 — Hospital to Pharma Manufacturing Site'
          )}

          {/* Reengineering — Only show if not null and status is not "not started" */}
          {summary.reengineering && renderReengineeringSection(summary.reengineering)}

          {/* Leg 2 — Only show if not null and status is not "not started" */}
          {summary.leg2 && renderLegSection(
            summary.leg2,
            'Leg 2 — Pharma to Hospital'
          )}

          {/* Current Status */}
          {summary.current_status && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Current Status</h4>
              <div className="space-y-2 text-sm">
                {/* Leg 1 Status */}
                <div className="flex items-start gap-2 text-gray-800">
                  <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    summary.current_status.leg1_status.toLowerCase().includes('completed') || summary.current_status.leg1_status.toLowerCase().includes('complete')
                      ? 'text-green-600'
                      : summary.current_status.leg1_status.toLowerCase().includes('in_progress') || summary.current_status.leg1_status.toLowerCase().includes('in progress')
                      ? 'text-blue-600'
                      : 'text-amber-600'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    {summary.current_status.leg1_status.toLowerCase().includes('completed') || summary.current_status.leg1_status.toLowerCase().includes('complete') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 2l3 6-3 6 3 6" />
                    )}
                  </svg>
                  <span>Leg 1: {summary.current_status.leg1_status}</span>
                </div>

                {/* Reengineering Status */}
                <div className="flex items-start gap-2 text-gray-800">
                  <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    summary.current_status.reengineering_status.toLowerCase().includes('completed') || summary.current_status.reengineering_status.toLowerCase().includes('complete')
                      ? 'text-green-600'
                      : summary.current_status.reengineering_status.toLowerCase().includes('ongoing') || summary.current_status.reengineering_status.toLowerCase().includes('in_progress') || summary.current_status.reengineering_status.toLowerCase().includes('in progress')
                      ? 'text-blue-600'
                      : 'text-gray-600'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    {summary.current_status.reengineering_status.toLowerCase().includes('completed') || summary.current_status.reengineering_status.toLowerCase().includes('complete') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : summary.current_status.reengineering_status.toLowerCase().includes('not_started') || summary.current_status.reengineering_status.toLowerCase().includes('not started') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3a.75.75 0 00-.75.75V6H6.75A.75.75 0 006 6.75v2.5c0 .414.336.75.75.75H9V12H6.75A.75.75 0 006 12.75v2.5c0 .414.336.75.75.75H9v2.25c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V16h2.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75H13V10h2.25a.75.75 0 00.75-.75v-2.5a.75.75 0 00-.75-.75H13V3.75A.75.75 0 0012.25 3h-2.5z" />
                    )}
                  </svg>
                  <span>Reengineering: {summary.current_status.reengineering_status}</span>
                </div>

                {/* Leg 2 Status */}
                <div className="flex items-start gap-2 text-gray-800">
                  <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    summary.current_status.leg2_status.toLowerCase().includes('completed') || summary.current_status.leg2_status.toLowerCase().includes('complete')
                      ? 'text-green-600'
                      : summary.current_status.leg2_status.toLowerCase().includes('in_progress') || summary.current_status.leg2_status.toLowerCase().includes('in progress')
                      ? 'text-blue-600'
                      : 'text-orange-600'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    {summary.current_status.leg2_status.toLowerCase().includes('completed') || summary.current_status.leg2_status.toLowerCase().includes('complete') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : summary.current_status.leg2_status.toLowerCase().includes('not_started') || summary.current_status.leg2_status.toLowerCase().includes('not started') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 2l3 6-3 6 3 6" />
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


