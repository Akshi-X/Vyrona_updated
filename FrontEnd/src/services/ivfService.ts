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
    whatsapp_alert: boolean;
    email_alert: boolean;
    status: boolean;
}

/** Payload for create/update KPI config. */
export interface KpiConfigPayload {
    hospital_id: number;
    branch_id: number;
    tank_id?: number | null;
    incubator_id?: number | null;
    chamber_id?: string | null;
    refrigerator_id?: number | null;
    kpi_name: string;
    alert_name?: string | null;
    min?: number | null;
    max?: number | null;
    unit?: string | null;
    alert_type?: string | null;
    cooldown_minutes?: number;
    unack_escalation_threshold?: number | null;
    whatsapp_alert?: boolean;
    email_alert?: boolean;
    status?: boolean;
}

export interface HospitalNotificationSettings {
    hospital_id: number;
    is_push_notify: boolean;
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

    async getActiveIncubators(branchName?: string): Promise<{
        branches: Array<{
            branch_id: number;
            branch_name: string;
            incubators: Array<{
                incubator_id: number;
                incubator_code?: string | null;
                external_id?: string | null;
                type?: string | null;
                chamber_r?: number | null;
                chamber_c?: number | null;
                updated_at?: string | null;
            }>;
        }>;
        total: number;
    }> {
        const params = new URLSearchParams();
        if (branchName) params.set("branch_name", branchName);
        const qs = params.toString();
        const endpoint = `/api/ivf/control_tower/active_incubators${qs ? `?${qs}` : ""}`;
        return await this.request(endpoint, { method: "GET" });
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
        full_weight_kg?: number | null;
        empty_weight_kg?: number | null;
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
        > & { lid_open_periods?: Array<{ start: string; stop: string; alert_count?: number }> };
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
        > & { lid_open_periods?: Array<{ start: string; stop: string; alert_count?: number }> };
    }> {
        return await this.request(
            `/api/ivf/quality/tanks/${encodeURIComponent(tankId)}/kpi-history-date?date=${encodeURIComponent(date)}`,
            { method: "GET" },
        );
    }

