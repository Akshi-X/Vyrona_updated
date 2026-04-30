import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type {
    OnboardingLevelConfig,
    OnboardingLevelProgress,
    OnboardingQuizQuestion,
    OnboardingState,
    OnboardingStep,
} from "../types/onboarding";
import { useAuth } from "./AuthContext";
import {
    onboardingLevels,
    onboardingQuizByLevel,
    onboardingStepsByLevel,
} from "../onboarding/data";
import { onboardingService } from "../services/onboardingService";

interface OnboardingContextValue {
    state: OnboardingState;
    levels: OnboardingLevelConfig[];
    getLevelProgress: (levelId: string) => OnboardingLevelProgress | undefined;
    getSteps: (levelId: string) => OnboardingStep[];
    getQuiz: (levelId: string) => OnboardingQuizQuestion[];
    startLevel: (levelId: string) => void;
    setStepIndex: (levelId: string, index: number) => void;
    setQuizIndex: (levelId: string, index: number) => void;
    answerQuiz: (levelId: string, questionId: string, choiceIndex: number) => void;
    completeLevel: (levelId: string, score: number) => void;
    resetLevel: (levelId: string) => void;
    resetQuiz: (levelId: string) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

const STORAGE_KEY = "onboarding_state_v1";

const nowIso = () => new Date().toISOString();

// Returns the ISO UTC string for 00:00 IST (UTC+5:30) on the date that is
// `daysFromNow` calendar days after today in IST.
// e.g. called on 24 Apr, daysFromNow=2 → "2026-04-25T18:30:00.000Z" (= 26 Apr 00:00 IST)
const istMidnightUtc = (daysFromNow: number): string => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in ms
    // Current time shifted to IST so we can extract the IST calendar date
    const nowInIST = new Date(Date.now() + IST_OFFSET_MS);
    const y = nowInIST.getUTCFullYear();
    const m = nowInIST.getUTCMonth();
    const d = nowInIST.getUTCDate();
    // Midnight IST on target day = that day's 00:00 IST expressed in UTC
    const midnightIST = new Date(Date.UTC(y, m, d + daysFromNow, 0, 0, 0) - IST_OFFSET_MS);
    return midnightIST.toISOString();
};

const createInitialProgress = (levels: OnboardingLevelConfig[]): Record<string, OnboardingLevelProgress> => {
    // level-0 = the welcome screen (no steps, no quiz)
    const progress: Record<string, OnboardingLevelProgress> = {
        "level-0": {
            id: "level-0",
            status: "available",
            currentScore: 0,
            highScore: 0,
            totalSteps: 0,
            totalQuiz: 0,
            attempts: 0,
            lastStepIndex: 0,
            lastQuizIndex: 0,
        },
    };
    levels.forEach((level) => {
        const steps = onboardingStepsByLevel[level.id] ?? [];
        const quiz = onboardingQuizByLevel[level.id] ?? [];
        progress[level.id] = {
            id: level.id,
            // All real levels start locked — unlocked on a schedule when welcome completes
            status: "locked",
            currentScore: 0,
            highScore: 0,
            totalSteps: steps.length,
            totalQuiz: quiz.length,
            attempts: 0,
            lastStepIndex: 0,
            lastQuizIndex: 0,
        };
    });
    return progress;
};

const initialState: OnboardingState = {
    activeLevelId: undefined,
    levels: createInitialProgress(onboardingLevels),
    lastUpdatedAt: nowIso(),
};

type Action =
    | { type: "HYDRATE"; payload: Partial<OnboardingState> }
    | { type: "START_LEVEL"; levelId: string }
    | { type: "SET_STEP_INDEX"; levelId: string; index: number }
    | { type: "SET_QUIZ_INDEX"; levelId: string; index: number }
    | { type: "ANSWER_QUIZ"; levelId: string; currentScore: number }
    | { type: "COMPLETE_LEVEL"; levelId: string; score: number }
    | { type: "RESET_LEVEL"; levelId: string }
    | { type: "RESET_QUIZ"; levelId: string }
    | { type: "FAIL_QUIZ"; levelId: string; score: number; totalQuiz: number };

