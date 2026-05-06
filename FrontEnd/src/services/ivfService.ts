import { BaseApiService } from "./baseApiService";
import { authUtils } from "../utils/auth";
import type { EmbryoTrackingApiResponse, IVFTreatment } from "../types/ivf.ts";

export interface EmbryoTrackingFiltersResponse {
    site_names: string[];
    statuses: string[];
    goblet_colors: string[];
    crylock_colors: string[];
    /** Total records (unfiltered) for "filtered / total" display */
    total?: number;
    site_name_counts?: Record<string, number>;
    status_counts?: Record<string, number>;
    goblet_color_counts?: Record<string, number>;
    crylock_color_counts?: Record<string, number>;
}

export interface EmbryoTrackingFilters {
    branch_name?: string | null;
    status?: string | null;
    cryolock_color?: string | null;
    goblet_color?: string | null;
}

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
    total_deviations: number;
    active_total_deviations: number;
    deviations_by_kpi: Record<string, number>;
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

export interface TotalDeviationsResponse {
    total_deviations: number;
    deviations_by_kpi: Record<string, number>;
}

export interface IvfBranch {
    branch_id: number;
    branch_name: string;
}

export interface IvfBranchesResponse {
    branches: IvfBranch[];
    total: number;
}

export interface CanisterCheckResponse {
    exists: boolean;
    canister_number: string;
    canister_id: number;
    is_active: boolean;
    canister_status: string;
    message: string;
}

export interface TankInTransitCheckResponse {
    exists: boolean;
    tank_code: string;
    his_number?: string | null;
    cryolock_number?: string | null;
    tank_id: number | null;
    branch_id: number | null;
    branch_name: string | null;
    has_in_transit_shipments: boolean;
    in_transit_count: number;
    message: string;
}

/** Single KPI config row (Alert Setting list/CRUD). */
export interface KpiConfigRow {
    id: number;
    hospital_id: number;
    branch_id: number;
    tank_id: number;
    kpi_name: string;
    alert_name: string | null;
    min: number | null;
    max: number | null;
    unit: string | null;
    alert_type: string | null;
    cooldown_minutes: number;
    unack_escalation_threshold: number | null;
    status: boolean;
}

/** Payload for create/update KPI config. */
export interface KpiConfigPayload {
    hospital_id: number;
    branch_id: number;
    tank_id?: number | null;
    incubator_id?: number | null;
    chamber_id?: string | null;
    kpi_name: string;
    alert_name?: string | null;
    min?: number | null;
    max?: number | null;
    unit?: string | null;
    alert_type?: string | null;
    cooldown_minutes?: number;
    unack_escalation_threshold?: number | null;
    status?: boolean;
}

export interface HospitalNotificationSettings {
    hospital_id: number;
    is_email_notifify: boolean;
    is_whatsapp_notify: boolean;
}

export interface DeviationsGraphDataItem {
    site_id?: number;
    site_name?: string;
    container_name?: string; // Used for user view
    temperature: number;
    humidity: number;
    agitation_vibration: number;
    top_risk_driver_name: string;
    top_risk_driver_count: number;
    top_risk_driver: number;
    temp_internal: number;
    temp_external: number;
    shock: number;
}

export type DeviationsGraphDataRow = {
    alert_name: string;
    branch_name: string;
    tank_code?: string | null;
    deviation_count: number;
};

export type DeviationsGraphResponse =
    | DeviationsGraphDataRow[]
    | {
          available_heading?: string[];
          data?: DeviationsGraphDataRow[];
      };

export interface RefillLogItem {
    canister_id: number;
    refill_date: string;
    refill_time: string;
    refilled_by: string;
    description: string;
    status: string;
    cryoshipper: string | null;
    disinfected_shipper_infected_tank_description: string | null;
    reservoir: string | null;
    ln2_ordered_date: string | null;
    ln2_received_date: string | null;
    log_id: number;
    created_at: string;
    updated_at: string;
    created_by: string;
    updated_by: string | null;
}

export interface RefillLogsResponse {
    refill_logs: RefillLogItem[];
    count: number;
}

