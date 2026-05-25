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
  acknowledgment_reason?: string;
  created_at: string;
  updated_at?: string;
  refrigerator_id?: number | null;
  refrigerator_code?: string | null;
}

export interface CanisterAlertsResponse {
  canister_id: number;
  canister_number?: string;
  alerts: IVFAlert[];
  total_count: number;
}

export interface IncubatorAlertsResponse {
  incubator_id: number;
  incubator_code?: string;
  chamber_id?: string | null;
  alerts: IVFAlert[];
  total_count: number;
}

export interface RefrigeratorAlertsResponse {
  refrigerator_id: number;
  refrigerator_code?: string;
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
  acknowledgment_reason?: string;
}

export interface AcknowledgeAlertsRequest {
  alert_id: string[];
  acknowledgment_reason?: string;
}

export interface AcknowledgeAlertResponse {
  alert_id: string;
  status: 'Active' | 'Acknowledged';
  message: string;
  acknowledged_at: string;
  acknowledgment_reason?: string;
}

export interface AcknowledgeAlertsResponse {
  alert_id: string[];
  status: 'Active' | 'Acknowledged';
  message: string;
  acknowledged_count: number;
  acknowledged_at: string;
  acknowledgment_reason?: string;
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
  async acknowledgeAlert(alertId: string, reason?: string): Promise<AcknowledgeAlertResponse> {
    return await this.post<AcknowledgeAlertResponse>(
      '/api/ivf/alerts/acknowledge',
      { alert_id: alertId, acknowledgment_reason: reason }
    );
  }

  /**
   * Acknowledge multiple alerts
   */
  async acknowledgeAlerts(alertIds: string[], reason?: string): Promise<AcknowledgeAlertsResponse> {
    return await this.post<AcknowledgeAlertsResponse>(
      '/api/ivf/alerts/acknowledge-all',
      { alert_id: alertIds, acknowledgment_reason: reason }
    );
  }

  /**
   * Get alerts for a specific incubator (optionally filtered by chamber)
   */
  async getIncubatorAlerts(incubatorId: number, chamberId?: string): Promise<IncubatorAlertsResponse> {
    const query = chamberId ? `?chamber_id=${encodeURIComponent(chamberId)}` : '';
    return await this.request<IncubatorAlertsResponse>(
      `/api/ivf/alerts/incubator/${incubatorId}${query}`,
      { method: 'GET' }
    );
  }

  /**
   * Get alerts for a specific refrigerator
   */
  async getRefrigeratorAlerts(refrigeratorId: number): Promise<RefrigeratorAlertsResponse> {
    return await this.request<RefrigeratorAlertsResponse>(
      `/api/ivf/alerts/refrigerator/${refrigeratorId}`,
      { method: 'GET' }
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