// Sync locked ↔ available for every real level based on two gates:
//   1. Date gate  — unlockedAt must exist and be in the past
//   2. Score gate — sum of all highScores must meet level.scoreRequired
// Both must be true to be available; failing either re-locks the level.
// Only touches "locked" and "available" states — never demotes in_progress/completed.
// Mutates `levels` in-place (caller spreads first).
const applyDateUnlocks = (
    levels: Record<string, OnboardingLevelProgress>,
    now: string,
) => {
    const overallHighScore = Object.values(levels).reduce(
        (sum, p) => sum + (p.highScore ?? 0),
        0,
    );

    onboardingLevels.forEach((level) => {
        const prog = levels[level.id];
        if (!prog) return;
        // Never touch in_progress or completed levels
        if (prog.status === "in_progress" || prog.status === "completed") return;

        const dateOk = !!prog.unlockedAt && prog.unlockedAt <= now;
        const scoreOk = overallHighScore >= (level.scoreRequired ?? 0);

        levels[level.id] = { ...prog, status: (dateOk && scoreOk) ? "available" : "locked" };
    });
};

const reducer = (state: OnboardingState, action: Action): OnboardingState => {
    switch (action.type) {

        // Merge state from localStorage or the API into the current in-memory state.
        // Called once on app load (from localStorage) and once after the API responds.
        // Uses "max wins" logic for every numeric/status field so that the most
        // advanced progress always takes precedence — prevents a stale local copy
        // from overwriting newer API data or vice-versa.
        case "HYDRATE": {
            const statusRank: Record<OnboardingLevelProgress["status"], number> = {
                locked: 0,
                available: 1,
                in_progress: 2,
                completed: 3,
            };

            const mergedLevels: Record<string, OnboardingLevelProgress> = { ...state.levels };

            if (action.payload.levels) {
                Object.entries(action.payload.levels).forEach(([levelId, incoming]) => {
                    const current = state.levels[levelId];
                    if (!current) {
                        // New level not in local state yet — take it as-is
                        mergedLevels[levelId] = incoming as OnboardingLevelProgress;
                        return;
                    }

                    const incomingLevel = incoming as OnboardingLevelProgress;
                    // Keep whichever status is further along
                    const mergedStatus =
                        statusRank[incomingLevel.status] >= statusRank[current.status]
                            ? incomingLevel.status
                            : current.status;

                    // Walk back past any prevDisable/rewindOnRefresh steps so we never resume
                    // inside an unopened modal after a reload or cross-device sync.
                    const rawStepIndex = Math.max(current.lastStepIndex, incomingLevel.lastStepIndex);
                    const levelSteps = onboardingStepsByLevel[levelId] ?? [];
                    let safeStepIndex = rawStepIndex;
                    while (safeStepIndex > 0) {
                        const s = levelSteps[safeStepIndex] as OnboardingStep | undefined;
                        if (!s?.prevDisable && !s?.rewindOnRefresh) break;
                        safeStepIndex -= 1;
                    }

                    mergedLevels[levelId] = {
                        ...current,
                        ...incomingLevel,
                        status: mergedStatus,
                        // Always recompute from source — stored values go stale when steps/quiz change
                        totalSteps: current.totalSteps,
                        totalQuiz: current.totalQuiz,
                        // Always keep the highest values to avoid going backwards
                        currentScore: Math.max(current.currentScore, incomingLevel.currentScore ?? 0),
                        attempts: Math.max(current.attempts, incomingLevel.attempts),
                        lastStepIndex: safeStepIndex,
                        lastQuizIndex: Math.max(current.lastQuizIndex, incomingLevel.lastQuizIndex),
                        highScore: Math.max(current.highScore, incomingLevel.highScore ?? 0),
                        // Keep whichever timestamp was set first
                        startedAt: current.startedAt || incomingLevel.startedAt,
                        completedAt: current.completedAt || incomingLevel.completedAt,
                    };
                });
            }

            // Unlock any level whose date has passed (date-only gate)
            applyDateUnlocks(mergedLevels, nowIso());

            return {
                ...state,
                ...action.payload,
                levels: mergedLevels,
                lastUpdatedAt: nowIso(),
            };
        }

        // Mark a level as in_progress and increment its attempt counter.
        // Only one level can be active at a time — any other level that is
        // currently in_progress is demoted back to available.
        // startedAt is set once on the very first attempt and never overwritten.
        case "START_LEVEL": {
            const level = state.levels[action.levelId];
            if (!level) return state;

            const updatedLevels: Record<string, OnboardingLevelProgress> = {};
            Object.entries(state.levels).forEach(([id, l]) => {
                if (id !== action.levelId && l.status === "in_progress") {
                    updatedLevels[id] = { ...l, status: "available" };
                } else {
                    updatedLevels[id] = l;
                }
            });

            return {
                ...state,
                activeLevelId: action.levelId,
                levels: {
                    ...updatedLevels,
                    [action.levelId]: {
                        ...level,
                        // Don't downgrade a completed level back to in_progress
                        status: level.status === "completed" ? "completed" : "in_progress",
                        attempts: level.attempts + 1,
                        startedAt: level.startedAt || nowIso(),
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        // Track which tour step the user is currently on.
        // When index reaches totalSteps the tour is considered complete and the
        // overlay will show the interlude screen before the quiz.
        case "SET_STEP_INDEX": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: { ...level, lastStepIndex: action.index },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        // Track which quiz question the user is currently on.
        // Used to resume mid-quiz if the user closes and reopens the overlay.
        case "SET_QUIZ_INDEX": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: { ...level, lastQuizIndex: action.index },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        // Update currentScore with the cumulative total after each answer.
        // Score is computed incrementally in the context function — no raw
        // answers need to be stored.
        case "ANSWER_QUIZ": {
            const level = state.levels[action.levelId];
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: { ...level, currentScore: action.currentScore },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        // Mark a level as completed and update the high score.
        // When level-0 (welcome) completes, stamps the full unlock schedule for all
        // real levels: level[i].unlockedAt = now + i*2 days (idempotent — skips
        // levels that already have a date).
        // After marking complete, runs an inline sync so any level whose date has
        // already passed is immediately flipped to available.
        case "COMPLETE_LEVEL": {
            const level = state.levels[action.levelId];
            if (!level) return state;

            const updatedLevels: Record<string, OnboardingLevelProgress> = {
                ...state.levels,
                [action.levelId]: {
                    ...level,
                    status: "completed",
                    highScore: Math.max(level.highScore, action.score),
                    completedAt: nowIso(),
                },
            };

            // Stamp the full unlock schedule when welcome completes.
            // level[i] unlocks at 00:00 IST on (today + i*2 days).
            // level-1 (index 0) → daysFromNow=0 → today's midnight IST (already past) → immediately available.
            // Stored as UTC: e.g. started 25 Apr → level-2 = 26 Apr 18:30 UTC (= 27 Apr 00:00 IST)
            if (action.levelId === "level-0") {
                onboardingLevels.forEach((lvl, index) => {
                    if (updatedLevels[lvl.id] && !updatedLevels[lvl.id].unlockedAt) {
                        updatedLevels[lvl.id] = {
                            ...updatedLevels[lvl.id],
                            unlockedAt: istMidnightUtc(index * 2),
                        };
                    }
                });
            }

            // Immediately flip any level whose unlock date has already passed
            applyDateUnlocks(updatedLevels, nowIso());

            return {
                ...state,
                activeLevelId: undefined,
                levels: updatedLevels,
                lastUpdatedAt: nowIso(),
            };
        }

        // Wipe step and quiz progress so the user can replay a level from scratch.
        // highScore is deliberately kept — a retry can't erase a previous best score.
        case "RESET_LEVEL": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: {
                        ...level,
                        status: "in_progress",
                        currentScore: 0,
                        lastStepIndex: 0,
                        lastQuizIndex: 0,
                        // highScore intentionally preserved
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        // Mark the quiz as finished-but-failed: stamp lastQuizIndex one past the end so
        // the overlay can detect the fail state on reload, and persist the final score.
        case "FAIL_QUIZ": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: {
                        ...level,
                        currentScore: action.score,
                        lastQuizIndex: action.totalQuiz, // >= quiz.length signals quiz done
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        // Reset only quiz progress (score + index) while preserving tour step progress.
        // Used by "Retry quiz" so the user re-takes the quiz without redoing the tour.
        case "RESET_QUIZ": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: {
                        ...level,
                        currentScore: 0,
                        lastQuizIndex: 0,
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }

        default:
            return state;
    }
};

const loadFromStorage = (): Partial<OnboardingState> | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as Partial<OnboardingState>;
    } catch {
        return null;
    }
};

const persistToStorage = (state: OnboardingState) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore storage errors
    }
};

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Initialize state directly from localStorage so the first render already has
    // the correct data — prevents the persist effect from briefly overwriting
    // saved progress with initialState before hydration fires.
    const [state, dispatch] = useReducer(reducer, undefined, () => {
        const stored = loadFromStorage();
        // HYDRATE already walks back prevDisable steps, so the returned state
        // is always safe to use directly.
        return stored
            ? reducer(initialState, { type: "HYDRATE", payload: stored })
            : initialState;
    });

    // Set to true only when a tour or level completes — triggers an API save
    const apiSyncNeededRef = useRef(false);
    const { isAuthenticated } = useAuth();

    // Always persist to localStorage; only push to API on tour/quiz completion
    useEffect(() => {
        persistToStorage(state);
        if (!isAuthenticated) return;
        if (apiSyncNeededRef.current) {
            apiSyncNeededRef.current = false;
            onboardingService.saveState(state);
        }
    }, [state, isAuthenticated]);

    const value = useMemo<OnboardingContextValue>(() => ({
        state,
        levels: onboardingLevels,
        getLevelProgress: (levelId) => state.levels[levelId],
        getSteps: (levelId) => onboardingStepsByLevel[levelId] || [],
        getQuiz: (levelId) => onboardingQuizByLevel[levelId] || [],
        startLevel: (levelId) => dispatch({ type: "START_LEVEL", levelId }),
        setStepIndex: (levelId, index) => {
            // Tour complete when index reaches the total — flag for API sync
            const totalSteps = state.levels[levelId]?.totalSteps ?? 0;
            if (totalSteps > 0 && index >= totalSteps) {
                apiSyncNeededRef.current = true;
            }
            dispatch({ type: "SET_STEP_INDEX", levelId, index });
        },
        setQuizIndex: (levelId, index) => dispatch({ type: "SET_QUIZ_INDEX", levelId, index }),
        answerQuiz: (levelId, questionId, choiceIndex) => {
            // Compute score incrementally: look up the question, check if correct,
            // add its points to the existing currentScore.
            const quiz = onboardingQuizByLevel[levelId] ?? [];
            const question = quiz.find((q) => q.id === questionId);
            const isCorrect = question ? choiceIndex === question.correctIndex : false;
            const prev = state.levels[levelId]?.currentScore ?? 0;
            const currentScore = prev + (isCorrect ? (question?.points ?? 0) : 0);
            dispatch({ type: "ANSWER_QUIZ", levelId, currentScore });
        },
        completeLevel: (levelId, score) => {
            apiSyncNeededRef.current = true;
            if (levelId === "level-8") {
                onboardingService.completeOnboarding();
            }
            dispatch({ type: "COMPLETE_LEVEL", levelId, score });
        },
        resetLevel: (levelId) => dispatch({ type: "RESET_LEVEL", levelId }),
        resetQuiz: (levelId) => dispatch({ type: "RESET_QUIZ", levelId }),
    }), [state]);

    return (
        <OnboardingContext.Provider value={value}>
            {children}
        </OnboardingContext.Provider>
    );
};

export const useOnboarding = () => {
    const context = useContext(OnboardingContext);
    if (!context) {
        throw new Error("useOnboarding must be used within an OnboardingProvider");
    }
    return context;
};
