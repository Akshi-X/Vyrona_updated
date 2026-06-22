import { BaseApiService, type ApiResponse } from '../../../services/baseApiService';
import { shipmentService } from '../../../services/shipmentService';
import { ivfAlertsService } from '../../../services/ivfAlertsService';
import type { BranchMetrics, Route } from '../types/map';

interface BranchCoordinatesItem {
  branch_id: number;
  branch_name: string;
  latitude: number | null;
  longitude: number | null;
  district_name?: string;
  state_name?: string;
}

interface BranchCoordinatesResponse extends ApiResponse {
  branches: BranchCoordinatesItem[];
  total: number;
}

const CENTER_OF_INDIA = { lat: 20.5937, lng: 78.9629 };

class MapService extends BaseApiService {
  async getBranchesWithMetrics(): Promise<BranchMetrics[]> {
    try {
      const [refResponse, alertsResponse, coordsResponse] = await Promise.all([
        shipmentService.getActiveRefrigerators(),
        ivfAlertsService.getHospitalAlerts(),
        this.getBranchCoordinates(),
      ]);

      console.log('Map Service - Ref Response:', refResponse);
      console.log('Map Service - Alerts Response:', alertsResponse);
      console.log('Map Service - Coords Response:', coordsResponse);

      const branches = refResponse?.branches || [];
      const alerts = alertsResponse?.alerts || [];
      const coordsMap = new Map(
        (coordsResponse?.branches || []).map(c => [c.branch_id, c])
      );

      console.log('Map Service - Branches:', branches.length, branches);

      const alertCountByBranch = new Map<number, number>();
      alerts.forEach((alert) => {
        if (alert.branch_id) {
          alertCountByBranch.set(
            alert.branch_id,
            (alertCountByBranch.get(alert.branch_id) ?? 0) + 1
          );
        }
      });

      const mapped = branches.map((branch) => {
        const coords = coordsMap.get(branch.branch_id);
        const lastRefrigUpdate = (branch.refrigerators || [])
          .map((r) => r.updated_at)
          .filter(Boolean)
          .sort()
          .pop();

        return {
          branch_id: branch.branch_id,
          branch_name: branch.branch_name || `Branch #${branch.branch_id}`,
          latitude: coords?.latitude || CENTER_OF_INDIA.lat,
          longitude: coords?.longitude || CENTER_OF_INDIA.lng,
          district_name: coords?.district_name,
          state_name: coords?.state_name,
          country_name: 'India',
          refrigerator_count: branch.refrigerators?.length ?? 0,
          active_alerts: alertCountByBranch.get(branch.branch_id) ?? 0,
          last_updated: lastRefrigUpdate ? new Date(lastRefrigUpdate).toLocaleString() : undefined,
        };
      });

      if (mapped.length > 0) {
        console.log('Branches mapped:', mapped.length);
        return mapped;
      }

      // Fallback mock data for demo if API returns no branches
      console.log('No branches from API, using mock data');
      return [
        {
          branch_id: 1,
          branch_name: 'Chennai',
          latitude: 13.0827,
          longitude: 80.2707,
          district_name: 'Chennai',
          state_name: 'Tamil Nadu',
          country_name: 'India',
          refrigerator_count: 5,
          active_alerts: 1,
          last_updated: new Date().toLocaleString(),
        },
        {
          branch_id: 3,
          branch_name: 'Hyderabad',
          latitude: 17.3850,
          longitude: 78.4867,
          district_name: 'Hyderabad',
          state_name: 'Telangana',
          country_name: 'India',
          refrigerator_count: 6,
          active_alerts: 2,
          last_updated: new Date().toLocaleString(),
        },
      ];
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      // Return mock data on error for demo
      return [
        {
          branch_id: 1,
          branch_name: 'Chennai',
          latitude: 13.0827,
          longitude: 80.2707,
          district_name: 'Chennai',
          state_name: 'Tamil Nadu',
          country_name: 'India',
          refrigerator_count: 5,
          active_alerts: 1,
          last_updated: new Date().toLocaleString(),
        },
      ];
    }
  }

  async getBranchCoordinates(): Promise<BranchCoordinatesResponse | null> {
    try {
      const response = await this.get<BranchCoordinatesResponse>('/api/ivf/branch_coordinates');
      return response;
    } catch (error) {
      console.warn('Failed to fetch branch coordinates from API, will use fallback', error);
      return null;
    }
  }

  generateRoutesFromBranches(branches: BranchMetrics[]): Route[] {
    if (branches.length < 2) return [];

    const routes: Route[] = [];
    const centerBranch = branches.reduce((prev, current) =>
      current.refrigerator_count > prev.refrigerator_count ? current : prev
    );

    branches.forEach((branch) => {
      if (branch.branch_id !== centerBranch.branch_id) {
        routes.push({
          id: `${centerBranch.branch_id}-${branch.branch_id}`,
          from_branch_id: centerBranch.branch_id,
          to_branch_id: branch.branch_id,
          from: [centerBranch.longitude, centerBranch.latitude],
          to: [branch.longitude, branch.latitude],
          type: 'hub',
        });
      }
    });

    return routes;
  }
}

export const mapService = new MapService();