    /** Get KPI limits config for an incubator chamber (for threshold lines on the chart).
     * chamberId===null means the Common scope (chamber_id IS NULL) and is sent as the
     * literal string "null"; chamberId===undefined omits the param entirely. */
    async getIncubatorKpiConfig(incubatorId: number, chamberId?: string | null): Promise<{
        incubator_id: number;
        incubator_code: string;
        chamber_id?: string | null;
        branch_id?: number | null;
        branch_name?: string | null;
        kpi_limits: Record<string, Record<string, { min?: number | null; max?: number | null; alert_type?: string | null }>>;
    }> {
        const params = new URLSearchParams();
        if (chamberId === null) params.set("chamber_id", "null");
        else if (chamberId !== undefined) params.set("chamber_id", chamberId);
        const qs = params.toString();
        return await this.request(
            `/api/ivf/quality/incubators/${encodeURIComponent(incubatorId)}/kpi-config${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
    }

    /** Get incubator KPI history for Quality Tracking chart. Same duration_minutes semantics as tank endpoint. */
    async getIncubatorKpiHistory(
        incubatorId: number,
        chamberId?: string | null,
        durationMinutes?: number,
    ): Promise<{
        incubator_id: number;
        incubator_code: string;
        chamber_id: string;
        kpi_series: Record<string, Array<{
            timestamp: string;
            value: number;
            avg?: number;
            min?: number;
            max?: number;
            count?: number;
            unit: string;
        }>>;
    }> {
        const params = new URLSearchParams();
        if (chamberId === null) params.set("chamber_id", "null");
        else if (chamberId !== undefined) params.set("chamber_id", chamberId);
        if (durationMinutes != null && durationMinutes > 0) params.set("duration_minutes", String(durationMinutes));
        const qs = params.toString();
        return await this.request(
            `/api/ivf/quality/incubators/${encodeURIComponent(incubatorId)}/kpi-history${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
    }

    /** Get incubator KPI history from a specific IST date to now. */
    async getIncubatorKpiHistoryByDate(
        incubatorId: number,
        date: string,
        chamberId?: string | null,
    ): Promise<{
        incubator_id: number;
        incubator_code: string;
        chamber_id: string;
        kpi_series: Record<string, Array<{
            timestamp: string;
            value: number;
            avg?: number;
            min?: number;
            max?: number;
            count?: number;
            unit: string;
        }>>;
    }> {
        const params = new URLSearchParams();
        params.set("date", date);
        if (chamberId === null) params.set("chamber_id", "null");
        else if (chamberId !== undefined) params.set("chamber_id", chamberId);
        return await this.request(
            `/api/ivf/quality/incubators/${encodeURIComponent(incubatorId)}/kpi-history-date?${params.toString()}`,
            { method: "GET" },
        );
    }

    /** Latest single reading for incubator_temp, incubator_o2, incubator_co2 for a chamber. */
    async getChamberLatest(incubatorId: number, chamberId?: string): Promise<ChamberLatestItem[]> {
        const params = new URLSearchParams();
        if (chamberId != null) params.set("chamber_id", chamberId);
        const qs = params.toString();
        return this.request<ChamberLatestItem[]>(
            `/api/ivf/quality/incubators/${encodeURIComponent(incubatorId)}/chamber-latest${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
    }

    /** KPI config list for Alert Setting (Manager/Admin). Returns raw rows for selected tank/incubator/refrigerator. */
    async getKpiConfigList(
        id: number,
        type: "tank" | "incubator" | "refrigerator" = "tank",
        scopeId?: string | null,
    ): Promise<{
        tank_id?: number;
        incubator_id?: number;
        refrigerator_id?: number;
        tank_code?: string;
        incubator_code?: string;
        refrigerator_code?: string;
        branch_id: number;
        hospital_id: number | null;
        empty_weight_kg?: number | null;
        full_weight_kg?: number | null;
        config: Array<KpiConfigRow>;
    }> {
        let param: string;
        if (type === "incubator") {
            param = `incubator_id=${encodeURIComponent(id)}`;
            if (scopeId) {
                param += `&chamber_id=${encodeURIComponent(scopeId)}`;
            } else if (scopeId === null) {
                param += `&chamber_id=null`;
            }
        } else if (type === "refrigerator") {
            param = `refrigerator_id=${encodeURIComponent(id)}`;
            if (scopeId) {
                param += `&zone_id=${encodeURIComponent(scopeId)}`;
            } else if (scopeId === null) {
                param += `&zone_id=null`;
            }
        } else {
            param = `tank_id=${encodeURIComponent(id)}`;
        }
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
        is_push_notify: boolean;
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
            whatsapp_alert?: boolean;
            email_alert?: boolean;
            status?: boolean;
        }>,
    ): Promise<{ updated: number; created: number }> {
        return await this.request("/api/ivf/quality/kpi-config/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tank_ids: tankIds, configs }),
        });
    }

    async bulkUpsertKpiConfigForIncubator(
        incubatorId: number,
        chamberId: string | null,
        configs: Array<{
            kpi_name: string;
            alert_name?: string | null;
            min?: number | null;
            max?: number | null;
            unit?: string | null;
            alert_type?: string | null;
            cooldown_minutes?: number;
            unack_escalation_threshold?: number | null;
            whatsapp_alert?: boolean;
            email_alert?: boolean;
            status?: boolean;
        }>,
    ): Promise<{ updated: number; created: number }> {
        return await this.request("/api/ivf/quality/kpi-config/bulk-incubator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ incubator_id: incubatorId, chamber_id: chamberId, configs }),
        });
    }

    async bulkUpsertKpiConfigForRefrigerator(
        refrigeratorId: number,
        zoneId: string | null,
        configs: Array<{
            kpi_name: string;
            alert_name?: string | null;
            min?: number | null;
            max?: number | null;
            unit?: string | null;
            alert_type?: string | null;
            cooldown_minutes?: number;
            unack_escalation_threshold?: number | null;
            whatsapp_alert?: boolean;
            email_alert?: boolean;
            status?: boolean;
        }>,
        zoneName?: string | null,
    ): Promise<{ updated: number; created: number }> {
        return await this.request("/api/ivf/quality/kpi-config/bulk-refrigerator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refrigerator_id: refrigeratorId, zone_id: zoneId, zone_name: zoneName ?? null, configs }),
        });
    }

    /** Get named zones defined for a refrigerator (derived from kpi_config). */
    async getRefrigeratorZones(refrigeratorId: number): Promise<Array<{ zone_id: string; zone_name: string }>> {
        return this.request(
            `/api/ivf/quality/refrigerators/${encodeURIComponent(refrigeratorId)}/zones`,
            { method: "GET" },
        );
    }

    /** Get KPI limits config for a refrigerator zone (for threshold lines on the chart). */
    async getRefrigeratorKpiConfig(refrigeratorId: number, zoneId?: string): Promise<{
        refrigerator_id: number;
        refrigerator_code: string;
        zone_id?: string | null;
        branch_id?: number | null;
        branch_name?: string | null;
        kpi_limits: Record<string, Record<string, { min?: number | null; max?: number | null; alert_type?: string | null }>>;
    }> {
        const params = new URLSearchParams();
        if (zoneId != null) params.set("zone_id", zoneId);
        const qs = params.toString();
        return await this.request(
            `/api/ivf/quality/refrigerators/${encodeURIComponent(refrigeratorId)}/kpi-config${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
    }

    async getRefrigeratorKpiHistory(
        refrigeratorId: number,
        durationMinutes?: number,
        zoneId?: string,
    ): Promise<{
        refrigerator_id: number;
        refrigerator_code: string;
        zone_id?: string | null;
        kpi_configs: Array<{
            id: number;
            kpi_name: string;
            alert_name: string | null;
            min: number | null;
            max: number | null;
            unit: string;
            zone_id: string | null;
            zone_name: string | null;
        }>;
        kpi_series: Record<string, Array<{
            timestamp: string;
            value: number;
            avg?: number;
            min?: number;
            max?: number;
            count?: number;
            unit: string;
        }>>;
    }> {
        const params = new URLSearchParams();
        if (durationMinutes != null && durationMinutes > 0) params.set("duration_minutes", String(durationMinutes));
        if (zoneId != null) params.set("zone_id", zoneId);
        const qs = params.toString();
        return await this.request(
            `/api/ivf/quality/refrigerators/${encodeURIComponent(refrigeratorId)}/kpi-history${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
    }

    /** Latest single reading per KPI for a refrigerator zone. */
    async getRefrigeratorZoneLatest(refrigeratorId: number, zoneId?: string): Promise<Array<{
        kpi_name: string;
        label: string;
        value: number | null;
        unit: string;
        zone_id?: string | null;
        timestamp?: string | null;
        min?: number | null;
        max?: number | null;
        within_threshold?: boolean;
    }>> {
        const params = new URLSearchParams();
        if (zoneId != null) params.set("zone_id", zoneId);
        const qs = params.toString();
        return this.request(
            `/api/ivf/quality/refrigerators/${encodeURIComponent(refrigeratorId)}/zone-latest${qs ? `?${qs}` : ""}`,
            { method: "GET" },
        );
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

    async getRefillLogPageData(): Promise<{
        tanks: Array<{
            tank_id: number;
            tank_code: string;
            branch_name: string;
            branch_id: number;
            last_refill_date: string | null;
            last_refill_time: string | null;
            last_refilled_by: string | null;
            last_description: string | null;
            kpi_config_id: number | null;
            kpi_status: boolean | null;
            ln2_mass_kg: number | null;
            ln2_config_min: number | null;
            tank_max_capacity: number | null;
            tank_min_capacity: number | null;
        }>;
        logs: Array<{
            tank_id: number;
            tank_code: string;
            branch_name: string;
            refill_date: string | null;
            refill_time: string | null;
            refilled_by: string | null;
            description: string | null;
            status: string | null;
            refill_weight: number | null;
        }>;
    }> {
        return await this.request("/api/quality-tracking/refill-log/page-data", {
            method: "GET",
        });
    }

    // ── IVF Cycles ────────────────────────────────────────────────────────────

    async listCycles(params?: { his_id?: string; status?: string; incubator_id?: number; chamber_position?: string; skip?: number; limit?: number }): Promise<IvfCycle[]> {
        const q = new URLSearchParams();
        if (params?.his_id) q.set('his_id', params.his_id);
        if (params?.status) q.set('status', params.status);
        if (params?.incubator_id != null) q.set('incubator_id', String(params.incubator_id));
        if (params?.chamber_position) q.set('chamber_position', params.chamber_position);
        if (params?.skip != null) q.set('skip', String(params.skip));
        if (params?.limit != null) q.set('limit', String(params.limit));
        const qs = q.toString();
        return this.request<IvfCycle[]>(`/api/ivf/cycles${qs ? `?${qs}` : ''}`, { method: 'GET' });
    }

    async getCycleWithLogs(cycleId: number): Promise<IvfCycleWithLogs> {
        return this.request<IvfCycleWithLogs>(`/api/ivf/cycles/${cycleId}`, { method: 'GET' });
    }

    async createCycle(data: IvfCycleCreate): Promise<IvfCycle> {
        return this.request<IvfCycle>('/api/ivf/cycles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    }

    async updateCycle(cycleId: number, data: Partial<IvfCycleCreate>): Promise<IvfCycle> {
        return this.request<IvfCycle>(`/api/ivf/cycles/${cycleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    }

    async listGrades(cycleId: number, logId: number): Promise<IvfGrade[]> {
        return this.request<IvfGrade[]>(`/api/ivf/cycles/${cycleId}/logs/${logId}/grades`);
    }

    async selectBestGrade(cycleId: number, logId: number, gradeId: number): Promise<IvfGrade> {
        return this.request<IvfGrade>(`/api/ivf/cycles/${cycleId}/logs/${logId}/grades/${gradeId}/select-best`, {
            method: 'POST',
        });
    }

    async updateGrade(cycleId: number, gradeId: number, data: Record<string, unknown>): Promise<IvfGrade> {
        return this.request<IvfGrade>(`/api/ivf/cycles/${cycleId}/grades/${gradeId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async createGrade(cycleId: number, logId: number, data: Record<string, unknown> = {}): Promise<IvfGrade> {
        return this.request<IvfGrade>(`/api/ivf/cycles/${cycleId}/logs/${logId}/grades`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * Create a grade and upload its source image in a single request.
     * Replaces createGrade + presign + direct blob PUT.
     */
    async createGradeWithImage(cycleId: number, logId: number, file: File, stage = 1): Promise<GradeUploadResult> {
        const form = new FormData();
        form.append('file', file);
        form.append('stage', String(stage));
        const res = await fetch(
            `${this.baseUrl}/api/ivf/cycles/${cycleId}/logs/${logId}/grades/upload`,
            { method: 'POST', headers: this.getAuthHeaders(), body: form },
        );
        if (!res.ok) throw new Error(`Failed to upload embryo image (${res.status})`);
        return res.json();
    }

    /** Read an ML job's SSE stream to its terminal event. */
    private async consumeMlStream(
        res: Response,
        label: string,
        onEvent?: (e: MlJobEvent) => void,
    ): Promise<MlJobEvent> {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // SSE frames are separated by a blank line; a frame may span reads.
                let sep: number;
                while ((sep = buffer.indexOf('\n\n')) !== -1) {
                    const frame = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);
                    const data = frame.split('\n')
                        .filter(l => l.startsWith('data:'))
                        .map(l => l.slice(5).trim())
                        .join('');
                    if (!data) continue;

                    let event: MlJobEvent;
                    try { event = JSON.parse(data); } catch { continue; }
                    onEvent?.(event);
                    if (event.status === 'failed') {
                        if (event.code === 'no_embryo') throw new MlNoEmbryoError(event.error, event.detection?.reasons);
                        throw new Error(event.error || `${label} job failed`);
                    }
                    if (event.status === 'complete') return event;
                }
            }
        } finally {
            reader.cancel().catch(() => { /* stream already closed */ });
        }
        throw new Error(`${label} stream ended before completion`);
    }

    /**
     * Trigger the ML analysis job (segmentation + grading, one model pass) and
     * consume its SSE progress stream.
     *
     * EventSource cannot set an Authorization header, so this reads the stream
     * with fetch. Resolves with the terminal event; rejects if the job fails.
     */
    async streamMlJob(
        imageId: string,
        onEvent?: (e: MlJobEvent) => void,
        signal?: AbortSignal,
    ): Promise<MlJobEvent> {
        const res = await fetch(
            `${this.baseUrl}/api/ivf/ml/analysis/stream?image_id=${encodeURIComponent(imageId)}`,
            { headers: { ...this.getAuthHeaders(), Accept: 'text/event-stream' }, signal },
        );
        if (!res.ok || !res.body) throw new Error(`Failed to start analysis job (${res.status})`);
        return this.consumeMlStream(res, 'analysis', onEvent);
    }

    /** Re-attach to a job already running on the server, without starting a new one. */
    async attachMlJob(
        jobId: number,
        onEvent?: (e: MlJobEvent) => void,
        signal?: AbortSignal,
    ): Promise<MlJobEvent> {
        const res = await fetch(
            `${this.baseUrl}/api/ivf/ml/jobs/${jobId}/stream`,
            { headers: { ...this.getAuthHeaders(), Accept: 'text/event-stream' }, signal },
        );
        if (res.status === 404) throw new MlJobGoneError(jobId);
        if (!res.ok || !res.body) throw new Error(`Failed to attach to ML job ${jobId} (${res.status})`);
        return this.consumeMlStream(res, `job ${jobId}`, onEvent);
    }

    async upsertLog(cycleId: number, data: IvfLogUpsert): Promise<IvfCycleLog> {
        return this.request<IvfCycleLog>(`/api/ivf/cycles/${cycleId}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    }

    async deleteLog(cycleId: number, logId: number): Promise<void> {
        return this.request<void>(`/api/ivf/cycles/${cycleId}/logs/${logId}`, { method: 'DELETE' });
    }

    /** Upload a generated report PDF and record it against the cycle. */
    async uploadCycleReport(cycleId: number, blob: Blob, fileName: string, reportType?: string): Promise<IvfCycleReport> {
        const form = new FormData();
        form.append('file', blob, fileName);
        if (reportType) form.append('report_type', reportType);
        const res = await fetch(
            `${this.baseUrl}/api/ivf/cycles/${cycleId}/reports`,
            { method: 'POST', headers: this.getAuthHeaders(), body: form },
        );
        if (!res.ok) throw new Error(`Failed to upload report (${res.status})`);
        return res.json();
    }

    async listCycleReports(cycleId: number): Promise<IvfCycleReport[]> {
        return this.request<IvfCycleReport[]>(`/api/ivf/cycles/${cycleId}/reports`);
    }

    async deleteCycleReport(cycleId: number, reportId: number): Promise<void> {
        return this.request<void>(`/api/ivf/cycles/${cycleId}/reports/${reportId}`, { method: 'DELETE' });
    }

    async getRefrigeratorDeviationsByCategory(fromTs: number, toTs: number): Promise<{
        total: number;
        categories: { kpi_name: string; label: string; count: number }[];
    }> {
        return this.request(`/api/ivf/refrigerator-dashboard/deviations-by-category?from_ts=${fromTs}&to_ts=${toTs}`);
    }

    async getRefrigeratorTopKpi(fromTs: number, toTs: number): Promise<{
        kpi_name: string | null;
        label: string;
        count: number;
    }> {
        return this.request(`/api/ivf/refrigerator-dashboard/top-kpi?from_ts=${fromTs}&to_ts=${toTs}`);
    }
}

// ── Chamber health ────────────────────────────────────────────────────────────

export interface ChamberLatestItem {
    kpi_name: string;
    label: string;
    value: number | null;
    unit: string;
}

// ── IVF Cycle types ───────────────────────────────────────────────────────────

export interface IvfCycle {
    cycle_id: number;
    hospital_id: number;
    branch_id: number | null;
    his_id: string;
    patient_name: string | null;
    incubator_id: number | null;
    chamber_position: string | null;
    injection_method: string | null;
    sperm_quality: string | null;
    oocyte_quality: string | null;
    cycle_type: string | null;
    oocyte_m2: number | null;
    oocyte_m1: number | null;
    oocyte_gv: number | null;
    oocyte_others: number | null;
    status: string | null;
    opu_date: string | null;
    created_at: string;
    updated_at: string | null;
}

export interface IvfCycleLog {
    log_id: number;
    cycle_id: number;
    oocyte_no: number;
    oocyte_comments: string | null;
    d0_maturity: string | null;
    d0_drop_no: string | null;
    d1_pn: string | null;
    d1_zygote_status: string | null;
    d3_drop_no: string | null;
    d3_grade: string | null;
    d3_symmetry: string | null;
    d5_stage: string | null;
    d6_stage: string | null;
    d6_progression: string | null;
    // The backend has one shared blast_grade column, not separate d5/d6 grade
    // columns — d5_stage/d6_stage === 'Blastocyst' says which day it belongs to.
    blast_grade: string | null;
    fate: string | null;
    freeze_no: string | null;
    meta: Record<string, string> | null;
    grade_count: number;
    created_at: string;
    updated_at: string | null;
}

export interface IvfImage {
    image_id: number;
    grade_id: number;
    cycle_id: number;
    day: number | null;
    upload_image_url: string;
    exp_img_url: string | null;
    te_img_url: string | null;
    icm_img_url: string | null;
    annotated_img_url: string | null;
    file_name: string | null;
    file_size: number | null;
    uploaded_by: string | null;
    created_at: string;
}

export interface IvfGrade {
    grade_id: number;
    log_id: number;
    cycle_id: number;
    stage: number | null;
    is_active: boolean;
    is_best: boolean;
    is_completed: boolean;
    grade: string | null;
    // Set once by the server the first time the AI writes a grade; never
    // overwritten afterward, even if `grade` is later overridden.
    ai_grade: string | null;
    ai_score: number | null;
    // {hatching, zona_pellucida, blastocoel, bridge, blackspot, early_blast}
    quality_flags: Record<string, string | null> | null;
    // Optional, per-flag free-text reason — independent of override_reason.
    quality_flag_reasons: Record<string, string | null> | null;
    // Set once by the server the first time a human overrides any quality flag;
    // snapshots what quality_flags was before that change, never touched again.
    ai_quality_flags: Record<string, string | null> | null;
    note: string | null;
    icm_inference: string | null;
    te_inference: string | null;
    exp_inference: string | null;
    override_reason: string | null;
    images: IvfImage[];
    graded_by: string | null;
    created_at: string;
    updated_at: string | null;
}

export interface IvfCycleWithLogs extends IvfCycle {
    logs: IvfCycleLog[];
}

/** A saved, stored PDF report for a cycle. */
export interface IvfCycleReport {
    report_id: number;
    cycle_id: number;
    report_type: string | null;
    file_url: string;
    file_name: string | null;
    file_size: number | null;
    generated_by: string | null;
    created_at: string;
}

/** Result of creating a grade and uploading its image in one request. */
export interface GradeUploadResult {
    grade_id: number;
    image_id: number;
    upload_image_url: string;
    file_name: string | null;
    file_size: number | null;
}

/** Why the detector turned an image down; present when `code` is 'no_embryo'. */
export interface MlDetectionReport {
    reasons: string[];
    metrics?: Record<string, number>;
}

/** One SSE frame from /api/ivf/ml/analysis/stream. */
export interface MlJobEvent {
    status: 'queued' | 'running' | 'complete' | 'failed';
    job_id?: number;
    kind?: 'analysis';
    progress?: number;
    output?: Record<string, string | number>;
    error?: string;
    code?: string;
    detection?: MlDetectionReport;
}

/** The job id we tried to re-attach to no longer exists server-side. */
export class MlJobGoneError extends Error {
    jobId: number;
    constructor(jobId: number) {
        super(`ML job ${jobId} no longer exists`);
        this.jobId = jobId;
        this.name = 'MlJobGoneError';
    }
}

/** The detector found nothing embryo-shaped in the image, so it was never graded. */
export class MlNoEmbryoError extends Error {
    reasons: string[];
    constructor(message?: string, reasons: string[] = []) {
        super(message || 'No embryo detected in this image');
        this.reasons = reasons;
        this.name = 'MlNoEmbryoError';
    }
}

/**
 * Analysis job output — segmentation overlays and the grade come from the
 * same model forward pass, so one job returns both.
 */
export interface MlAnalysisOutput {
    exp: string;
    icm: string;
    te: string;
    annotated: string;
    grade: string;
    ai_score: number;
    icm_inference: string;
    te_inference: string;
    exp_inference: string;
    hatching: string;
    zona_pellucida: string;
    blastocoel: string;
    prognosis?: string;
}

export interface IvfCycleCreate {
    his_id: string;
    patient_name?: string;
    branch_id?: number | null;
    incubator_id?: number | null;
    chamber_position?: string;
    injection_method?: string;
    sperm_quality?: string;
    oocyte_quality?: string;
    cycle_type?: string;
    oocyte_m2?: number;
    oocyte_m1?: number;
    oocyte_gv?: number;
    oocyte_others?: number;
    opu_date?: string;
    status?: string;
}

export interface IvfLogUpsert {
    oocyte_no: number;
    oocyte_comments?: string;
    d0_maturity?: string;
    d0_drop_no?: string;
    d1_pn?: string;
    d1_zygote_status?: string;
    d3_drop_no?: string;
    d3_grade?: string;
    d3_symmetry?: string;
    // null (not just omitted) explicitly clears the column server-side —
    // needed to enforce that only one of the two can be 'Blastocyst'.
    d5_stage?: string | null;
    d6_stage?: string | null;
    d6_progression?: string;
    blast_grade?: string;
    fate?: string;
    freeze_no?: string;
    meta?: Record<string, string>;
}

export const ivfService = new IvfService();
