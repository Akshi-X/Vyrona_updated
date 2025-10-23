/**
 * Logistics Service
 * Handles logistics metrics and patient statistics API calls
 * 
 * Patient Statistics Integration:
 * - getPatientStatistics() fetches current month patient and treatment counts
 * - API endpoint: /api/patients/statistics/pharma/{pharmaId}
 * - Returns: { pharma_id, current_month_patient_count, current_month_treatment_count }
 * - Used in Dashboard Volume section to display real-time data
 */

import { BaseApiService } from './baseApiService';

export interface LogisticsMetrics {
  cold_chain_packaging_failure_percentage: number;
  avg_quality_lost_per_patient_percentage: number;
  total_shipments: number;
  successful_deliveries: number;
  failed_deliveries: number;
  average_transit_time_hours: number;
}

export interface PatientStatistics {
  pharma_id: number;
  current_month_patient_count: number;
  current_month_treatment_count: number;
}

export interface LogisticsApiResponse {
  category: string;
  metrics: LogisticsMetrics;
  last_updated: string;
  status: string;
}

export class LogisticsService extends BaseApiService {
  /**
   * Get logistics metrics for a specific pharma
   */
  async getLogisticsMetrics(pharmaId: string): Promise<LogisticsMetrics> {
    try {
      const response = await this.request<LogisticsApiResponse>(
        `/api/logistics?pharma_id=${pharmaId}`
      );
      
      if (response.status === 'success') {
        return response.metrics;
      } else {
        throw new Error('Failed to fetch logistics metrics');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get patient statistics for a specific pharma
   */
  async getPatientStatistics(pharmaId: number): Promise<PatientStatistics> {
    try {
      const response = await this.request<PatientStatistics>(
        `/api/patients/statistics/pharma/${pharmaId}`
      );
      
      return response;
    } catch (error) {
      throw error;
    }
  }
}

// Export singleton instance
export const logisticsService = new LogisticsService();
