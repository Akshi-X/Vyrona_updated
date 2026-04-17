import { BaseApiService } from "./baseApiService";

export interface ActivityLogRecord {
    id: number;
    action: string;
    outcome: string;
    actor_type: string;
    actor_id?: string | null;
    actor_label?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    target_label?: string | null;
    metadata?: Record<string, any> | null;
    created_at: string;
    actor_details?: Record<string, any> | null;
    target_details?: Record<string, any> | null;
}

export interface ActivityLogResponse {
    logs: ActivityLogRecord[];
    total_count: number;
    page: number;
    page_size: number;
    status: string;
}

export class ActivityLogService extends BaseApiService {
    async getActivityLogs(options: {
        action_prefix?: string;
        action?: string;
        actor_type?: string;
        actor_id?: string;
        target_type?: string;
        target_id?: string;
        outcome?: string;
        metadata_key?: string;
        metadata_value?: string;
        date_from?: string;
        date_to?: string;
        page?: number;
        page_size?: number;
    }): Promise<ActivityLogResponse> {
        const params = new URLSearchParams();
        if (options.action_prefix) params.append("action_prefix", options.action_prefix);
        if (options.action) params.append("action", options.action);
        if (options.actor_type) params.append("actor_type", options.actor_type);
        if (options.actor_id) params.append("actor_id", options.actor_id);
        if (options.target_type) params.append("target_type", options.target_type);
        if (options.target_id) params.append("target_id", options.target_id);
        if (options.outcome) params.append("outcome", options.outcome);
        if (options.metadata_key) params.append("metadata_key", options.metadata_key);
        if (options.metadata_value) params.append("metadata_value", options.metadata_value);
        if (options.date_from) params.append("date_from", options.date_from);
        if (options.date_to) params.append("date_to", options.date_to);
        if (options.page) params.append("page", options.page.toString());
        if (options.page_size) params.append("page_size", options.page_size.toString());

        const query = params.toString();
        const endpoint = query
            ? `/api/activity-logs?${query}`
            : "/api/activity-logs";
        return await this.request<ActivityLogResponse>(endpoint, { method: "GET" });
    }
}

export const activityLogService = new ActivityLogService();
