/**
 * Risk Service
 * Handles risk metrics API calls
 */

import { BaseApiService } from './baseApiService';

export interface TopRiskDriver {
  name: string;
  percentage: number;
  severity: string;
  trend: string;
}

export interface RiskMetrics {
  deviation_percentage: number;
  top_risk_driver: TopRiskDriver;
  total_risks: number;
  high_risks: number;
  medium_risks: number;
  low_risks: number;
}

export interface RiskApiResponse {
  category: string;
  metrics: RiskMetrics;
  last_updated: string;
  status: string;
}

export class RiskService extends BaseApiService {
  /**
   * Get risk metrics for a specific pharma
   */
  async getRiskMetrics(pharmaId: string): Promise<RiskMetrics> {
    try {
      const response = await this.request<RiskApiResponse>(
        `/api/risk?pharma_id=${pharmaId}`
      );
      
      if (response.status === 'success') {
        return response.metrics;
      } else {
        throw new Error('Failed to fetch risk metrics');
      }
    } catch (error) {
      console.error('Error fetching risk metrics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const riskService = new RiskService();
