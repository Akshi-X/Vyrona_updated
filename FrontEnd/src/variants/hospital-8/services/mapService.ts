import { BaseApiService } from '../../../services/baseApiService';
import type { BranchMetrics, Route } from '../types/map';

interface BranchMapMetricsItem {
  branch_id: number;
  branch_name: string | null;
  latitude: number | null;
  longitude: number | null;
  district_name?: string | null;
  state_name?: string | null;
  refrigerator_count: number;
  active_alerts: number;
}

interface BranchMapMetricsResponse {
  branches: BranchMapMetricsItem[];
  total: number;
}

const CENTER_OF_INDIA = { lat: 20.5937, lng: 78.9629 };

const FALLBACK_BRANCHES: BranchMetrics[] = [
  { branch_id: 1, branch_name: 'Chennai', refrigerator_count: 5, active_alerts: 1, latitude: 13.0827, longitude: 80.2707, district_name: 'Chennai', state_name: 'Tamil Nadu', country_name: 'India' },
  { branch_id: 2, branch_name: 'Hyderabad', refrigerator_count: 6, active_alerts: 2, latitude: 17.3850, longitude: 78.4867, district_name: 'Hyderabad', state_name: 'Telangana', country_name: 'India' },
  { branch_id: 3, branch_name: 'Mumbai', refrigerator_count: 12, active_alerts: 0, latitude: 19.0760, longitude: 72.8777, district_name: 'Mumbai', state_name: 'Maharashtra', country_name: 'India' },
  { branch_id: 4, branch_name: 'Delhi', refrigerator_count: 9, active_alerts: 0, latitude: 28.7041, longitude: 77.1025, district_name: 'New Delhi', state_name: 'Delhi', country_name: 'India' },
  { branch_id: 5, branch_name: 'Kolkata', refrigerator_count: 7, active_alerts: 1, latitude: 22.5726, longitude: 88.3639, district_name: 'Kolkata', state_name: 'West Bengal', country_name: 'India' },
];

class MapService extends BaseApiService {
  async getBranchesWithMetrics(): Promise<BranchMetrics[]> {
    try {
      const response = await this.get<BranchMapMetricsResponse>('/api/ivf/branch_map_metrics');
      const items = response?.branches ?? [];

      if (items.length === 0) return FALLBACK_BRANCHES;

      return items.map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name ?? `Branch #${b.branch_id}`,
        latitude: b.latitude ?? CENTER_OF_INDIA.lat,
        longitude: b.longitude ?? CENTER_OF_INDIA.lng,
        district_name: b.district_name ?? undefined,
        state_name: b.state_name ?? undefined,
        country_name: 'India',
        refrigerator_count: b.refrigerator_count,
        active_alerts: b.active_alerts,
      }));
    } catch (error) {
      console.error('Failed to fetch branch map metrics:', error);
      return FALLBACK_BRANCHES;
    }
  }

  generateRoutesFromBranches(branches: BranchMetrics[]): Route[] {
    if (branches.length < 2) return [];

    const centerBranch = branches.reduce((prev, current) =>
      current.refrigerator_count > prev.refrigerator_count ? current : prev
    );

    return branches
      .filter((b) => b.branch_id !== centerBranch.branch_id)
      .map((branch) => ({
        id: `${centerBranch.branch_id}-${branch.branch_id}`,
        from_branch_id: centerBranch.branch_id,
        to_branch_id: branch.branch_id,
        from: [centerBranch.longitude, centerBranch.latitude] as [number, number],
        to: [branch.longitude, branch.latitude] as [number, number],
        type: 'hub' as const,
      }));
  }
}

export const mapService = new MapService();
