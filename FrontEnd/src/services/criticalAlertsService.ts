/**
 * Critical Alerts Service
 * Handles all critical alerts-related API calls
 */

import { BaseApiService } from './baseApiService';

export interface CriticalAlert {
  id: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  patient_id: string;
  message: string;
  timestamp: string;
  status: 'Active' | 'Acknowledged' | 'Resolved' | 'Escalated';
}

export interface CriticalAlertsResponse {
  total_alerts: number;
  active_alerts: number;
  acknowledged_alerts: number;
  resolved_alerts: number;
  alerts: CriticalAlert[];
  last_updated: string;
}

export class CriticalAlertsService extends BaseApiService {
  /**
   * Get critical alerts
   */
  async getCriticalAlerts(pharmaId: string): Promise<CriticalAlertsResponse> {
    return await this.request<CriticalAlertsResponse>(`/api/alerts?pharma_id=${encodeURIComponent(pharmaId)}`, {
      method: 'GET',
    });
  }
}

// Export singleton instance
export const criticalAlertsService = new CriticalAlertsService();
