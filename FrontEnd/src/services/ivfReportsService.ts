import { BaseApiService } from "./baseApiService";

export interface MonthlySummaryRow {
    kpi_name: string;
    alerts_sent: number;
    deviations_found: number;
}

export interface MonthlySummaryResponse {
    month: string;
    rows: MonthlySummaryRow[];
    total_kpis: number;
    total_count: number;
    page: number;
    page_size: number;
    status: string;
}

export interface CriticalAlertReportRow {
    alert_id: string;
    tank_id: number;
    tank_code?: string | null;
    branch_id: number;
    branch_name?: string | null;
    alert_type: string;
    source: string;
    severity: string;
    status: string;
    message: string;
    triggered_by: string;
    occurred_at: string;
    acknowledged_by?: string | null;
    acknowledged_at?: string | null;
    created_at: string;
}

export interface CriticalAlertReportResponse {
    alerts: CriticalAlertReportRow[];
    total_count: number;
    page: number;
    page_size: number;
    status: string;
}

export interface RefillLogReportRow {
    log_id: number;
    tank_id: number;
    tank_code?: string | null;
    branch_id?: number | null;
    branch_name?: string | null;
    refill_date?: string | null;
    refill_time?: string | null;
    refilled_by?: string | null;
    description?: string | null;
    status?: string | null;
    reservoir?: string | null;
    ln2_ordered_date?: string | null;
    ln2_received_date?: string | null;
    created_at: string;
}

export interface RefillLogReportResponse {
    logs: RefillLogReportRow[];
    total_count: number;
    page: number;
    page_size: number;
    status: string;
}

export class IvfReportsService extends BaseApiService {
    async getMonthlySummary(options: {
        month?: string;
        page?: number;
        page_size?: number;
    }): Promise<MonthlySummaryResponse> {
        const params = new URLSearchParams();
        if (options.month) {
            params.append("month", options.month);
        }
        if (options.page) {
            params.append("page", options.page.toString());
        }
        if (options.page_size) {
            params.append("page_size", options.page_size.toString());
        }
        const query = params.toString();
        const endpoint = query
            ? `/api/ivf/reports/monthly-summary?${query}`
            : "/api/ivf/reports/monthly-summary";
        return await this.request<MonthlySummaryResponse>(endpoint, {
            method: "GET",
        });
    }

    async getCriticalAlertsReport(options: {
        start_date?: string;
        end_date?: string;
        status?: string;
        severity?: string;
        tank_codes?: string[];
        page?: number;
        page_size?: number;
    }): Promise<CriticalAlertReportResponse> {
        const params = new URLSearchParams();
        if (options.start_date) {
            params.append("start_date", options.start_date);
        }
        if (options.end_date) {
            params.append("end_date", options.end_date);
        }
        if (options.status) {
            params.append("status", options.status);
        }
        if (options.severity) {
            params.append("severity", options.severity);
        }
        if (options.tank_codes && options.tank_codes.length > 0) {
            options.tank_codes.forEach((code) => {
                if (code) {
                    params.append("tank_codes", code);
                }
            });
        }
        if (options.page) {
            params.append("page", options.page.toString());
        }
        if (options.page_size) {
            params.append("page_size", options.page_size.toString());
        }
        const query = params.toString();
        const endpoint = query
            ? `/api/ivf/reports/critical-alerts?${query}`
            : "/api/ivf/reports/critical-alerts";
        return await this.request<CriticalAlertReportResponse>(endpoint, {
            method: "GET",
        });
    }

    async getRefillLogsReport(options: {
        start_date?: string;
        end_date?: string;
        status?: string;
        tank_codes?: string[];
        page?: number;
        page_size?: number;
    }): Promise<RefillLogReportResponse> {
        const params = new URLSearchParams();
        if (options.start_date) {
            params.append("start_date", options.start_date);
        }
        if (options.end_date) {
            params.append("end_date", options.end_date);
        }
        if (options.status) {
            params.append("status", options.status);
        }
        if (options.tank_codes && options.tank_codes.length > 0) {
            options.tank_codes.forEach((code) => {
                if (code) {
                    params.append("tank_codes", code);
                }
            });
        }
        if (options.page) {
            params.append("page", options.page.toString());
        }
        if (options.page_size) {
            params.append("page_size", options.page_size.toString());
        }
        const query = params.toString();
        const endpoint = query
            ? `/api/ivf/reports/refill-logs?${query}`
            : "/api/ivf/reports/refill-logs";
        return await this.request<RefillLogReportResponse>(endpoint, {
            method: "GET",
        });
    }
}

export const ivfReportsService = new IvfReportsService();
