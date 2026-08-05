import levelConfigs from "./levels.json";
import dashboardSteps from "./dashboard.steps.json";
import controlTowerSteps from "./control-tower.steps.json";
import cryocanSteps from "./cryocan.steps.json";
import alertSettingSteps from "./alert-setting.steps.json";
import refillLogSteps from "./refill-log.steps.json";
import reportsSteps from "./reports.steps.json";
import userProfileSteps from "./user-profile.steps.json";
import usersSteps from "./users.steps.json";
import dashboardMock from "../mocks/dashboard.json";
import controlTowerMock from "../mocks/controlTower.json";
import type {
    OnboardingLevelConfig,
    OnboardingQuizQuestion,
    OnboardingStep,
    PageTour,
} from "../../types/onboarding";

// level-0 is the welcome-only entry; exclude it from the playable levels list.
// The gamified onboarding Timeline runs on exactly these 3 levels.
export const onboardingLevels = (levelConfigs as OnboardingLevelConfig[]).filter(
    (l) => l.id !== "level-0",
);

export const level0Config = (levelConfigs as OnboardingLevelConfig[]).find(
    (l) => l.id === "level-0",
);

const filterSteps = (steps: unknown[]) =>
    (steps as OnboardingStep[]).filter((s) => !s._disabled);

// Steps for the 3 gamified levels (see levels.json for the level → title mapping).
export const onboardingStepsByLevel: Record<string, OnboardingStep[]> = {
    "level-1": filterSteps(cryocanSteps),      // Cryocan Quality Tracking
    "level-2": filterSteps(alertSettingSteps), // Alert Configuration
    "level-3": filterSteps(userProfileSteps),  // Profile
};

// ── Per-page guided tours (the "Take a tour" icon) ────────────────────────────
// Decoupled from the gamified Timeline: every page has its own contextual tour,
// launched as a preview (no progress/DB writes). Keyed by their /onboarding route.
export const pageTours: PageTour[] = [
    {
        id: "tour-dashboard",
        route: "/onboarding/dashboard",
        title: "Dashboard",
        quick_start: { message: "Take a quick tour of your dashboard — KPIs, live alerts, and shipment tracking at a glance." },
        quick_exit: { headerTitle: "Dashboard Tour Complete", title: "Dashboard Tour Complete", message: "You've explored the core dashboard — KPIs, live alerts, and shipments." },
    },
    {
        id: "tour-control-tower",
        route: "/onboarding/control-tower",
        title: "Control Tower",
        quick_start: { message: "See how to monitor branch operations, pending actions, and logistics lanes in real time." },
        quick_exit: { headerTitle: "Control Tower Tour Complete", title: "Control Tower Tour Complete", message: "You can now monitor live operations from the Control Tower." },
    },
    {
        id: "tour-alert-setting",
        route: "/onboarding/alert-setting",
        title: "Alert Configuration",
        quick_start: { message: "See how to set alert thresholds and notification rules for each device and KPI." },
        quick_exit: { headerTitle: "Alerts Tour Complete", title: "Alerts Tour Complete", message: "You know how to configure alert thresholds and notification rules." },
    },
    {
        id: "tour-refill-log",
        route: "/onboarding/refill-log",
        title: "Refill Logs",
        quick_start: { message: "See how every LN2 refill event is tracked — who performed it, when, and how much." },
        quick_exit: { headerTitle: "Refill Log Tour Complete", title: "Refill Log Tour Complete", message: "You can trace every LN2 refill event and keep a full audit trail." },
    },
    {
        id: "tour-reports",
        route: "/onboarding/reports",
        title: "Reports",
        quick_start: { message: "See how to filter, generate, and export your clinic's operational reports." },
        quick_exit: { headerTitle: "Reports Tour Complete", title: "Reports Tour Complete", message: "You can generate, filter, and export reports for smarter decisions." },
    },
    {
        id: "tour-user-profile",
        route: "/onboarding/user-profile",
        title: "Profile",
        quick_start: { message: "See how to manage your personal info, support tickets, and notification preferences." },
        quick_exit: { headerTitle: "Profile Tour Complete", title: "Profile Tour Complete", message: "You know where to update your info, track support, and manage notifications." },
    },
    {
        id: "tour-users",
        route: "/onboarding/users",
        title: "Users",
        quick_start: { message: "See how to filter by role and branch, invite members, and control who has access." },
        quick_exit: { headerTitle: "Users Tour Complete", title: "Users Tour Complete", message: "You can manage who has access to your mgSCALE account." },
    },
];

export const pageTourStepsById: Record<string, OnboardingStep[]> = {
    "tour-dashboard": filterSteps(dashboardSteps),
    "tour-control-tower": filterSteps(controlTowerSteps),
    "tour-alert-setting": filterSteps(alertSettingSteps),
    "tour-refill-log": filterSteps(refillLogSteps),
    "tour-reports": filterSteps(reportsSteps),
    "tour-user-profile": filterSteps(userProfileSteps),
    "tour-users": filterSteps(usersSteps),
};

export const getPageTour = (id: string): PageTour | undefined =>
    pageTours.find((t) => t.id === id);

// Quiz disabled: empty map → getQuiz() returns [] for every level, so the post-tour
// flow skips straight to completion. To re-enable, import the <module>.quiz.json files
// and add "level-N": <module>Quiz entries here (the quiz UI in LevelOverlay is intact).
export const onboardingQuizByLevel: Record<string, OnboardingQuizQuestion[]> = {};

export const onboardingMocks = {
    dashboard: dashboardMock as {
        kpis: Array<{ id: string; label: string; value: string }>;
        alerts: Array<{ id: string; title: string; detail: string }>;
        shipments: Array<{ id: string; lane: string; status: string; eta: string }>;
    },
    "control-tower": controlTowerMock as {
        kpis: Array<{ id: string; label: string; value: string }>;
        actions: Array<{ id: string; title: string; detail: string }>;
        lanes: Array<{ id: string; route: string; risk: string }>;
    },
};
