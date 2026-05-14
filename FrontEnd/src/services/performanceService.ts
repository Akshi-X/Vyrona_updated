/**
 * Performance Service
 * Handles performance metrics API calls
 */

import { BaseApiService } from './baseApiService';

export interface PerformanceMetrics {
  on_time_percentage: number;
  avg_lead_time_days: number;
  failure_cost_million: number;
  total_shipments: number;
  completed_shipments: number;
  pending_shipments: number;
}

export interface PerformanceApiResponse {
  category: string;
  metrics: PerformanceMetrics;
  last_updated: string;
  status: string;
}

export interface AvgQualityDeviationsResponse {
  pharma_id: number;
  avg_quality_deviations: number;
  total_deviations: number;
  total_treatments: number;
  status: string;
  last_updated: string;
}

export interface OnTimePercentageResponse {
  on_time_percentage: number;
  on_time_deliveries: number;
  total_deliveries: number;
  status: string;
  last_updated: string;
}

export interface AvgLeadTimeResponse {
  avg_lead_time_days: number;
  total_shipments: number;
  completed_shipments: number;
  pending_shipments: number;
  status: string;
  last_updated: string;
}

export interface SuccessRateResponse {
  pharma_id: number;
  success_rate: number;
  successful_outcomes: number;
  total_outcomes: number;
  status: string;
  last_updated: string;
}

export class PerformanceService extends BaseApiService {
  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const response = await this.request<PerformanceApiResponse>(`/api/performance`);
      
      if (response.status === 'success') {
        return response.metrics;
      } else {
        throw new Error('Failed to fetch performance metrics');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get average quality deviations
   */
  async getAvgQualityDeviations(): Promise<AvgQualityDeviationsResponse> {
    try {
      const response = await this.request<AvgQualityDeviationsResponse>(`/api/performance/avg-quality-deviations`);
      
      if (response.status === 'success') {
        return response;
      } else {
        throw new Error('Failed to fetch quality deviations');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get on-time percentage
   */
  async getOnTimePercentage(): Promise<OnTimePercentageResponse> {
    try {
      const response = await this.request<OnTimePercentageResponse>(`/api/performance/on-time-percentage`);
      
      if (response.status === 'success') {
        return response;
      } else {
        throw new Error('Failed to fetch on-time percentage');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get average lead time
   */
  async getAvgLeadTime(): Promise<AvgLeadTimeResponse> {
    try {
      const response = await this.request<AvgLeadTimeResponse>(`/api/performance/avg-lead-time`);
      
      if (response.status === 'success') {
        return response;
      } else {
        throw new Error('Failed to fetch average lead time');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get success rate
   */
  async getSuccessRate(): Promise<SuccessRateResponse> {
    try {
      const response = await this.request<SuccessRateResponse>(`/api/performance/success-rate`);
      
      if (response.status === 'success') {
        return response;
      } else {
        throw new Error('Failed to fetch success rate');
      }
    } catch (error) {
      throw error;
    }
  }
}

// Export singleton instance
export const performanceService = new PerformanceService();
