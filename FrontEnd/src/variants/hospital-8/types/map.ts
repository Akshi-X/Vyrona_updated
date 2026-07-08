export interface BranchCoordinates {
  branch_id: number;
  branch_name: string;
  latitude: number;
  longitude: number;
  district_name?: string;
  state_name?: string;
  country_name?: string;
}

export interface BranchMetrics extends BranchCoordinates {
  refrigerator_count: number;
  active_alerts: number;
  last_updated?: string;
  embryos_stored?: number;
  patients?: number;
  ln2_usage?: number;
}

export interface Route {
  id: string;
  from_branch_id: number;
  to_branch_id: number;
  from: [number, number];
  to: [number, number];
  type: 'hub' | 'branch' | 'clinic';
}

export interface MapState {
  selectedBranch: BranchMetrics | null;
  hoveredBranch: number | null;
  branches: BranchMetrics[];
  routes: Route[];
  loading: boolean;
}
