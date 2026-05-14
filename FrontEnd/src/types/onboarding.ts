export type OnboardingReplica =
    | "dashboard"
    | "control-tower"
    | "alert-setting"
    | "refill-log"
    | "reports"
    | "user-profile"
    | "users";

export interface OnboardingLevelWelcome {
    headerTitle?: string;
    title: string;
    subtitle: string;
    description: string;
    badge: string;
}

export interface OnboardingLevelCompletion {
    headerTitle?: string;
    title: string;
    message: string;
    badge: string;
}

export interface OnboardingLevelInterlude {
    headerTitle?: string;
    title: string;
    message: string;
    covered: string[];
}

export interface OnboardingLevelQuiz {
    headerTitle?: string;
    file: string;
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
    /** Minimum sum of all levels' highScore needed to unlock this level */
    scoreRequired: number;
    unlockDelayHours: number;
    tourStepsFile: string;
    replica: OnboardingReplica;
    sections?: OnboardingLevelSection[];
    welcome?: OnboardingLevelWelcome;
    interlude?: OnboardingLevelInterlude;
    completion?: OnboardingLevelCompletion;
    quiz?: OnboardingLevelQuiz;
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
    /** On reload/refresh, walk the step index back past this step so the user never resumes mid-flow */
    rewindOnRefresh?: boolean;
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
