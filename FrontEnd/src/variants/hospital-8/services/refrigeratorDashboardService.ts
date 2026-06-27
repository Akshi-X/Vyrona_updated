import { BaseApiService } from '../../../services/baseApiService';

export interface TrendPoint {
  day: string;
  cumulative: number;
}

export interface DeviationTrendResponse {
  total: number;
  previous_total: number;
  delta_pct: number | null;
  series: TrendPoint[];
}

export interface CategoryItem {
  kpi_name: string;
  label: string;
  count: number;
  pct: number;
}

export interface DeviationsByCategoryResponse {
  total: number;
  previous_total: number;
  delta_pct: number | null;
  categories: CategoryItem[];
}

export interface TopKpiResponse {
  kpi_name: string | null;
  label: string;
  count: number;
  previous_count: number;
  delta_pct: number | null;
}

export interface BranchDistItem {
  branch_id: number;
  branch_name: string;
  count: number;
  pct: number;
}

export interface BranchCriticalDistributionResponse {
  total: number;
  previous_total: number;
  delta_pct: number | null;
  branches: BranchDistItem[];
}

export interface OperationsResponse {
  active_alerts: number;
  unread_messages: number;
  active_tasks: number;
}

export interface TempHumidityPoint {
  t: number;
  temperature: number | null;
  humidity: number | null;
}

export interface TemperatureHumidityTrendResponse {
  avg_temperature: number | null;
  avg_humidity: number | null;
  bucket_hours: number;
  points: TempHumidityPoint[];
}

interface DateRangeArgs {
  fromTs: number;
  toTs: number;
  branchId?: number | null;
}

interface BranchOnlyArgs {
  branchId?: number | null;
}

class RefrigeratorDashboardService extends BaseApiService {
  private qs(fromTs: number, toTs: number, branchId?: number | null): string {
    let s = `?from_ts=${fromTs}&to_ts=${toTs}`;
    if (branchId != null) s += `&branch_id=${branchId}`;
    return s;
  }

  async getDeviationTrend({ fromTs, toTs, branchId }: DateRangeArgs): Promise<DeviationTrendResponse> {
    try {
      return await this.get<DeviationTrendResponse>(
        `/api/ivf/refrigerator-dashboard/deviation-trend${this.qs(fromTs, toTs, branchId)}`
      );
    } catch {
      return { total: 0, previous_total: 0, delta_pct: null, series: [] };
    }
  }

  async getDeviationsByCategory({ fromTs, toTs, branchId }: DateRangeArgs): Promise<DeviationsByCategoryResponse> {
    try {
      return await this.get<DeviationsByCategoryResponse>(
        `/api/ivf/refrigerator-dashboard/deviations-by-category${this.qs(fromTs, toTs, branchId)}`
      );
    } catch {
      return { total: 0, previous_total: 0, delta_pct: null, categories: [] };
    }
  }

  async getTopKpi({ fromTs, toTs, branchId }: DateRangeArgs): Promise<TopKpiResponse> {
    try {
      return await this.get<TopKpiResponse>(
        `/api/ivf/refrigerator-dashboard/top-kpi${this.qs(fromTs, toTs, branchId)}`
      );
    } catch {
      return { kpi_name: null, label: 'N/A', count: 0, previous_count: 0, delta_pct: null };
    }
  }

  async getBranchCriticalDistribution({ fromTs, toTs }: Pick<DateRangeArgs, 'fromTs' | 'toTs'>): Promise<BranchCriticalDistributionResponse> {
    try {
      return await this.get<BranchCriticalDistributionResponse>(
        `/api/ivf/refrigerator-dashboard/branch-critical-distribution?from_ts=${fromTs}&to_ts=${toTs}`
      );
    } catch {
      return { total: 0, previous_total: 0, delta_pct: null, branches: [] };
    }
  }

  async getTemperatureHumidityTrend({ fromTs, toTs, branchId }: DateRangeArgs): Promise<TemperatureHumidityTrendResponse> {
    try {
      return await this.get<TemperatureHumidityTrendResponse>(
        `/api/ivf/refrigerator-dashboard/temperature-humidity-trend${this.qs(fromTs, toTs, branchId)}`
      );
    } catch {
      return { avg_temperature: null, avg_humidity: null, bucket_hours: 0, points: [] };
    }
  }

  async getOperations({ branchId }: BranchOnlyArgs): Promise<OperationsResponse> {
    try {
      const qs = branchId != null ? `?branch_id=${branchId}` : '';
      return await this.get<OperationsResponse>(
        `/api/ivf/refrigerator-dashboard/operations${qs}`
      );
    } catch {
      return { active_alerts: 0, unread_messages: 0, active_tasks: 0 };
    }
  }
}

export const refrigeratorDashboardService = new RefrigeratorDashboardService();
