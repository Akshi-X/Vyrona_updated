import levelConfigs from "./levels.json";
import level1Steps from "./level-1.steps.json";
import level2Steps from "./level-2.steps.json";
import level3Steps from "./level-3.steps.json";
import level4Steps from "./level-4.steps.json";
import level5Steps from "./level-5.steps.json";
import level6Steps from "./level-6.steps.json";
import level7Steps from "./level-7.steps.json";
import level8Steps from "./level-8.steps.json";
import level1Quiz from "./level-1.quiz.json";
import level2Quiz from "./level-2.quiz.json";
import level3Quiz from "./level-3.quiz.json";
import level4Quiz from "./level-4.quiz.json";
import level5Quiz from "./level-5.quiz.json";
import level6Quiz from "./level-6.quiz.json";
import level7Quiz from "./level-7.quiz.json";
import level8Quiz from "./level-8.quiz.json";
import dashboardMock from "../mocks/dashboard.json";
import controlTowerMock from "../mocks/controlTower.json";
import type {
    OnboardingLevelConfig,
    OnboardingQuizQuestion,
    OnboardingStep,
} from "../../types/onboarding";

// level-0 is the welcome-only entry; exclude it from the playable levels list
export const onboardingLevels = (levelConfigs as OnboardingLevelConfig[]).filter(
    (l) => l.id !== "level-0",
);

export const level0Config = (levelConfigs as OnboardingLevelConfig[]).find(
    (l) => l.id === "level-0",
);

const filterSteps = (steps: unknown[]) =>
    (steps as OnboardingStep[]).filter((s) => !s._disabled);

export const onboardingStepsByLevel: Record<string, OnboardingStep[]> = {
    "level-1": filterSteps(level1Steps),
    "level-2": filterSteps(level2Steps),
    "level-3": filterSteps(level3Steps),
    "level-4": filterSteps(level4Steps),
    "level-5": filterSteps(level5Steps),
    "level-6": filterSteps(level6Steps),
    "level-7": filterSteps(level7Steps),
    "level-8": filterSteps(level8Steps),
};

export const onboardingQuizByLevel: Record<string, OnboardingQuizQuestion[]> = {
    "level-1": level1Quiz as OnboardingQuizQuestion[],
    "level-2": level2Quiz as OnboardingQuizQuestion[],
    "level-3": level3Quiz as OnboardingQuizQuestion[],
    "level-4": level4Quiz as OnboardingQuizQuestion[],
    "level-5": level5Quiz as OnboardingQuizQuestion[],
    "level-6": level6Quiz as OnboardingQuizQuestion[],
    "level-7": level7Quiz as OnboardingQuizQuestion[],
    "level-8": level8Quiz as OnboardingQuizQuestion[],
};

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
