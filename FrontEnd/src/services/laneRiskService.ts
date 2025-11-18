import { BaseApiService } from './baseApiService';

export interface RiskFactor {
  risk_factor: string;
  risk_contributors: string[];
  risk_scale: string;
}

export interface LaneRiskAssessmentResponse {
  total_risk_factors: number;
  factors: RiskFactor[];
  last_updated: string;
  status: string;
}

class LaneRiskService extends BaseApiService {
  async getLaneRiskAssessment(): Promise<LaneRiskAssessmentResponse> {
    return this.get<LaneRiskAssessmentResponse>('/api/lane-risk-assessment');
  }
}

export const laneRiskService = new LaneRiskService();


