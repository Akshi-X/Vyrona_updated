export type OnboardingReplica =
    | "dashboard"
    | "control-tower"
    | "alert-setting"
    | "refill-log"
    | "reports"
    | "user-profile"
    | "users";

export interface OnboardingLevelWelcome {
    title: string;
    subtitle: string;
    description: string;
    badge: string;
}

export interface OnboardingLevelCompletion {
    title: string;
    message: string;
    badge: string;
}

export interface OnboardingLevelInterlude {
    title: string;
    message: string;
    covered: string[];
}

export interface OnboardingLevelSection {
    title: string;
    text: string;
}

export interface OnboardingLevelConfig {
    id: string;
    title: string;
    route: string;
    pointsRequired: number;
    unlockDelayHours: number;
    tourStepsFile: string;
    quizFile: string;
    replica: OnboardingReplica;
    sections?: OnboardingLevelSection[];
    welcome?: OnboardingLevelWelcome;
    interlude?: OnboardingLevelInterlude;
    completion?: OnboardingLevelCompletion;
}

export interface OnboardingStep {
    id: string;
    target: string;
    title: string;
    content: string;
    icon?: string;
    placement?: "top" | "bottom" | "left" | "right" | "center";
    requireClick?: boolean;
    prevDisable?: boolean;
    clickOnlyId?: string[];
    disableClickID?: string[];
    genieImage?: string;
    startPage?: string;
    inputText?: string;
    stepDelay?: number;
    onboardingEvent?: string;
}

export interface OnboardingQuizQuestion {
    id: string;
    prompt: string;
    choices: string[];
    correctIndex: number;
    points: number;
}

export type OnboardingLevelStatus = "locked" | "available" | "in_progress" | "completed";

export interface OnboardingLevelProgress {
    id: string;
    status: OnboardingLevelStatus;
    /** Score of the current/latest quiz attempt — resets to 0 on retry */
    currentScore: number;
    /** Best score ever achieved (set on completion, never reset) */
    highScore: number;
    /** Total steps in this level (from config, stored for backend convenience) */
    totalSteps: number;
    /** Total quiz questions in this level (from config, stored for backend convenience) */
    totalQuiz: number;
    attempts: number;
    startedAt?: string;
    completedAt?: string;
    unlockedAt?: string;
    lastStepIndex: number;
    lastQuizIndex: number;
}

export interface OnboardingState {
    activeLevelId?: string;
    levels: Record<string, OnboardingLevelProgress>;
    lastUpdatedAt?: string;
}
