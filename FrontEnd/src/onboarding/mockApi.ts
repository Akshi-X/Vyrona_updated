import { BaseApiService } from "../services/baseApiService";
import { userService } from "../services/userService";
import dashboardData from "./mocks/dashboard-data.json";
import controlTowerData from "./mocks/control-tower-data.json";
import liveFeedFrames from "./mocks/live-feed-data.json";

// ── Cached real profile (fetched once when mocks enable) ──────────────────────
let cachedProfile: { user_id: string; first_name: string; last_name: string; role: string } | null = null;

// ── Mutable in-memory alert state (reset each time mocks are enabled) ────────
// Allows the acknowledge action to update alert status within the same session.
let mockTankAlerts: typeof dashboardData.ivfTankAlerts;

// ── Mutable in-memory chat state ───────────────────────────────────────────
// Allows sent messages to appear immediately on the subsequent refresh call.
let mockTankChatMessages: typeof dashboardData.ivfTankChatMessages;

// ── Mutable in-memory task state ───────────────────────────────────────────
// Allows created tasks to appear in the list after the POST resolves.
let mockCanisterTasks: typeof dashboardData.ivfTankTasks;

// ── Mutable in-memory refill log state ─────────────────────────────────────
// Allows newly created refill log entries to appear on the subsequent GET.
let mockCanisterRefillLogs: typeof dashboardData.ivfTankRefillLogs;

// ── Mutable in-memory support ticket state ──────────────────────────────────
// Allows submitted tickets to appear in the list; comments/status updates persist.
interface MockSupportTicket {
    feedback_id: string;
    feedback: string;
    type: string;
    status: string;
    submitted_on: string;
    submitted_by_name: string | null;
    hospital_name: string | null;
    branch_name: string | null;
    subject: string;
    description: string;
    priority: string;
    affected_modules: string[];
    attachment_paths: string[];
    comments: Array<{ id: number; comment: string; commented_by: string; created_at: string }>;
}
let mockSupportTickets: MockSupportTicket[];

// ── KPI unit map for live-feed messages ────────────────────────────────────
const KPI_UNIT_MAP: Record<string, string> = {
    temp_internal:           "°C",
    temp_external:           "°C",
    ln2_level:               "Ln2 in kg",
    ln2_evaporation_rate:    "kg/hr",
    tive_battery_percentage: "%",
    ln2_lid_state:           "",
    shock:                   "g",
};

// ── Fake WebSocket ──────────────────────────────────────────────────────────
// Intercepts all WebSocket connections during onboarding so the real server
// never receives requests (which would error out for mock tank IDs / branches).
// When the client subscribes with a tank_id, streams pre-recorded KPI frames
// every 5 seconds for up to 1 hour (720 frames), then stops.
class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState: number = 0; // CONNECTING
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    url: string;
    protocol = "";
    extensions = "";
    bufferedAmount = 0;
    binaryType: BinaryType = "blob";

    private feedTimer: ReturnType<typeof setInterval> | null = null;
    private feedIndex = 0;

    constructor(url: string | URL) {
        this.url = url.toString();
        // Simulate successful connection after a short delay
        setTimeout(() => {
            this.readyState = 1; // OPEN
            this.onopen?.(new Event("open"));
        }, 80);
    }

    send(data: unknown) {
        // Parse subscription request; start live feed when client subscribes with a tank_id
        try {
            const msg = typeof data === "string" ? JSON.parse(data) : data;
            if (msg && typeof msg === "object" && "tank_id" in msg) {
                this.startLiveFeed(Number(msg.tank_id) || 60);
            }
        } catch { /* ignore non-JSON sends */ }
    }

    private startLiveFeed(tankId: number) {
        if (this.feedTimer !== null) return; // already running
        const frames = liveFeedFrames as Array<Record<string, number>>;
        this.feedTimer = setInterval(() => {
            if (this.feedIndex >= frames.length || this.readyState !== 1) {
                this.stopLiveFeed();
                return;
            }
            const frame = frames[this.feedIndex++];
            const now = new Date().toISOString();
            const message = {
                tank_id: tankId,
                timestamp: now,
                kpis: Object.entries(frame).map(([name, value]) => ({
                    name,
                    value,
                    unit: KPI_UNIT_MAP[name] ?? "",
                    timestamp: now,
                })),
            };
            this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
        }, 5000);
    }

    private stopLiveFeed() {
        if (this.feedTimer !== null) {
            clearInterval(this.feedTimer);
            this.feedTimer = null;
        }
    }

    close(_code?: number, _reason?: string) {
        this.stopLiveFeed();
        this.readyState = 3; // CLOSED
        this.onclose?.(new CloseEvent("close", { wasClean: true, code: 1000 }));
    }

    addEventListener() { /* no-op */ }
    removeEventListener() { /* no-op */ }
    dispatchEvent() { return true; }
}

