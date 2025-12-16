import { BaseApiService, type ApiResponse } from './baseApiService';

export interface ActiveRouteApiItem {
  id: string | number;
  patient_id: string | number;
  origin?: string;
  destination?: string;
  route?: string;
  provider?: string;
  carrier?: string;
  status: string;
  start_date?: string;
  date?: string;
  last_updated?: string;
  region?: string;
  source_region?: string;
  destination_region?: string;
}

export interface ActiveRouteItem {
  id: string;
  patientId: string;
  origin?: string;
  destination?: string;
  routeText: string;
  supplyChain: string;
  status: 'Safe' | 'Risk' | 'Delayed' | string;
  date: string;
  region?: string;
  sourceRegion?: string;
  destinationRegion?: string;
}

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

class ShipmentService extends BaseApiService {
  /**
   * Control Tower Map routes
   * GET /api/shipment/control-tower-map
   */
  async getControlTowerMapRoutes(filters?: {
    routeStatus?: string;
    carrier?: string;
    region?: string;
  }): Promise<
    Array<{
      shipment_id: number | string;
      patient_id: string;
      source_location: string;
      destination_location: string;
      source_latitude: number;
      source_longitude: number;
      destination_latitude: number;
      destination_longitude: number;
      route_status?: string;
    }>
  > {
    const params = new URLSearchParams();
    if (filters?.routeStatus && filters.routeStatus !== 'All') {
      params.append('route_status', filters.routeStatus);
    }
    if (filters?.carrier && filters.carrier !== 'All') {
      params.append('carriers', filters.carrier);
    }
    if (filters?.region && filters.region !== 'All') {
      params.append('regions', filters.region);
    }

    const queryString = params.toString();
    const url = queryString ? `/api/shipment/control-tower-map?${queryString}` : '/api/shipment/control-tower-map';

    const res = await this.get<{
      routes: Array<{
        shipment_id: number | string;
        patient_id: string;
        source_location: string;
        destination_location: string;
        source_latitude: number;
        source_longitude: number;
        destination_latitude: number;
        destination_longitude: number;
        route_status?: string;
      }>;
      total_routes?: number;
    } | Array<any>>(url);

    const list = Array.isArray(res) ? (res as any) : (res as any)?.routes || [];
    return list as any;
  }
  async getActiveRoutes(): Promise<ActiveRouteItem[]> {
    const res = await this.get<{ routes: ActiveRouteApiItem[] } | ActiveRouteApiItem[]>(
      '/api/shipment/active-routes'
    );

    const list: ActiveRouteApiItem[] = Array.isArray(res) ? res : (res as any)?.routes || [];

    return list.map((r) => {
      const id = String(r.id ?? `${r.patient_id}`);
      const patientId = String(r.patient_id ?? 'N/A');
      // Prefer explicit origin/destination; else try alternate keys or parse from `route`
      const pickFirst = (...vals: Array<unknown>): string => {
        for (const v of vals) {
          const s = (v ?? '').toString().trim();
          if (s) return s;
        }
        return '';
      };

      let origin = pickFirst(
        r.origin,
        (r as any).source,
        (r as any).from,
        (r as any).from_location,
        (r as any).start,
        (r as any).start_location,
        (r as any).pickup_location
      );

      let destination = pickFirst(
        r.destination,
        (r as any).dest,
        (r as any).to,
        (r as any).to_location,
        (r as any).end,
        (r as any).end_location,
        (r as any).dropoff_location
      );
      if ((!origin || !destination) && r.route) {
        const s = String(r.route);
        let parts: string[] = [];
        if (s.includes('→')) parts = s.split('→');
        else if (s.includes('->')) parts = s.split('->');
        else if (s.includes('—')) parts = s.split('—');
        else if (s.includes('-')) parts = s.split('-');
        else if (s.toLowerCase().includes(' to ')) parts = s.split(/\s+to\s+/i);
        if (parts.length >= 2) {
          origin = origin || parts[0].trim();
          destination = destination || parts[1].trim();
        }
      }
      const routeText = [origin, destination].filter(Boolean).length === 2
        ? `${origin} → ${destination}`
        : (r.route ? String(r.route) : '');
      const carrier = (r as any).carrier || r.provider;
      const supplyChain = carrier ? String(carrier) : '';
      const rawDate = r.start_date || r.date || r.last_updated || new Date().toISOString();
      const d = new Date(rawDate);
      const date = isNaN(d.getTime()) ? rawDate : d.toLocaleDateString('en-GB');

      // Normalize status from various possible fields and formats
      const rawStatus = (r as any).status
        ?? (r as any).route_status
        ?? (r as any).current_status
        ?? (r as any).status_label
        ?? '';
      let statusText = String(rawStatus).trim();
      if (!statusText) {
        statusText = 'Safe';
      } else {
        const s = statusText.toLowerCase();
        if (s.includes('risk') || s.includes('red')) statusText = 'Risk';
        else if (s.includes('delay') || s.includes('orange') || s.includes('amber')) statusText = 'Delayed';
        else statusText = 'Safe';
      }

      // Extract region data from API response
      const region = (r as any).region;
      const sourceRegion = (r as any).source_region;
      const destinationRegion = (r as any).destination_region;

      return { 
        id, 
        patientId, 
        origin, 
        destination, 
        routeText, 
        supplyChain, 
        status: statusText, 
        date,
        region,
        sourceRegion,
        destinationRegion
      };
    });
  }

