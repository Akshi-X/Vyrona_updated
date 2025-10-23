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

export class PerformanceService extends BaseApiService {
  /**
   * Get performance metrics for a specific pharma
   */
  async getPerformanceMetrics(pharmaId: string): Promise<PerformanceMetrics> {
    try {
      const response = await this.request<PerformanceApiResponse>(
        `/api/performance?pharma_id=${pharmaId}`
      );
      
      if (response.status === 'success') {
        return response.metrics;
      } else {
        throw new Error('Failed to fetch performance metrics');
      }
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const performanceService = new PerformanceService();
