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
  async getControlTowerMapRoutes(): Promise<
    Array<{
      shipment_id: number | string;
      patient_id: string;
      source_location: string;
      destination_location: string;
      source_latitude: number;
      source_longitude: number;
      destination_latitude: number;
      destination_longitude: number;
    }>
  > {
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
      }>;
      total_routes?: number;
    } | Array<any>>('/api/shipment/control-tower-map');

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

      return { id, patientId, origin, destination, routeText, supplyChain, status: statusText, date };
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

  /**
   * Document checklist for a patient
   * GET /api/shipment/document-checklist/:patientId
   */
  async getDocumentChecklist(
    patientId: string
  ): Promise<{
    items: Array<{ stage: string; actual: number; needed: number; missed: number }>;
    total_items?: number;
    missing_documents?: string[];
    non_compliance_percentage?: number;
  }> {
    return this.get(
      `/api/shipment/document-checklist/${encodeURIComponent(patientId)}`
    );
  }
}

export const shipmentService = new ShipmentService();


