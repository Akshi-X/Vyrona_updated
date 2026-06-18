import { shipmentService } from '../../../services/shipmentService';
import { ivfAlertsService } from '../../../services/ivfAlertsService';
import type { BranchMetrics, Route } from '../types/map';

const BRANCH_COORDINATES: Record<number, { lat: number; lng: number; district?: string; state?: string }> = {
  1: { lat: 13.0827, lng: 80.2707, district: 'Chennai', state: 'Tamil Nadu' },
  3: { lat: 17.3850, lng: 78.4867, district: 'Hyderabad', state: 'Telangana' },
  4: { lat: 19.0760, lng: 72.8777, district: 'Mumbai', state: 'Maharashtra' },
  5: { lat: 28.7041, lng: 77.1025, district: 'Delhi', state: 'Delhi' },
};

export const mapService = {
  async getBranchesWithMetrics(): Promise<BranchMetrics[]> {
    try {
      const [refResponse, alertsResponse] = await Promise.all([
        shipmentService.getActiveRefrigerators(),
        ivfAlertsService.getHospitalAlerts(),
      ]);

      console.log('Map Service - Ref Response:', refResponse);
      console.log('Map Service - Alerts Response:', alertsResponse);

      const branches = refResponse?.branches || [];
      const alerts = alertsResponse?.alerts || [];

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
        const coords = BRANCH_COORDINATES[branch.branch_id];
        const lastRefrigUpdate = (branch.refrigerators || [])
          .map((r) => r.updated_at)
          .filter(Boolean)
          .sort()
          .pop();

        return {
          branch_id: branch.branch_id,
          branch_name: branch.branch_name || `Branch #${branch.branch_id}`,
          latitude: coords?.lat || 20.5937,
          longitude: coords?.lng || 78.9629,
          district_name: coords?.district,
          state_name: coords?.state,
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
  },

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
  },
};