// ── KPI history generator ───────────────────────────────────────────────────
// Produces 8 data points spread over the last 9 minutes so LIVE chart shows data.
function buildMockKpiHistory() {
    const now = Date.now();
    // Realistic values matching real API for tank T1, Bangalore
    const configs = [
        { name: "temp_external",           base: 27.9,    jitter: 0.15, unit: "°C"     },
        { name: "temp_internal",           base: -195.5,  jitter: 0.3,  unit: "°C"     },
        { name: "ln2_level",               base: 33.53,   jitter: 0.005,unit: "Ln2 in kg" },
        { name: "ln2_evaporation_rate",    base: 0.0,     jitter: 0,    unit: "kg/hr"  },
        { name: "tive_battery_percentage", base: 100.0,   jitter: 0,    unit: "%"      },
        { name: "ln2_lid_state",           base: 0,       jitter: 0,    unit: ""       },
        { name: "shock",                   base: 1.0,     jitter: 0,    unit: "g"      },
    ];
    const POINTS = 8;
    const INTERVAL_MS = 70_000; // ~70 s between points → 8 × 70 s = ~9.3 min window

    const kpiSeries: Record<string, Array<{ timestamp: string; value: number; unit: string }>> = {};

    for (const cfg of configs) {
        kpiSeries[cfg.name] = [];
        for (let i = POINTS - 1; i >= 0; i--) {
            const ts = new Date(now - i * INTERVAL_MS).toISOString();
            const noise = cfg.jitter > 0 ? (Math.random() - 0.5) * 2 * cfg.jitter : 0;
            const value = Math.round((cfg.base + noise) * 100) / 100;
            kpiSeries[cfg.name].push({ timestamp: ts, value, unit: cfg.unit });
        }
    }

    return { tank_code: "T1", tank_id: 60, kpi_series: kpiSeries };
}

// ── KPI history timestamp shifter ──────────────────────────────────────────
// Static mock data has hardcoded timestamps that age out of the chart's time
// window filter (displayReadings filters to Date.now() - windowMs).
// This re-stamps every point so the last point lands at `now` and earlier
// points keep the same relative spacing.
function shiftKpiHistoryToNow(data: typeof dashboardData.ivfKpiHistory24H) {
    const now = Date.now();
    // Find the latest timestamp across all series
    let maxMs = 0;
    for (const points of Object.values(data.kpi_series)) {
        for (const p of points) {
            const t = new Date(p.timestamp).getTime();
            if (t > maxMs) maxMs = t;
        }
    }
    if (!maxMs) return data;
    const offset = now - maxMs;

    const shiftedSeries: typeof data.kpi_series = {} as typeof data.kpi_series;
    for (const [key, points] of Object.entries(data.kpi_series)) {
        (shiftedSeries as Record<string, typeof points>)[key] = points.map((p) => ({
            ...p,
            timestamp: new Date(new Date(p.timestamp).getTime() + offset).toISOString().replace("Z", ""),
        }));
    }
    return { ...data, kpi_series: shiftedSeries };
}

// ── Enable / disable ────────────────────────────────────────────────────────

