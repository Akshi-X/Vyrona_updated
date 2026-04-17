import { BaseApiService } from "../services/baseApiService";
import { userService } from "../services/userService";
import dashboardData from "./mocks/dashboard-data.json";
import controlTowerData from "./mocks/control-tower-data.json";
import liveFeedFrames from "./mocks/live-feed-data.json";

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

// ── Enable / disable ────────────────────────────────────────────────────────

export const enableOnboardingMocks = () => {
    BaseApiService.setMockEnabled(true);
    BaseApiService.setMockResolver(async (endpoint) => {
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
            return dashboardData.ivfTankAlerts;
        }

        // IVF alerts feed for IVF dashboard cards.
        if (endpoint.startsWith("/api/ivf/alerts/hospital")) {
            return dashboardData.ivfAlerts;
        }

        // Task list for My Tasks modal.
        if (endpoint.startsWith("/api/tasks")) {
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
            if (endpoint.includes("duration_minutes=10080")) return dashboardData.ivfKpiHistory7D;
            if (endpoint.includes("duration_minutes=1440")) return dashboardData.ivfKpiHistory24H;
            return buildMockKpiHistory(); // LIVE and 1H
        }

        // IVF track shipment — canister tracking details (cryolocks list).
        if (endpoint.startsWith("/api/quality-tracking/tanks/") && endpoint.includes("/tracking-details")) {
            return dashboardData.ivfTankTrackingDetails;
        }

        // IVF track shipment — refill logs.
        if (endpoint.startsWith("/api/quality-tracking/tanks/") && endpoint.includes("/refill-logs")) {
            return dashboardData.ivfTankRefillLogs;
        }

        // IVF track shipment — canister tasks.
        if (endpoint.startsWith("/api/canisters/") && endpoint.includes("/tasks")) {
            return dashboardData.ivfTankTasks;
        }

        // IVF track shipment — stakeholder chat messages.
        if (endpoint.startsWith("/api/chat/canisters/") && endpoint.includes("/messages")) {
            return dashboardData.ivfTankChatMessages;
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
