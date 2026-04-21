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

export const onboardingLevels = levelConfigs as OnboardingLevelConfig[];

export const onboardingStepsByLevel: Record<string, OnboardingStep[]> = {
    "level-1": level1Steps as OnboardingStep[],
    "level-2": level2Steps as OnboardingStep[],
    "level-3": level3Steps as OnboardingStep[],
    "level-4": level4Steps as OnboardingStep[],
    "level-5": level5Steps as OnboardingStep[],
    "level-6": level6Steps as OnboardingStep[],
    "level-7": level7Steps as OnboardingStep[],
    "level-8": level8Steps as OnboardingStep[],
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
