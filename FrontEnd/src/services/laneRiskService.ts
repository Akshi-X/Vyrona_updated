import { BaseApiService } from './baseApiService';

export interface LaneRiskItem {
  route: string;
  quality_deviations: string;
  returns_regulatory: string;
  loss_physical_damage: string;
  three_pl_reliability: string;
  weather: string;
  lane_complexity?: string;
  geopolitical?: string;
  digital_communication?: string;
  risk_level?: string;
}

export interface LaneRiskAssessmentResponse {
  total_lanes: number;
  lanes: LaneRiskItem[];
  last_updated: string;
  status: string;
}

class LaneRiskService extends BaseApiService {
  async getLaneRiskAssessment(): Promise<LaneRiskAssessmentResponse> {
    return this.get<LaneRiskAssessmentResponse>('/api/lane-risk-assessment');
  }
}

export const laneRiskService = new LaneRiskService();