export const enableOnboardingMocks = () => {
    // Deep-clone so mutations don't bleed across sessions
    mockTankAlerts = JSON.parse(JSON.stringify(dashboardData.ivfTankAlerts));
    mockTankChatMessages = JSON.parse(JSON.stringify(dashboardData.ivfTankChatMessages));
    mockCanisterTasks = JSON.parse(JSON.stringify(dashboardData.ivfTankTasks));
    mockCanisterRefillLogs = JSON.parse(JSON.stringify(dashboardData.ivfTankRefillLogs));
    mockSupportTickets = [
        {
            feedback_id: "TK-2026-04-001",
            feedback: "LN2 alert not triggering for tank T-05",
            type: "bug_report",
            status: "Open",
            submitted_on: "2026-04-18T10:20:00Z",
            submitted_by_name: "Avery Morgan",
            hospital_name: "Iris Fertility",
            branch_name: "Chennai",
            subject: "LN2 alert not triggering for tank T-05",
            description: "The critical alert for tank T-05 is not firing even when the LN2 level drops below threshold.",
            priority: "high",
            affected_modules: ["dashboard"],
            attachment_paths: [],
            comments: [],
        },
        {
            feedback_id: "TK-2026-04-002",
            feedback: "Request to add export to PDF for reports",
            type: "feature_request",
            status: "In Review",
            submitted_on: "2026-04-14T14:05:00Z",
            submitted_by_name: "Avery Morgan",
            hospital_name: "Iris Fertility",
            branch_name: "Chennai",
            subject: "Request to add export to PDF for reports",
            description: "It would be very helpful to export the reports page data as a PDF for sharing with the management team.",
            priority: "medium",
            affected_modules: ["container_quality_tracking"],
            attachment_paths: [],
            comments: [],
        },
        {
            feedback_id: "TK-2026-04-003",
            feedback: "Refill log table pagination not working on mobile",
            type: "bug_report",
            status: "Resolved",
            submitted_on: "2026-04-08T09:30:00Z",
            submitted_by_name: "Avery Morgan",
            hospital_name: "Iris Fertility",
            branch_name: "Chennai",
            subject: "Refill log table pagination not working on mobile",
            description: "When viewing the refill log on a mobile device, the pagination controls are not clickable.",
            priority: "low",
            affected_modules: ["dashboard"],
            attachment_paths: [],
            comments: [],
        },
    ];

    // Pre-fetch real profile once so sent messages show current user as sender
    userService.getProfileForOnboarding().then((p) => { cachedProfile = p; }).catch(() => {});

    BaseApiService.setMockEnabled(true);
    BaseApiService.setMockResolver(async (endpoint, options) => {
        console.log("[onboarding mock]", options?.method ?? "GET", endpoint);

        // User profile — hit real API only for onboarding, preserve real role as real_role, override role to Admin.
        if (endpoint.startsWith("/api/profile")) {
            try {
                const profile = await userService.getProfileForOnboarding();
                return { ...profile, real_role: profile.role, role: "Admin" };
            } catch {
                return undefined;
            }
        }

        // CGT alerts feed (used when department is not IVF).
        if (endpoint.startsWith("/api/alerts")) {
            return dashboardData.alerts;
        }

        // IVF alerts for a specific tank (canister detail page).
        if (endpoint.startsWith("/api/ivf/alerts/tank/")) {
            return mockTankAlerts;
        }

        // Acknowledge a single IVF alert — flip its status in the mutable copy.
        if (endpoint.startsWith("/api/ivf/alerts/acknowledge")) {
            try {
                const body = options?.body ? JSON.parse(options.body as string) : {};
                const alertId: string = body.alert_id ?? body.alertId ?? "";
                const alert = mockTankAlerts.alerts.find((a) => a.alert_id === alertId) as
                    | { status: string; acknowledged_by: string | null; acknowledged_at: string | null }
                    | undefined;
                if (alert) {
                    alert.status = "Acknowledged";
                    alert.acknowledged_by = "USR-DEMO";
                    alert.acknowledged_at = new Date().toISOString();
                }
            } catch { /* ignore parse errors */ }
            return { success: true };
        }

        // IVF alerts feed for IVF dashboard cards.
        if (endpoint.startsWith("/api/ivf/alerts/hospital")) {
            return dashboardData.ivfAlerts;
        }

        // Task list for My Tasks modal (GET only — POST/PUT/PATCH/DELETE handled below).
        if (endpoint === "/api/tasks" && (!options?.method || options.method === "GET")) {
            return dashboardData.tasks;
        }

        // CGT dashboard metrics (logistics, risk, compliance, performance).
        if (endpoint.startsWith("/api/logistics")) {
            return dashboardData.logistics;
        }

        // Patient stats (CGT metrics card).
        if (endpoint.startsWith("/api/patients/statistics/pharma")) {
            return dashboardData.patientStats;
        }

        if (endpoint.startsWith("/api/patients/statistics")) {
            return dashboardData.patientStats;
        }

        if (endpoint.startsWith("/api/performance/avg-quality-deviations")) {
            return dashboardData.performanceAvgQualityDeviations;
        }

        if (endpoint.startsWith("/api/performance/on-time-percentage")) {
            return dashboardData.performanceOnTime;
        }

        if (endpoint.startsWith("/api/performance/avg-lead-time")) {
            return dashboardData.performanceAvgLeadTime;
        }

        if (endpoint.startsWith("/api/performance/success-rate")) {
            return dashboardData.performanceSuccessRate;
        }

        if (endpoint.startsWith("/api/performance")) {
            return dashboardData.performance;
        }

        if (endpoint.startsWith("/api/risk")) {
            return dashboardData.risk;
        }

        if (endpoint.startsWith("/api/compliance")) {
            return dashboardData.compliance;
        }

        // Inbox badge data for onboarding.
        if (endpoint.startsWith("/api/chat/unread")) {
            return dashboardData.chats;
        }

        // Ongoing treatments table data.
        if (endpoint.startsWith("/api/patients/ongoing")) {
            return dashboardData.ongoingTreatments;
        }

        // IVF embryo tracking filters and table data.
        if (endpoint.startsWith("/api/ivf/embryo_tracking/filters")) {
            return dashboardData.ivfEmbryoTrackingFilters;
        }

        if (endpoint.startsWith("/api/ivf/embryo_tracking")) {
            return dashboardData.ivfEmbryoTracking;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/total-embryos-cryolocks")) {
            return dashboardData.ivfMetricsTotalEmbryosCryolocks;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/total-containers")) {
            return dashboardData.ivfMetricsTotalContainers;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/total-deviations")) {
            return dashboardData.ivfMetricsTotalDeviations;
        }

        if (endpoint.startsWith("/api/ivf/incubator/metrics/deviations")) {
            return dashboardData.ivfMetricsIncubatorDeviations;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/top-deviation-driver")) {
            return dashboardData.ivfMetricsTopDeviationDriver;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/avg-quality-loss-per-container")) {
            return dashboardData.ivfMetricsAvgQualityLossPerContainer;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/outbound-shipments")) {
            return dashboardData.ivfMetricsOutboundShipments;
        }

        if (endpoint.startsWith("/api/ivf/dashboard/metrics/deviations-graph")) {
            return dashboardData.ivfMetricsDeviationsGraph;
        }

        // Control Tower (CGT) routes and map data.
        if (endpoint.startsWith("/api/shipment/active-routes")) {
            return controlTowerData.activeRoutes;
        }

        if (endpoint.startsWith("/api/shipment/control-tower-map")) {
            return controlTowerData.controlTowerMap;
        }

        // Alert Setting — branch list for filter dropdown.
        if (endpoint.startsWith("/api/ivf/branches")) {
            const branches = controlTowerData.activeCanisters.branches.map((b: any) => ({
                branch_id: b.branch_id,
                branch_name: b.branch_name,
            }));
            return { branches };
        }

        // Alert Setting — KPI config list for a specific tank.
        if (endpoint.startsWith("/api/ivf/quality/kpi-config/list")) {
            return dashboardData.alertSettingKpiConfigList;
        }

        // Alert Setting — hospital notification settings.
        if (endpoint.startsWith("/api/ivf/quality/hospital-notification-settings")) {
            return { is_email_notifify: true, is_whatsapp_notify: false };
        }

        // Control Tower (IVF) canisters and branch map data.
        if (endpoint.startsWith("/api/ivf/control_tower/active_canisters")) {
            return controlTowerData.activeCanisters;
        }

        if (endpoint.startsWith("/api/ivf/control_tower")) {
            try {
                const profile = await userService.getProfileForOnboarding();
                return { ...controlTowerData.ivfControlTower, hospitalName: profile.company_name ?? controlTowerData.ivfControlTower.hospitalName };
            } catch {
                return controlTowerData.ivfControlTower;
            }
        }

        // IVF storage panel placeholder data.
        if (endpoint.startsWith("/api/ivf/storage")) {
            return dashboardData.ivfStorage;
        }

        // IVF track shipment — tank KPI config (any tankId).
        if (endpoint.startsWith("/api/ivf/quality/tanks/") && endpoint.includes("/kpi-config")) {
            return dashboardData.ivfTankKpiConfig;
        }

        // IVF track shipment — tank KPI history (any tankId, any duration).
        // Generated dynamically so LIVE range (last 10 min) always has data.
        if (endpoint.startsWith("/api/ivf/quality/tanks/") && endpoint.includes("/kpi-history")) {
            if (endpoint.includes("duration_minutes=10080")) return shiftKpiHistoryToNow(dashboardData.ivfKpiHistory7D);
            if (endpoint.includes("duration_minutes=1440")) return shiftKpiHistoryToNow(dashboardData.ivfKpiHistory24H);
            return buildMockKpiHistory(); // LIVE and 1H
        }

        // IVF track shipment — canister tracking details (cryolocks list).
        if (endpoint.startsWith("/api/quality-tracking/tanks/") && endpoint.includes("/tracking-details")) {
            return dashboardData.ivfTankTrackingDetails;
        }

        // IVF track shipment — create refill log entry.
        if (
            endpoint.match(/^\/api\/quality-tracking\/tanks\/[^/]+\/refill-logs$/) &&
            options?.method === "POST"
        ) {
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const newLog = {
                tank_id: 60,
                log_id: mockCanisterRefillLogs.refill_logs.length + 500,
                refill_date: body.refill_date ?? new Date().toISOString().split("T")[0],
                refill_time: body.refill_time ?? "00:00:00",
                refilled_by: body.refilled_by ?? "",
                description: body.description ?? "",
                status: body.status ?? "Not started",
                cryoshipper: body.cryoshipper ?? null,
                disinfected_shipper_infected_tank_description: body.disinfected_shipper_infected_tank_description ?? null,
                reservoir: body.reservoir ?? null,
                ln2_ordered_date: body.ln2_ordered_date ?? null,
                ln2_received_date: body.ln2_received_date ?? null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                created_by: "demo@onboarding.local",
                updated_by: null,
            };
            mockCanisterRefillLogs.refill_logs.unshift(newLog);
            return { success: true, log: newLog };
        }

        // IVF track shipment — refill logs (GET).
        if (endpoint.startsWith("/api/quality-tracking/tanks/") && endpoint.includes("/refill-logs")) {
            return mockCanisterRefillLogs;
        }

        // Reports page — monthly summary.
        if (endpoint.startsWith("/api/ivf/reports/monthly-summary")) {
            return dashboardData.reportsMonthlySummary;
        }

        // Reports page — critical alerts report.
        if (endpoint.startsWith("/api/ivf/reports/critical-alerts")) {
            return dashboardData.reportsCriticalAlerts;
        }

        // Reports page — refill logs report.
        if (endpoint.startsWith("/api/ivf/reports/refill-logs")) {
            return dashboardData.reportsRefillLogs;
        }

        // Reports page — activity logs (filtered by query params).
        if (endpoint.startsWith("/api/activity-logs")) {
            const qs = endpoint.includes("?") ? new URLSearchParams(endpoint.split("?")[1]) : new URLSearchParams();
            const actionsParam = qs.get("actions");
            const allowedActions = actionsParam ? actionsParam.split(",").map(s => s.trim()).filter(Boolean) : [];
            const outcomeParam  = qs.get("outcome")    ?? "";
            const actorTypeParam = qs.get("actor_type") ?? "";
            const searchParam   = (qs.get("search")    ?? "").toLowerCase();
            const dateFrom      = qs.get("date_from")  ?? "";
            const dateTo        = qs.get("date_to")    ?? "";
            const page          = parseInt(qs.get("page")      ?? "1",  10);
            const pageSize      = parseInt(qs.get("page_size") ?? "20", 10);

            type LogRow = typeof dashboardData.reportsActivityLogs.logs[number];
            let logs: LogRow[] = [...dashboardData.reportsActivityLogs.logs];

            if (allowedActions.length > 0) {
                logs = logs.filter(l => allowedActions.includes(l.action));
            }
            if (outcomeParam) {
                logs = logs.filter(l => l.outcome === outcomeParam);
            }
            if (actorTypeParam) {
                logs = logs.filter(l => l.actor_type === actorTypeParam);
            }
            if (searchParam) {
                logs = logs.filter(l =>
                    (l.action        ?? "").toLowerCase().includes(searchParam) ||
                    (l.actor_label   ?? "").toLowerCase().includes(searchParam) ||
                    (l.target_label  ?? "").toLowerCase().includes(searchParam) ||
                    (l.outcome       ?? "").toLowerCase().includes(searchParam),
                );
            }
            if (dateFrom) {
                logs = logs.filter(l => l.created_at >= dateFrom);
            }
            if (dateTo) {
                const toEnd = dateTo + "T23:59:59Z";
                logs = logs.filter(l => l.created_at <= toEnd);
            }

            const total = logs.length;
            const start = (page - 1) * pageSize;
            logs = logs.slice(start, start + pageSize);

            return { logs, total_count: total, page, page_size: pageSize, status: "ok" };
        }

        // Refill Log page — pending detections.
        if (endpoint.startsWith("/api/quality-tracking/refill-detections/pending")) {
            return dashboardData.refillPendingDetections;
        }

        // Refill Log page — all-tanks refill logs.
        if (endpoint.startsWith("/api/quality-tracking/tanks/all-refill-logs")) {
            return dashboardData.refillAllLogs;
        }

        // Refill Log page — tanks refill summary.
        if (endpoint.startsWith("/api/quality-tracking/tanks/refill-summary")) {
            return dashboardData.refillSummary;
        }

        // Refill Log page — reservoirs list.
        if (endpoint.startsWith("/api/ivf/reservoirs")) {
            return dashboardData.refillReservoirs;
        }

        // Refill Log page — reservoir logs.
        if (endpoint.startsWith("/api/ivf/reservoir-logs")) {
            return dashboardData.refillReservoirLogs;
        }

        // Users page — hospital user list.
        if (endpoint.startsWith("/api/hospital/users")) {
            return dashboardData.hospitalUsers;
        }

        // Company user list — used by StakeholderChatBox for @mention suggestions.
        if (endpoint.startsWith("/api/users")) {
            return dashboardData.hospitalUsers;
        }

        // Support / Profile — submit a new feedback ticket.
        if (endpoint === "/api/feedback/create" && options?.method === "POST") {
            let body: Record<string, any> = {};
            // submitFeedback sends FormData; pull the JSON "request" field.
            if (options.body instanceof FormData) {
                const raw = (options.body as FormData).get("request");
                if (raw) body = JSON.parse(raw as string);
            } else if (typeof options.body === "string") {
                body = JSON.parse(options.body);
            }
            const ticketNum = mockSupportTickets.length + 1;
            const newId = `TK-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(ticketNum).padStart(3, "0")}`;
            const submitterName = cachedProfile
                ? `${cachedProfile.first_name} ${cachedProfile.last_name}`
                : "Demo User";
            const newTicket: MockSupportTicket = {
                feedback_id: newId,
                feedback: body.subject ?? "New Ticket",
                type: body.feedback_type ?? "other",
                status: "Open",
                submitted_on: new Date().toISOString(),
                submitted_by_name: submitterName,
                hospital_name: "Iris Fertility",
                branch_name: "Chennai",
                subject: body.subject ?? "",
                description: body.description ?? "",
                priority: body.priority ?? "medium",
                affected_modules: body.affected_modules ?? [],
                attachment_paths: [],
                comments: [],
            };
            mockSupportTickets.unshift(newTicket);
            return { message: "Feedback submitted successfully", ticket_id: newId, feedback_id: newId, status: "Open" };
        }

        // Support — add comment to a ticket.
        if (endpoint.match(/^\/api\/feedback\/[^/]+\/comments$/) && options?.method === "POST") {
            const feedbackId = endpoint.split("/")[3];
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const ticket = mockSupportTickets.find((t) => t.feedback_id === feedbackId);
            const commentId = Date.now();
            const commenterName = cachedProfile
                ? `${cachedProfile.first_name} ${cachedProfile.last_name}`
                : "Demo User";
            if (ticket) {
                ticket.comments.push({
                    id: commentId,
                    comment: body.comment ?? "",
                    commented_by: commenterName,
                    created_at: new Date().toISOString(),
                });
            }
            return { message: "Comment added", comment_id: commentId, ticket_id: feedbackId };
        }

        // Support — get comments for a ticket.
        if (endpoint.match(/^\/api\/feedback\/[^/]+\/comments$/) && (!options?.method || options.method === "GET")) {
            const feedbackId = endpoint.split("/")[3];
            const ticket = mockSupportTickets.find((t) => t.feedback_id === feedbackId);
            return ticket?.comments ?? [];
        }

        // Support — update ticket status.
        if (endpoint.match(/^\/api\/feedback\/[^/]+\/status$/) && options?.method === "PATCH") {
            const feedbackId = endpoint.split("/")[3];
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const ticket = mockSupportTickets.find((t) => t.feedback_id === feedbackId);
            const oldStatus = ticket?.status ?? "Open";
            if (ticket) ticket.status = body.status ?? ticket.status;
            return { message: "Status updated", ticket_id: feedbackId, old_status: oldStatus, new_status: ticket?.status ?? body.status };
        }

        // Support / Profile — ticket details (readonly view).
        if (endpoint.match(/^\/api\/feedback\/[^/]+$/) && (!options?.method || options.method === "GET")) {
            const feedbackId = endpoint.split("/")[3];
            const ticket = mockSupportTickets.find((t) => t.feedback_id === feedbackId);
            if (!ticket) return undefined;
            return {
                id: ticket.feedback_id,
                ticket_id: ticket.feedback_id,
                department: "other",
                feedback_type: ticket.type,
                subject: ticket.subject,
                description: ticket.description,
                attachment_paths: ticket.attachment_paths,
                priority: ticket.priority.toUpperCase(),
                affected_modules: ticket.affected_modules,
                status: ticket.status,
                submitted_by: ticket.submitted_by_name ?? "Demo User",
                submitted_by_email: cachedProfile ? `${cachedProfile.first_name.toLowerCase()}@example.com` : "demo@example.com",
                submitted_on: ticket.submitted_on,
                created_at: ticket.submitted_on,
                comments: ticket.comments,
            };
        }

        // Profile page / Support — user feedback ticket list.
        if (endpoint.startsWith("/api/feedback/user/") || endpoint.startsWith("/api/feedback/admin")) {
            return [...mockSupportTickets];
        }

        // IVF track shipment — canister tasks (GET).
        // Return a shallow copy so React re-renders after add/edit.
        if (endpoint.startsWith("/api/canisters/") && endpoint.includes("/tasks")) {
            return { ...mockCanisterTasks, tasks: [...mockCanisterTasks.tasks] };
        }

        // Task creation — append to mock list and return success.
        if (endpoint === "/api/tasks" && options?.method === "POST") {
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const assigneeId = body.assignee_id ?? cachedProfile?.user_id ?? "USR-DEMO";
            const userInfo = cachedProfile
                ? {
                      user_id: cachedProfile.user_id,
                      first_name: cachedProfile.first_name,
                      last_name: cachedProfile.last_name,
                      email: "demo@arcfertility.in",
                      role: cachedProfile.role,
                  }
                : {
                      user_id: assigneeId,
                      first_name: "Demo",
                      last_name: "User",
                      email: "demo@arcfertility.in",
                      role: "User",
                  };
            const nowIso = new Date().toISOString();
            const newTask = {
                id: mockCanisterTasks.tasks.length + 200,
                task_name: body.task_name ?? "New Task",
                description: body.description ?? "",
                assignee: userInfo,
                created_by: userInfo,
                patient_id: null,
                tank_code: body.tank_code ?? "T-161",
                tank_id: body.tank_id ?? 0,
                due_date: body.due_date ?? nowIso,
                priority: body.priority ?? "Medium",
                status: body.status ?? "Not started",
                created_at: nowIso,
                updated_at: nowIso,
                permissions: {
                    can_edit_all: true,
                    can_edit_status_only: false,
                },
            };
            mockCanisterTasks.tasks.push(newTask);
            return { success: true, task: newTask };
        }

        // Task edit — update fields in mock list.
        if (endpoint.match(/^\/api\/tasks\/\d+$/) && options?.method === "PUT") {
            const taskId = Number(endpoint.split("/").pop());
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const idx = mockCanisterTasks.tasks.findIndex((t) => t.id === taskId);
            if (idx !== -1) {
                mockCanisterTasks.tasks[idx] = { ...mockCanisterTasks.tasks[idx], ...body };
            }
            return { success: true, task: mockCanisterTasks.tasks[idx] ?? {} };
        }

        // Task status update.
        if (endpoint.match(/^\/api\/tasks\/\d+\/status$/) && options?.method === "PATCH") {
            const taskId = Number(endpoint.split("/")[3]);
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const idx = mockCanisterTasks.tasks.findIndex((t) => t.id === taskId);
            if (idx !== -1) {
                mockCanisterTasks.tasks[idx] = { ...mockCanisterTasks.tasks[idx], status: body.status };
            }
            return { success: true };
        }

        // Task delete.
        if (endpoint.match(/^\/api\/tasks\/\d+$/) && options?.method === "DELETE") {
            const taskId = Number(endpoint.split("/").pop());
            mockCanisterTasks.tasks = mockCanisterTasks.tasks.filter((t) => t.id !== taskId);
            return { message: "Task deleted", task_id: taskId };
        }

        // IVF track shipment — stakeholder chat messages.
        // Return a shallow copy so React detects the new array reference after a message is sent.
        if (endpoint.startsWith("/api/chat/canisters/") && endpoint.includes("/messages")) {
            return { ...mockTankChatMessages, messages: [...mockTankChatMessages.messages] };
        }

        // Stakeholder chat — send a new message.
        console.log("[onboarding mock] chat send check:", endpoint, "|method:", options?.method);
        if (endpoint === "/api/chat/messages" && options?.method === "POST") {
            const body = options?.body ? JSON.parse(options.body as string) : {};
            const newMsg = {
                id: mockTankChatMessages.messages.length + 100,
                message_content: body.message_content ?? "",
                canister_number: body.canister_number ?? "161",
                sender_id: cachedProfile?.user_id ?? "USR-DEMO",
                sender_name: cachedProfile ? `${cachedProfile.first_name} ${cachedProfile.last_name}` : "Demo User",
                sender_role: cachedProfile?.role ?? "Admin",
                tagged_user_ids: [] as never[],
                created_at: new Date().toISOString(),
                is_read: true,
                read_at: new Date().toISOString(),
            };
            mockTankChatMessages.messages.push(newMsg);
            mockTankChatMessages.total_messages = mockTankChatMessages.messages.length;
            return newMsg;
        }

        // Stakeholder chat — mark as read.
        if (
            (endpoint.startsWith("/api/chat/canisters/") && endpoint.includes("/mark-read")) ||
            (endpoint.startsWith("/api/chat/patients/") && endpoint.includes("/mark-read"))
        ) {
            return { success: true, last_read_message_id: 0, unread_count: 0 };
        }

        return undefined;
    });

    // Replace window.WebSocket with a fake that connects silently.
    // This prevents real-backend WS errors (e.g. "Tank does not belong to your branch")
    // from appearing in onboarding. The fake reports "connected" but never delivers data.
    if (typeof window !== "undefined" && !(window as any).__onboardingOriginalWebSocket) {
        (window as any).__onboardingOriginalWebSocket = window.WebSocket;
        (window as any).WebSocket = FakeWebSocket;
    }
};

export const disableOnboardingMocks = () => {
    BaseApiService.setMockEnabled(false);
    BaseApiService.setMockResolver(undefined);

    // Restore original WebSocket
    if (typeof window !== "undefined" && (window as any).__onboardingOriginalWebSocket) {
        window.WebSocket = (window as any).__onboardingOriginalWebSocket;
        delete (window as any).__onboardingOriginalWebSocket;
    }
};
