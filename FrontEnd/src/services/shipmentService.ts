import { BaseApiService, type ApiResponse } from './baseApiService';

export interface ThreePLPlayer {
  player_name: string;
  modes: string;
  source: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  handover_time: string;
  ln2_refill: string;
  warehouse: string | null;
}

export interface ThreePLPlayersResponse extends ApiResponse<ThreePLPlayer[]> {
  data?: ThreePLPlayer[];
}

export class ShipmentService extends BaseApiService {
  /**
   * Get 3PL players for a specific patient
   */
  async get3PLPlayers(patientId: string): Promise<ThreePLPlayer[]> {
    try {
      const response = await this.request<ThreePLPlayer[] | ThreePLPlayersResponse>(
        `/api/shipment/3pl-players/${patientId}`
      );
      
      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      }
      
      // If response has a data property, extract it
      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as any).data;
        if (Array.isArray(data)) {
          return data;
        }
      }
      
      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Transport time comparison for a patient
   * GET /api/shipment/transport-time-comparison/:patientId
   */
  async getTransportTimeComparison(
    patientId: string
  ): Promise<
    Array<{
      source_location: string;
      destination_location: string;
      scheduled_time: string;
      actual_time: string;
    }>
  > {
    return this.get(
      `/api/shipment/transport-time-comparison/${encodeURIComponent(patientId)}`
    );
  }
}

// Export a singleton instance
export const shipmentService = new ShipmentService();

