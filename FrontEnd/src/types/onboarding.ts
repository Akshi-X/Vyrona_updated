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

/** Shown at the start of a page-launched preview tour — a compact intro (no pass threshold). */
export interface OnboardingLevelQuickStart {
    message: string;
}

/** Shown at the end of a page-launched preview tour (no quiz) with an "Exit Tour" action. */
export interface OnboardingLevelQuickExit {
    headerTitle?: string;
    title: string;
    message: string;
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
    quick_start?: OnboardingLevelQuickStart;
    quick_exit?: OnboardingLevelQuickExit;
    quiz?: OnboardingLevelQuiz;
}

/** A per-page guided tour (the "Take a tour" icon), decoupled from the gamified levels. */
export interface PageTour {
    id: string;
    /** The /onboarding replica route this tour runs on (real page = route minus /onboarding). */
    route: string;
    title: string;
    quick_start?: OnboardingLevelQuickStart;
    quick_exit?: OnboardingLevelQuickExit;
}

export interface OnboardingStep {
    id: string;
    target: string;
    title: string;
    content: string;
    icon?: string;
    placement?: "top" | "bottom" | "left" | "right" | "center" | "top_left" | "top_right" | "bottom_left" | "bottom_right" | "middle_right" | "middle_left" | "top_middle" | "bottom_middle" | "middle_middle";
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
    /** Scroll the target element into view before the spotlight positions itself */
    scrollIntoView?: boolean;
    /** Auto-advance if the target element is not in the DOM (e.g. conditionally rendered on narrow screens only) */
    skipIfMissing?: boolean;
    /** Auto-advance if the given selector IS found in the DOM (opposite of skipIfMissing) */
    skipIfPresent?: string;
    /** Set true to skip this step at runtime (preserves the definition for reference) */
    _disabled?: boolean;
    /** Wide two-column layout: gif on left, text + nav on right */
    is_wide?: boolean;
    /** Path to a gif shown in the left panel when is_wide is true */
    gif?: string;
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
