import { BaseApiService } from './baseApiService';

export interface RiskFactor {
  risk_factor: string;
  risk_contributors: string[];
  risk_scale: string;
}

export interface LaneRiskAssessmentResponse {
  shipment_id?: number;
  patient_id: string;
  total_risk_factors: number;
  factors: RiskFactor[];
  last_updated: string;
  status: string;
}

class LaneRiskService extends BaseApiService {
  async getLaneRiskAssessment(patientId: string): Promise<LaneRiskAssessmentResponse> {
    return this.get<LaneRiskAssessmentResponse>(`/api/lane-risk-assessment?patient_id=${encodeURIComponent(patientId)}`);
  }
}

export const laneRiskService = new LaneRiskService();


