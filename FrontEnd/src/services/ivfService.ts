import { BaseApiService } from './baseApiService';
import type {
  EmbryoTrackingApiResponse,
  IVFTreatment,
} from '../types/ivf.ts';

export interface TotalEmbryosCryolocksResponse {
  total_embryos: number;
  total_cryolocks: number;
  total_embryos_cryolocks: number;
  last_updated: string;
  status: string;
}

export interface TotalContainersResponse {
  total_containers: number;
  last_updated: string;
  status: string;
}

export interface QualityDeviationsFlaggedResponse {
  total_quality_deviations: number;
  canister_status_deviations: number;
  ln2_level_deviations: number;
  last_updated: string;
  status: string;
}

export interface TopDeviationDriverResponse {
  driver_name: string;
  count: number;
  percentage: number;
  all_drivers: Record<string, number>;
  last_updated: string;
  status: string;
}

export interface OutboundShipmentsResponse {
  total_outbound_shipments: number;
  last_updated: string;
  status: string;
}

export interface AvgQualityLossPerContainerResponse {
  avg_quality_loss_per_container: number;
  total_containers: number;
  last_updated: string;
  status: string;
}

// Internal type for raw API response (snake_case)
interface RawEmbryoTrackingApiItem {
  his_number: string;
  cryolock_number: string;
  canister_number: number;
  tank_id: string;
  cane_id: string;
  goblet_color: string;
  cryolock_color: string;
  date_of_vitrification: string;
  embryo_grading?: string;
  site_name: string;
  status: string;
}

interface RawEmbryoTrackingApiResponse {
  data: RawEmbryoTrackingApiItem[];
  total: number;
}

// Type for canister tracking details API response (snake_case)
interface RawCanisterTrackingApiItem {
  his_number: string;
  cryolock_number: string;
  canister_number: number;
  cane_id: string;
  goblet_color: string;
  cryolock_color: string;
  date_of_vitrification: string;
  move_to: boolean;
}

interface RawCanisterTrackingApiResponse {
  data: RawCanisterTrackingApiItem[];
  total: number;
}

const mapApiItemToTreatment = (item: RawEmbryoTrackingApiItem): IVFTreatment => ({
  hisNumber: item.his_number,
  cryolockNum: item.cryolock_number,
  canisterNum: item.canister_number,
  tankId: item.tank_id,
  caneId: item.cane_id,
  gobletColor: item.goblet_color,
  cryolockColor: item.cryolock_color,
  dateOfVitrification: item.date_of_vitrification,
  siteName: item.site_name,
  status: item.status,
  embryoGrading: item.embryo_grading,
});

const mapCanisterTrackingItemToTreatment = (item: RawCanisterTrackingApiItem): IVFTreatment => ({
  hisNumber: item.his_number,
  cryolockNum: item.cryolock_number,
  canisterNum: item.canister_number,
  tankId: '-', // Not provided by API
  caneId: item.cane_id,
  gobletColor: item.goblet_color,
  cryolockColor: item.cryolock_color,
  dateOfVitrification: item.date_of_vitrification,
  siteName: '-', // Not provided by API
  status: '-', // Not provided by API
  embryoGrading: '-', // Not provided by API
});

export class IvfService extends BaseApiService {
  async getEmbryoTracking(): Promise<EmbryoTrackingApiResponse> {
    const response = await this.request<RawEmbryoTrackingApiResponse>('/api/ivf/embryo_tracking', {
      method: 'GET',
    });
    return {
      data: response.data.map(mapApiItemToTreatment),
      total: response.total,
    };
  }

  async getTotalEmbryosCryolocks(): Promise<TotalEmbryosCryolocksResponse> {
    return await this.request<TotalEmbryosCryolocksResponse>(
      '/api/ivf/dashboard/metrics/total-embryos-cryolocks',
      { method: 'GET' }
    );
  }

  async getTotalContainers(): Promise<TotalContainersResponse> {
    return await this.request<TotalContainersResponse>(
      '/api/ivf/dashboard/metrics/total-containers',
      { method: 'GET' }
    );
  }

  async getQualityDeviationsFlagged(): Promise<QualityDeviationsFlaggedResponse> {
    return await this.request<QualityDeviationsFlaggedResponse>(
      '/api/ivf/dashboard/metrics/quality-deviations-flagged',
      { method: 'GET' }
    );
  }

  async getTopDeviationDriver(): Promise<TopDeviationDriverResponse> {
    return await this.request<TopDeviationDriverResponse>(
      '/api/ivf/dashboard/metrics/top-deviation-driver',
      { method: 'GET' }
    );
  }

  async getOutboundShipments(): Promise<OutboundShipmentsResponse> {
    return await this.request<OutboundShipmentsResponse>(
      '/api/ivf/dashboard/metrics/outbound-shipments',
      { method: 'GET' }
    );
  }

  async getAvgQualityLossPerContainer(): Promise<AvgQualityLossPerContainerResponse> {
    return await this.request<AvgQualityLossPerContainerResponse>(
      '/api/ivf/dashboard/metrics/avg-quality-loss-per-container',
      { method: 'GET' }
    );
  }

  async getCanisterTrackingDetails(canisterId: string | number): Promise<EmbryoTrackingApiResponse> {
    const response = await this.request<RawCanisterTrackingApiResponse>(
      `/api/quality-tracking/canisters/${canisterId}/tracking-details`,
      { method: 'GET' }
    );
    return {
      data: response.data.map(mapCanisterTrackingItemToTreatment),
      total: response.total,
    };
  }

  /**
   * Update goblet color for a specific cane within a canister
   * @param canisterId - The canister ID
   * @param caneIdentifier - The cane identifier string (e.g., "Cane-A 12", "Cane-5", or just "5")
   * @param gobletColor - The goblet color value to set (e.g., "Yellow", "Red", "Blue")
   */
  async updateGobletColor(
    canisterId: string | number,
    caneIdentifier: string,
    gobletColor: string
  ): Promise<{ success: boolean; message: string; updated_color: string }> {
    return await this.patch<{ success: boolean; message: string; updated_color: string }>(
      `/api/quality-tracking/canisters/${canisterId}/goblet-color`,
      {
        cane_identifier: caneIdentifier, // Cane identifier string, not an ID
        goblet_color: gobletColor,
      }
    );
  }

  /**
   * Update cryolock color for a specific cryolock within a canister
   * @param canisterId - The canister ID
   * @param cryolockNumber - The cryolock number string (e.g., "CAN-EGM-001-01"), NOT an ID
   * @param cryolockColor - The cryolock color value to set (e.g., "Yellow", "Red", "Blue")
   */
  async updateCryolockColor(
    canisterId: string | number,
    cryolockNumber: string,
    cryolockColor: string
  ): Promise<{ success: boolean; message: string; updated_color: string }> {
    return await this.patch<{ success: boolean; message: string; updated_color: string }>(
      `/api/quality-tracking/canisters/${canisterId}/cryolock-color`,
      {
        cryolock_number: cryolockNumber, // Cryolock number string (e.g., "CAN-EGM-001-01"), NOT an ID
        cryolock_color: cryolockColor,
      }
    );
  }
}

export const ivfService = new IvfService();