// Internal type for raw API response (snake_case)
interface RawEmbryoTrackingApiItem {
    his_number: string;
    cryolock_number: string;
    canister_number: number;
    tank_code: string;
    cane_code: string;
    goblet_color: string;
    cryolock_color: string;
    date_of_vitrification: string;
    embryo_grading?: string;
    site_name: string;
    status: string;
    description: string | null;
}

interface RawEmbryoTrackingApiResponse {
    data: RawEmbryoTrackingApiItem[];
    total: number;
    offset?: number;
    limit?: number;
    has_more?: boolean;
    next_offset?: number | null;
    message?: string;
}

// Type for canister tracking details API response (snake_case)
interface RawCanisterTrackingApiItem {
    his_number: string;
    cryolock_number: string;
    canister_number: number;
    cane_code: string;
    goblet_color: string;
    cryolock_color: string;
    date_of_vitrification: string;
    move_to: boolean;
    description: string | null;
}

interface RawCanisterTrackingApiResponse {
    data: RawCanisterTrackingApiItem[];
    total: number;
    available_slots: number;
}

const mapApiItemToTreatment = (
    item: RawEmbryoTrackingApiItem,
): IVFTreatment => ({
    hisNumber: item.his_number,
    cryolockNum: item.cryolock_number,
    canisterNum: item.canister_number,
    tankCode: item.tank_code,
    caneCode: item.cane_code,
    gobletColor: item.goblet_color,
    cryolockColor: item.cryolock_color,
    dateOfVitrification: item.date_of_vitrification,
    siteName: item.site_name,
    status: item.status,
    embryoGrading: item.embryo_grading,
    description: item.description,
});

const mapCanisterTrackingItemToTreatment = (
    item: RawCanisterTrackingApiItem,
): IVFTreatment => ({
    hisNumber: item.his_number,
    cryolockNum: item.cryolock_number,
    canisterNum: item.canister_number,
    tankCode: "-", // Not provided by API
    caneCode: item.cane_code,
    gobletColor: item.goblet_color,
    cryolockColor: item.cryolock_color,
    dateOfVitrification: item.date_of_vitrification,
    siteName: "-", // Not provided by API
    status: "-", // Not provided by API
    embryoGrading: "-", // Not provided by API
    description: item.description,
});

export class IvfService extends BaseApiService {
    private static readonly BRANCH_OVERRIDE_PARAM = "branch_id_override";

    private getEffectiveBranchId(): string | undefined {
        // Only managers should send branch_id (for users, backend will scope by their branch automatically)
        if (typeof window === "undefined") return undefined;
        try {
            const role = (localStorage.getItem("user_role") || "")
                .trim()
                .toLowerCase();
            const isManager = role.includes("manager");
            if (!isManager) return undefined;

            // Prefer URL param if present (supports refresh/share link), otherwise use session storage
            const fromUrl =
                new URLSearchParams(window.location.search).get(
                    IvfService.BRANCH_OVERRIDE_PARAM,
                ) ||
                // Backward compatibility if any old links used branch_id
                new URLSearchParams(window.location.search).get("branch_id") ||
                undefined;
            const fromSession =
                sessionStorage.getItem("ivf_selected_branch_id") || undefined;
            return (fromUrl || fromSession || undefined) ?? undefined;
        } catch {
            return undefined;
        }
    }

    private withBranchId(endpoint: string): string {
        const branchId = this.getEffectiveBranchId();
        if (!branchId) return endpoint;
        const sep = endpoint.includes("?") ? "&" : "?";
        return `${endpoint}${sep}${IvfService.BRANCH_OVERRIDE_PARAM}=${encodeURIComponent(branchId)}`;
    }

    async getBranches(hospitalId?: number): Promise<IvfBranchesResponse> {
        const endpoint = hospitalId
            ? `/api/ivf/branches?hospital_id=${hospitalId}`
            : "/api/ivf/branches";
        return await this.request<IvfBranchesResponse>(endpoint, {
            method: "GET",
        });
    }

    async getReservoirs(): Promise<{
        reservoirs: Array<{
            reservoir_id: number;
            reservoir_name: string;
            branch_id: number | null;
            hospital_id: number | null;
            branch_name: string | null;
            current_weight: number | null;
            max_weight: number | null;
            created_at: string | null;
        }>;
    }> {
        return await this.request("/api/ivf/reservoirs", { method: "GET" });
    }

