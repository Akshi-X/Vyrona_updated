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
}

export const ivfService = new IvfService();

