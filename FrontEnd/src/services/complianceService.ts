/**
 * Compliance Service
 * Handles compliance metrics API calls
 */

import { BaseApiService } from './baseApiService';

export interface ComplianceMetrics {
  audit_coverage_percentage: number;
  emissions_per_treatment_tco2e: number;
  total_audits: number;
  passed_audits: number;
  failed_audits: number;
  pending_audits: number;
}

export interface ComplianceApiResponse {
  category: string;
  metrics: ComplianceMetrics;
  last_updated: string;
  status: string;
}

export class ComplianceService extends BaseApiService {
  /**
   * Get compliance metrics for a specific pharma
   */
  async getComplianceMetrics(pharmaId: string): Promise<ComplianceMetrics> {
    try {
      const response = await this.request<ComplianceApiResponse>(
        `/api/compliance?pharma_id=${pharmaId}`
      );
      
      if (response.status === 'success') {
        return response.metrics;
      } else {
        throw new Error('Failed to fetch compliance metrics');
      }
    } catch (error) {
      console.error('Error fetching compliance metrics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const complianceService = new ComplianceService();