  /**
   * Get 3PL players for a specific patient
   */
  async get3PLPlayers(patientId: string): Promise<ThreePLPlayer[]> {
    try {
      const response = await this.request<ThreePLPlayer[] | ThreePLPlayersResponse>(
        `/api/shipment/3pl-players/${patientId}`
      );

      if (Array.isArray(response)) {
        return response;
      }

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

  async getPatientJourneySummary(patientId: string): Promise<PatientJourneySummaryResponse> {
    return await this.get<PatientJourneySummaryResponse>(`/api/shipment/patient/${encodeURIComponent(patientId)}/summary`);
  }

  /**
   * Document checklist for a patient
   * GET /api/shipment/document-checklist/:patientId
   */
  async getDocumentChecklist(
    patientId: string
  ): Promise<{
    items: Array<{
      stage: string;
      actual: number;
      needed: number;
      missed: number;
      missing_documents?: string[];
    }>;
    total_items?: number;
    non_compliance_percentage?: number;
  }> {
    return this.get(
      `/api/shipment/document-checklist/${encodeURIComponent(patientId)}`
    );
  }

  /**
   * Get available regions
   * GET /api/shipment/regions
   */
  async getAvailableRegions(): Promise<string[]> {
    return this.get<string[]>('/api/shipment/regions');
  }
}

export interface ShipmentLegDetail {
  leg_order: number;
  mode_of_transport: string;
  from_location: string;
  to_location: string;
  carrier_name?: string;
  provider_name?: string;
  departure_time?: string;
  arrival_time?: string;
  scheduled_time?: string;
  handover_time?: string;
  leg_status: string;
  leg_quality_loss?: number;
  ln2_refill?: string;
  warehouse?: string;
  doc_count_actual?: number;
  doc_count_needed?: number;
}

export interface ShipmentLegSummary {
  status: string;
  provider_name?: string;
  legs: ShipmentLegDetail[];
  arrival_date?: string;
  planned_date?: string;
}

export interface ReengineeringStage {
  status: string;
  start_date?: string;
  end_date?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  description?: string;
}

export interface CurrentStatusSummary {
  leg1_status: string;
  reengineering_status: string;
  leg2_status: string;
  overall_stage?: string;
}

export interface PatientJourneySummaryResponse {
  patient_id: string;
  condition: string;
  hospital_name?: string;
  leg1?: ShipmentLegSummary;
  reengineering?: ReengineeringStage;
  leg2?: ShipmentLegSummary;
  current_status: CurrentStatusSummary;
}

export const shipmentService = new ShipmentService();


