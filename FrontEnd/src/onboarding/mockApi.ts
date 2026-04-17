import { BaseApiService } from "../services/baseApiService";
import dashboardData from "./mocks/dashboard-data.json";
import controlTowerData from "./mocks/control-tower-data.json";

export const enableOnboardingMocks = () => {
    BaseApiService.setMockEnabled(true);
    BaseApiService.setMockResolver((endpoint) => {
        // User profile for onboarding dashboard header and auth-derived UI.
        // if (endpoint.startsWith("/api/profile")) {
        //     return dashboardData.profile;
        // }

        // CGT alerts feed (used when department is not IVF).
        if (endpoint.startsWith("/api/alerts")) {
            return dashboardData.alerts;
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
            return controlTowerData.ivfControlTower;
        }

        // IVF storage panel placeholder data.
        if (endpoint.startsWith("/api/ivf/storage")) {
            return dashboardData.ivfStorage;
        }

        return undefined;
    });
};

export const disableOnboardingMocks = () => {
    BaseApiService.setMockEnabled(false);
    BaseApiService.setMockResolver(undefined);
};
