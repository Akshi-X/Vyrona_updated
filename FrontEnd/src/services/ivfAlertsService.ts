/**
 * IVF Alerts Service
 * Handles all IVF critical alerts-related API calls
 */

import { BaseApiService } from './baseApiService';

export interface IVFAlert {
  alert_id: string;
  // Backward-compat: older responses used canister_* naming
  canister_id: number;
  canister_number?: string;
  // Current tank-based responses
  tank_id?: number;
  tank_code?: string;
  hospital_id: number;
  branch_id: number;
  alert_type: string;
  source: string;
  severity: 'Low' | 'Medium' | 'High';
  message: string;
  status: 'Active' | 'Acknowledged';
  triggered_by: string;
  occurred_at: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface CanisterAlertsResponse {
  canister_id: number;
  canister_number?: string;
  alerts: IVFAlert[];
  total_count: number;
}

export interface HospitalAlertsResponse {
  alerts: IVFAlert[];
  total_count: number;
  active_count: number;
  acknowledged_count: number;
}

export interface AcknowledgeAlertRequest {
  alert_id: string;
}

export interface AcknowledgeAlertResponse {
  alert_id: string;
  status: 'Active' | 'Acknowledged';
  message: string;
  acknowledged_at: string;
}

export interface CheckAlertsResponse {
  alerts: IVFAlert[];
  total_count: number;
  active_count: number;
  acknowledged_count: number;
}

export class IvfAlertsService extends BaseApiService {
  /**
   * Get alerts for a specific tank
   */
  async getCanisterAlerts(tankId: string | number): Promise<CanisterAlertsResponse> {
    return await this.request<CanisterAlertsResponse>(
      `/api/ivf/alerts/tank/${encodeURIComponent(tankId)}`,
      { method: 'GET' }
    );
  }

  /**
   * Get all alerts for the hospital (role-based: Manager sees all branches, User sees only their branch)
   */
  async getHospitalAlerts(status?: 'Active' | 'Acknowledged'): Promise<HospitalAlertsResponse> {
    const queryParam = status ? `?status=${encodeURIComponent(status)}` : '';
    return await this.request<HospitalAlertsResponse>(
      `/api/ivf/alerts/hospital${queryParam}`,
      { method: 'GET' }
    );
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<AcknowledgeAlertResponse> {
    return await this.post<AcknowledgeAlertResponse>(
      '/api/ivf/alerts/acknowledge',
      { alert_id: alertId }
    );
  }

  /**
   * Check and create alerts for a tank or all tanks
   */
  async checkAndCreateAlerts(tank_code?: string): Promise<CheckAlertsResponse> {
    const queryParam = tank_code ? `?tank_code=${encodeURIComponent(tank_code)}` : '';
    return await this.request<CheckAlertsResponse>(
      `/api/ivf/alerts/check${queryParam}`,
      { method: 'GET' }
    );
  }
}

// Export singleton instance
export const ivfAlertsService = new IvfAlertsService();
