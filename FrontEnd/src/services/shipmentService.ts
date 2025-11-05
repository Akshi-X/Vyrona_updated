import { BaseApiService } from './baseApiService';

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

class ShipmentService extends BaseApiService {
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
}

export const shipmentService = new ShipmentService();