    async getReservoirLogs(): Promise<{
        logs: Array<{
            log_id: number;
            reservoir_id: number;
            reservoir_name: string;
            branch_id: number | null;
            branch_name: string | null;
            ln2_ordered_date: string | null;
            ln2_received_date: string | null;
            created_at: string | null;
        }>;
    }> {
        return await this.request("/api/ivf/reservoir-logs", { method: "GET" });
    }

    async createReservoirLog(payload: {
        reservoir_id: number;
        ln2_ordered_date?: string | null;
        ln2_received_date?: string | null;
    }): Promise<{ log_id: number; reservoir_id: number }> {
        return await this.request("/api/ivf/reservoir-logs", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    async updateReservoirLog(logId: number, payload: {
        ln2_ordered_date?: string | null;
        ln2_received_date?: string | null;
    }): Promise<{ log_id: number; reservoir_id: number }> {
        return await this.request(`/api/ivf/reservoir-logs/${logId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
    }

    async checkCanisterExists(
        canisterId: string | number,
        branchId?: number | null,
    ): Promise<CanisterCheckResponse> {
        const params =
            branchId != null
                ? `?branch_id=${encodeURIComponent(branchId)}`
                : "";
        return await this.request<CanisterCheckResponse>(
            `/api/ivf/canisters/${encodeURIComponent(canisterId)}/check${params}`,
            { method: "GET" },
        );
    }

    /**
     * Get LN2 readings history for a tank (evaporation_rate_kg_per_h, ln2_mass_kg).
     * Used for initial load in LN2 Readings card before ln2-ws WebSocket connects.
     */
    async getLn2History(
        tankCode: string,
        limit = 30,
    ): Promise<{
        tank_code: string;
        tank_id: number;
        history: Array<{
            tank_code?: string;
            tank_id?: number;
            device_id?: string;
            timestamp: string;
            evaporation_rate_kg_per_h: number | null;
            ln2_mass_kg: number | null;
            ln2_level?: number | null;
            ln2_level_pct?: number | null;
            
            ln2_evaporation_rate?: number | null;
        }>;
    }> {
        return await this.request(
            `/api/ivf/quality/tanks/${encodeURIComponent(tankCode)}/ln2-history?limit=${limit}`,
            { method: "GET" },
        );
    }

    async getLn2HistoryById(
        tankId: number | string,
        limit = 30,
    ): Promise<{
        tank_code: string;
        tank_id: number;
        history: Array<{
            tank_code?: string;
            tank_id?: number;
            device_id?: string;
            timestamp: string;
            evaporation_rate_kg_per_h: number | null;
            ln2_mass_kg: number | null;
            ln2_level?: number | null;
            ln2_level_pct?: number | null;
            ln2_evaporation_rate?: number | null;
            raw_weight_kg?: number | null;
        }>;
    }> {
        return await this.request(
            `/api/ivf/quality/tanks/by-id/${tankId}/ln2-history?limit=${limit}`,
            { method: "GET" },
        );
    }

    /**
     * Get quality tracking history for a tank (temp_internal, temp_external, shock).
     * Used for initial load in Quality Tracking chart before WebSocket connects.
     */
    async getQualityHistory(
        tankCode: string,
        limit = 30,
    ): Promise<{
        tank_code: string;
        tank_id: number;
        history: Array<{
            tank_code?: string;
            tank_id?: number;
            timestamp: string;
            temp_internal: number;
            temp_external: number | null;
            shock: number;
            battery_percentage?: number;
        }>;
    }> {
        return await this.request(
            `/api/ivf/quality/tanks/${encodeURIComponent(tankCode)}/history?limit=${limit}`,
            { method: "GET" },
        );
    }

    /**
     * Get tank KPI limits config for visualization (min/max, ln2 l1/l2/critical, units).
     * Use for reference lines and thresholds; readings come from WebSocket / kpi-history.
     */
    async getTankKpiConfig(tankId: string | number): Promise<{
        tank_id: number;
        tank_code: string;
        branch_id?: number | null;
        branch_name?: string | null;
        tank_max_capacity_reading?: number | null;
        tank_min_capacity_reading?: number | null;
        kpi_limits: Record<
            string,
            {
                min?: number;
                max?: number;
                unit?: string;
                l1?: { min?: number; description?: string };
                l2?: { min?: number; max?: number; alert_type?: string };
                critical?: { max?: number; alert_type?: string };
            }
        >;
    }> {
        return await this.request(
            `/api/ivf/quality/tanks/${encodeURIComponent(tankId)}/kpi-config`,
            { method: "GET" },
        );
    }

    /**
     * Get tank KPI history for Quality Tracking tabbed graph (temp_external, temp_internal, ln2_level, etc.).
        * No limit param; backend uses duration_minutes only (10=10M, 60=1H, 1440=24H, 10080=7D with 6h buckets). Omit for LIVE.
     */
    async getKpiHistory(
        tankId: string | number,
        durationMinutes?: number,
    ): Promise<{
        tank_code: string;
        tank_id: number;
        kpi_series: Record<
            string,
            Array<{
                timestamp: string;
                value: number;
                avg?: number;
                min?: number;
                max?: number;
                count?: number;
                unit: string;
            }>
        >;
    }> {
        const params = new URLSearchParams();
        if (durationMinutes != null && durationMinutes > 0) {
            params.set("duration_minutes", String(durationMinutes));
        }
        const qs = params.toString();
        return await this.request(
            `/api/ivf/quality/tanks/${encodeURIComponent(tankId)}/kpi-history${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
    }

    /**
     * Get KPI history from a specific IST date to now.
     * Date is YYYY-MM-DD (IST); backend converts IST midnight → UTC for the DB query.
     */
    async getKpiHistoryByDate(
        tankId: string | number,
        date: string,
    ): Promise<{
        tank_code: string;
        tank_id: number;
        kpi_series: Record<
            string,
            Array<{
                timestamp: string;
                value: number;
                avg?: number;
                min?: number;
                max?: number;
                count?: number;
                unit: string;
            }>
        >;
    }> {
        return await this.request(
            `/api/ivf/quality/tanks/${encodeURIComponent(tankId)}/kpi-history-date?date=${encodeURIComponent(date)}`,
            { method: "GET" },
        );
    }

    /** KPI config list for Alert Setting (Manager/Admin). Returns raw rows for selected tank. */
    async getKpiConfigList(id: number, type: "tank" | "incubator" = "tank"): Promise<{
        tank_id?: number;
        incubator_id?: number;
        tank_code?: string;
        incubator_code?: string;
        branch_id: number;
        hospital_id: number | null;
        config: Array<KpiConfigRow>;
    }> {
        const param = type === "incubator" ? `incubator_id=${encodeURIComponent(id)}` : `tank_id=${encodeURIComponent(id)}`;
        return await this.request(
            `/api/ivf/quality/kpi-config/list?${param}`,
            { method: "GET" },
        );
    }

    async getHospitalNotificationSettings(): Promise<HospitalNotificationSettings> {
        return await this.request("/api/ivf/quality/hospital-notification-settings", {
            method: "GET",
        });
    }

    async updateHospitalNotificationSettings(payload: {
        is_email_notifify: boolean;
        is_whatsapp_notify: boolean;
    }): Promise<HospitalNotificationSettings> {
        return await this.request("/api/ivf/quality/hospital-notification-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }

    async createKpiConfig(payload: KpiConfigPayload): Promise<KpiConfigRow> {
        return await this.request("/api/ivf/quality/kpi-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }

    async updateKpiConfig(
        configId: number,
        payload: Partial<KpiConfigPayload>,
    ): Promise<KpiConfigRow> {
        return await this.request(`/api/ivf/quality/kpi-config/${configId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }

    async deleteKpiConfig(
        configId: number,
    ): Promise<{ deleted: boolean; id: number }> {
        return await this.request(`/api/ivf/quality/kpi-config/${configId}`, {
            method: "DELETE",
        });
    }

    /** Bulk upsert KPI config to multiple tanks. For each tank, update existing rows (by kpi_name + alert_name) or create. */
    async bulkUpsertKpiConfig(
        tankIds: number[],
        configs: Array<{
            kpi_name: string;
            alert_name?: string | null;
            min?: number | null;
            max?: number | null;
            unit?: string | null;
            alert_type?: string | null;
            cooldown_minutes?: number;
            unack_escalation_threshold?: number | null;
            status?: boolean;
        }>,
    ): Promise<{ updated: number; created: number }> {
        return await this.request("/api/ivf/quality/kpi-config/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tank_ids: tankIds, configs }),
        });
    }

    async checkTankInTransitStatus(
        tankCode?: string | number,
        branchId?: number | null,
        hisNumber?: string | null,
        cryolockNumber?: string | null,
    ): Promise<TankInTransitCheckResponse> {
        // Use the new endpoint for HIS/Cryolock number lookup
        if (hisNumber || cryolockNumber) {
            const params = new URLSearchParams();
            if (hisNumber) {
                params.append("his_number", hisNumber);
            }
            if (cryolockNumber) {
                params.append("cryolock_number", cryolockNumber);
            }
            if (branchId != null) {
                params.append("branch_id", branchId.toString());
            }
            const queryString = params.toString();
            const url = `/api/ivf/canisters/in-transit-check?${queryString}`;
            return await this.request<TankInTransitCheckResponse>(url, {
                method: "GET",
            });
        }

        // Fallback to old endpoint for tank code (backward compatibility)
        if (tankCode) {
            let url = `/api/ivf/canisters/${encodeURIComponent(tankCode)}/in-transit-check`;
            if (branchId != null) {
                const sep = url.includes("?") ? "&" : "?";
                url = `${url}${sep}branch_id=${encodeURIComponent(branchId)}`;
            }
            return await this.request<TankInTransitCheckResponse>(url, {
                method: "GET",
            });
        }

        throw new Error(
            "Either tankCode or (hisNumber/cryolockNumber) must be provided",
        );
    }

    /**
     * Get filter options and counts. Pass currentFilterValues to get counts conditioned on
     * already-selected filters (e.g. status counts within selected site).
     */
    async getEmbryoTrackingFilters(currentFilterValues?: {
        siteName?: string;
        status?: string;
        gobletColor?: string;
        cryolockColor?: string;
    }): Promise<EmbryoTrackingFiltersResponse> {
        const params = new URLSearchParams();
        if (
            currentFilterValues?.siteName &&
            currentFilterValues.siteName !== "all"
        ) {
            params.append("branch_name", currentFilterValues.siteName);
        }
        if (
            currentFilterValues?.status &&
            currentFilterValues.status !== "all"
        ) {
            params.append("status", currentFilterValues.status);
        }
        if (
            currentFilterValues?.gobletColor &&
            currentFilterValues.gobletColor !== "all"
        ) {
            params.append("goblet_color", currentFilterValues.gobletColor);
        }
        if (
            currentFilterValues?.cryolockColor &&
            currentFilterValues.cryolockColor !== "all"
        ) {
            params.append("crylock_color", currentFilterValues.cryolockColor);
        }
        const queryString = params.toString();
        const url = queryString
            ? `/api/ivf/embryo_tracking/filters?${queryString}`
            : "/api/ivf/embryo_tracking/filters";
        return await this.request<EmbryoTrackingFiltersResponse>(url, {
            method: "GET",
        });
    }

    async getEmbryoTracking(
        offset: number = 0,
        limit: number = 50,
        filters?: EmbryoTrackingFilters,
    ): Promise<EmbryoTrackingApiResponse> {
        const params = new URLSearchParams();
        if (offset > 0) params.append("offset", offset.toString());
        if (limit !== 50) params.append("limit", limit.toString());
        if (filters?.branch_name)
            params.append("branch_name", filters.branch_name);
        if (filters?.status) params.append("status", filters.status);
        if (filters?.cryolock_color)
            params.append("cryolock_color", filters.cryolock_color);
        if (filters?.goblet_color)
            params.append("goblet_color", filters.goblet_color);
        const queryString = params.toString();
        const url = queryString
            ? `/api/ivf/embryo_tracking?${queryString}`
            : "/api/ivf/embryo_tracking";

        const response = await this.request<RawEmbryoTrackingApiResponse>(url, {
            method: "GET",
        });
        return {
            data: response.data.map(mapApiItemToTreatment),
            total: response.total,
            offset: response.offset,
            limit: response.limit,
            has_more: response.has_more,
            next_offset: response.next_offset,
            message: response.message,
        };
    }

    async getTotalEmbryosCryolocks(): Promise<TotalEmbryosCryolocksResponse> {
        return await this.request<TotalEmbryosCryolocksResponse>(
            "/api/ivf/dashboard/metrics/total-embryos-cryolocks",
            { method: "GET" },
        );
    }

    async getTotalContainers(): Promise<TotalContainersResponse> {
        return await this.request<TotalContainersResponse>(
            "/api/ivf/dashboard/metrics/total-containers",
            { method: "GET" },
        );
    }

    async getQualityDeviationsFlagged(): Promise<QualityDeviationsFlaggedResponse> {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        return await this.request<QualityDeviationsFlaggedResponse>(
            `/api/ivf/dashboard/metrics/total-deviations?from_ts=${from}&to_ts=${to}`,
            { method: "GET" },
        );
    }

    async getTopDeviationDriver(): Promise<TopDeviationDriverResponse> {
        return await this.request<TopDeviationDriverResponse>(
            "/api/ivf/dashboard/metrics/top-deviation-driver",
            { method: "GET" },
        );
    }

    async getOutboundShipments(): Promise<OutboundShipmentsResponse> {
        return await this.request<OutboundShipmentsResponse>(
            "/api/ivf/dashboard/metrics/outbound-shipments",
            { method: "GET" },
        );
    }

    async getAvgQualityLossPerContainer(): Promise<AvgQualityLossPerContainerResponse> {
        return await this.request<AvgQualityLossPerContainerResponse>(
            "/api/ivf/dashboard/metrics/avg-quality-loss-per-container",
            { method: "GET" },
        );
    }

    async getTotalDeviations(): Promise<TotalDeviationsResponse> {
        return await this.request<TotalDeviationsResponse>(
            "/api/ivf/dashboard/metrics/total-deviations",
            { method: "GET" },
        );
    }

    async getIncubatorDeviations(): Promise<TotalDeviationsResponse> {
        return await this.request<TotalDeviationsResponse>(
            "/api/ivf/incubator/metrics/deviations",
            { method: "GET" },
        );
    }

    async getDeviationsGraph(): Promise<DeviationsGraphResponse> {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        const raw = await this.request<DeviationsGraphResponse>(
            `/api/ivf/dashboard/metrics/deviations-graph?from_ts=${from}&to_ts=${to}`,
            { method: "GET" },
        );
        // Some environments return an array like: [{ view_level, data, ... }]
        // Normalize to a single object for consistent UI consumption.
        if (Array.isArray(raw)) {
            return raw;
        }
        return raw;
    }

    async getCanisterTrackingDetails(
        tank_code: string | number,
    ): Promise<EmbryoTrackingApiResponse & { available_slots: number }> {
        const response = await this.request<RawCanisterTrackingApiResponse>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/tracking-details`,
            ),
            { method: "GET" },
        );
        return {
            data: response.data.map(mapCanisterTrackingItemToTreatment),
            total: response.total,
            available_slots: response.available_slots,
        };
    }

    async getCanisterRefillLogs(
        tank_code: string | number,
    ): Promise<RefillLogsResponse> {
        return await this.request<RefillLogsResponse>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/refill-logs`,
            ),
            { method: "GET" },
        );
    }

    /**
     * Update goblet color for a specific cryolock within a tank
     * @param tank_code - The tank code (e.g., "T1", "T10")
     * @param cryolockNumber - The cryolock number string (e.g., "CAN-EGM-001-01"), NOT an ID
     * @param gobletColor - The goblet color value to set (e.g., "Yellow", "Red", "Blue")
     */
    async updateGobletColor(
        tank_code: string | number,
        cryolockNumber: string,
        gobletColor: string,
    ): Promise<{ success: boolean; message: string; updated_color: string }> {
        return await this.patch<{
            success: boolean;
            message: string;
            updated_color: string;
        }>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/goblet-color`,
            ),
            {
                cryolock_number: cryolockNumber, // Cryolock number string (e.g., "CAN-EGM-001-01"), NOT an ID
                goblet_color: gobletColor,
            },
        );
    }

    /**
     * Update cryolock color for a specific cryolock within a tank
     * @param tank_code - The tank code (e.g., "T1", "T10")
     * @param cryolockNumber - The cryolock number string (e.g., "CAN-EGM-001-01"), NOT an ID
     * @param cryolockColor - The cryolock color value to set (e.g., "Yellow", "Red", "Blue")
     */
    async updateCryolockColor(
        tank_code: string | number,
        cryolockNumber: string,
        cryolockColor: string,
    ): Promise<{ success: boolean; message: string; updated_color: string }> {
        return await this.patch<{
            success: boolean;
            message: string;
            updated_color: string;
        }>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/cryolock-color`,
            ),
            {
                cryolock_number: cryolockNumber, // Cryolock number string (e.g., "CAN-EGM-001-01"), NOT an ID
                cryolock_color: cryolockColor,
            },
        );
    }

  /**
   * Update refill log status for a specific log
   * @param tank_code - The tank code (e.g., "T1", "T10")
   * @param logId - The refill log ID
   * @param status - The status value to set (e.g., "Done", "In progress", "Not started")
   */
  async updateRefillLogStatus(
    tank_code: string | number,
    logId: number,
    status: string
  ): Promise<RefillLogItem> {
    return await this.patch<RefillLogItem>(
      this.withBranchId(`/api/quality-tracking/tanks/${tank_code}/refill-logs/${logId}/status`),
      {
        status: status,
      }
    );
  }

  /**
   * Update multiple fields of a refill log entry (status, reservoir, LN2 dates).
   * @param tank_code - The tank code
   * @param logId - The refill log ID
   * @param data - Fields to update
   */
  async updateRefillLog(
    tank_code: string | number,
    logId: number,
    data: {
      status?: string;
      reservoir?: string | null;
      ln2_ordered_date?: string | null;
      ln2_received_date?: string | null;
    }
  ): Promise<RefillLogItem> {
    return await this.patch<RefillLogItem>(
      this.withBranchId(`/api/quality-tracking/tanks/${tank_code}/refill-logs/${logId}`),
      data
    );
  }

    /**
     * Create a new refill log for a tank
     * @param tank_code - The tank code (e.g., "T1", "T10")
     * @param refillLogData - The refill log data
     */
    async createRefillLog(
        tank_code: string | number,
        refillLogData: {
            refill_date: string;
            refill_time: string;
            refilled_by: string;
            description: string;
            status: string;
            cryoshipper?: string | null;
            disinfected_shipper_infected_tank_description?: string | null;
            reservoir?: string | null;
            ln2_ordered_date?: string | null;
            ln2_received_date?: string | null;
        },
    ): Promise<RefillLogItem> {
        return await this.post<RefillLogItem>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/refill-logs`,
            ),
            refillLogData,
        );
    }

    /**
     * Mark container as moved to embryo transfer
     * @param tank_code - The tank code (e.g., "T1", "T10")
     * @param cryolockNumber - The cryolock number string (e.g., "CAN-EGM-001-01")
     * @returns Promise with success status and response data
     */
    async markEmbryoTransfer(
        tank_code: string | number,
        cryolockNumber: string,
    ): Promise<{
        success: boolean;
        message: string;
        cryolock_number: string;
        embryo_transfer: boolean;
        in_transit: boolean;
    }> {
        return await this.patch<{
            success: boolean;
            message: string;
            cryolock_number: string;
            embryo_transfer: boolean;
            in_transit: boolean;
        }>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/embryo-transfer`,
            ),
            {
                cryolock_number: cryolockNumber,
            },
        );
    }

    /**
     * Mark container as in transit with shipment
     * @param tank_code - The tank code (e.g., "T1", "T10")
     * @param cryolockNumber - The cryolock number string (e.g., "CAN-EGM-001-01")
     * @param description - Description of the move (e.g., "From Egmore to ptc, Device ID : XXXXXX")
     * @returns Promise with success status and response data
     */
    async markInTransitWithShipment(
        tank_code: string | number,
        cryolockNumber: string,
        description: string,
    ): Promise<{
        success: boolean;
        message: string;
        cryolock_number: string;
        in_transit: boolean;
        shipment?: Record<string, any>;
    }> {
        return await this.patch<{
            success: boolean;
            message: string;
            cryolock_number: string;
            in_transit: boolean;
            shipment?: Record<string, any>;
        }>(
            this.withBranchId(
                `/api/quality-tracking/tanks/${tank_code}/in-transit-with-shipment`,
            ),
            {
                cryolock_number: cryolockNumber,
                description: description,
            },
        );
    }

    /**
     * Export combined refill logs and KPI threshold deviations to Excel
     * @param tank_code - The tank code (e.g., "T1", "T10")
     * @param year - Year for the report (e.g., 2024). Optional - defaults to current year.
     * @param month - Month for the report (1-12). Optional - if not provided, exports entire year.
     * @returns Promise that resolves when download is triggered
     */
    async exportCombinedReportExcel(
        tank_code: string | number,
        year?: number,
        month?: number,
    ): Promise<void> {
        const url = `${this.getBaseUrl()}/api/quality-tracking/tanks/${tank_code}/readings-deviations/export-excel`;
        const params = new URLSearchParams();
        const branchId = this.getEffectiveBranchId();
        if (branchId) {
            params.append(IvfService.BRANCH_OVERRIDE_PARAM, branchId);
        }
        if (year !== undefined) {
            params.append("year", year.toString());
        }
        if (month !== undefined) {
            params.append("month", month.toString());
        }
        const queryString = params.toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;

        const token = authUtils.getToken();
        if (!token) {
            throw new Error("Authentication token not found");
        }

        const response = await fetch(fullUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Export failed: ${response.status} ${response.statusText}`;
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.message) {
                    errorMessage = errorData.message;
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        // Get the blob from the response
        const blob = await response.blob();

        // Get filename from Content-Disposition header or use a default
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = `combined_report_${tank_code}_${year || new Date().getFullYear()}${month ? `_${month}` : ""}.xlsx`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(
                /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
            );
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1].replace(/['"]/g, "");
            }
        }

        // Create a download link and trigger it
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    }

    async getAllTanksRefillLogs(tankIds: number[]): Promise<{
        logs: Array<{
            tank_id: number;
            tank_code: string | null;
            branch_name: string | null;
            refill_date: string | null;
            refill_time: string | null;
            refilled_by: string | null;
            description: string | null;
            status: string | null;
            refill_weight: number | null;
        }>;
    }> {
        return await this.request(
            `/api/quality-tracking/tanks/all-refill-logs?tank_ids=${tankIds.join(",")}`,
            { method: "GET" },
        );
    }

    async getTanksRefillSummary(tankIds: number[]): Promise<{
        summary: Record<string, {
            last_refill_date?: string | null;
            last_refill_time?: string | null;
            last_refilled_by?: string | null;
            last_description?: string | null;
            ln2_mass_kg?: number | null;
            ln2_config_min?: number | null;
            tank_max_capacity?: number | null;
            tank_min_capacity?: number | null;
        }>;
    }> {
        return await this.request(
            `/api/quality-tracking/tanks/refill-summary?tank_ids=${tankIds.join(",")}`,
            { method: "GET" },
        );
    }

    async getPendingRefillDetections(): Promise<{
        detections: Array<{
            id: number;
            tank_id: number;
            tank_code: string | null;
            branch_name: string | null;
            detected_at: string | null;
            refill_weight: number | null;
        }>;
    }> {
        return await this.request("/api/quality-tracking/refill-detections/pending", {
            method: "GET",
        });
    }

    async reviewRefillDetection(
        detectionId: number,
        isConfirmed: boolean,
        notes?: string,
    ): Promise<{ success: boolean; detection_id: number; is_confirmed: boolean }> {
        return await this.request(
            `/api/quality-tracking/refill-detections/${detectionId}/review`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_confirmed: isConfirmed, notes }),
            },
        );
    }
}

export const ivfService = new IvfService();
