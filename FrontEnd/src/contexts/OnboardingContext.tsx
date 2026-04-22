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
    syncUnlocks: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

const STORAGE_KEY = "onboarding_state_v1";

const nowIso = () => new Date().toISOString();

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
            status: "available",
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
    | { type: "COMPLETE_LEVEL"; levelId: string; score: number; unlockNextAt?: string }
    | { type: "RESET_LEVEL"; levelId: string }
    | { type: "SYNC_UNLOCKS"; now: string };

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

                    mergedLevels[levelId] = {
                        ...current,
                        ...incomingLevel,
                        status: mergedStatus,
                        // Always keep the highest values to avoid going backwards
                        currentScore: incomingLevel.currentScore ?? current.currentScore,
                        attempts: Math.max(current.attempts, incomingLevel.attempts),
                        lastStepIndex: Math.max(current.lastStepIndex, incomingLevel.lastStepIndex),
                        lastQuizIndex: Math.max(current.lastQuizIndex, incomingLevel.lastQuizIndex),
                        highScore: Math.max(current.highScore, incomingLevel.highScore ?? 0),
                        // Keep whichever timestamp was set first
                        startedAt: current.startedAt || incomingLevel.startedAt,
                        completedAt: current.completedAt || incomingLevel.completedAt,
                    };
                });
            }

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
        // Also stamps unlockedAt on the next level in sequence so the
        // SYNC_UNLOCKS timer can flip it to available after the delay expires.
        case "COMPLETE_LEVEL": {
            const level = state.levels[action.levelId];
            if (!level) return state;

            const nextLevelId = onboardingLevels.find((_item, index) => {
                const currentIndex = onboardingLevels.findIndex((config) => config.id === action.levelId);
                return index === currentIndex + 1;
            })?.id;

            const updatedLevels: Record<string, OnboardingLevelProgress> = {
                ...state.levels,
                [action.levelId]: {
                    ...level,
                    status: "completed",
                    // Keep the highest score ever — retrying can't lower it
                    highScore: Math.max(level.highScore, action.score),
                    completedAt: nowIso(),
                },
            };

            // Stamp the next level with its unlock time (may be immediate if delay = 0)
            if (nextLevelId && updatedLevels[nextLevelId]) {
                updatedLevels[nextLevelId] = {
                    ...updatedLevels[nextLevelId],
                    unlockedAt: action.unlockNextAt,
                };
            }

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

        // Run periodically (every 60 s) to flip any locked level whose unlockedAt
        // timestamp has passed to available, respecting the unlockDelayHours config.
        case "SYNC_UNLOCKS": {
            const now = action.now;
            const updatedLevels = { ...state.levels };
            Object.values(updatedLevels).forEach((level) => {
                if (level.status === "locked" && level.unlockedAt && level.unlockedAt <= now) {
                    level.status = "available";
                }
            });
            return { ...state, levels: updatedLevels, lastUpdatedAt: nowIso() };
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
        if (stored) {
            return reducer(initialState, { type: "HYDRATE", payload: stored });
        }
        return initialState;
    });

    const didHydrateFromApiRef = useRef(false);
    // Set to true only when a tour or level completes — triggers an API save
    const apiSyncNeededRef = useRef(false);
    const { isAuthenticated } = useAuth();

    // Fetch from API once authenticated and merge — API is source of truth for
    // cross-device sync; localStorage is the fast local cache on reload.
    useEffect(() => {
        if (!isAuthenticated || didHydrateFromApiRef.current) return;
        (async () => {
            const remoteState = await onboardingService.getState();
            if (remoteState) {
                dispatch({ type: "HYDRATE", payload: remoteState });
            }
            didHydrateFromApiRef.current = true;
        })();
    }, [isAuthenticated]);

    // Always persist to localStorage; only push to API on tour/quiz completion
    useEffect(() => {
        persistToStorage(state);
        if (!isAuthenticated) return;
        if (apiSyncNeededRef.current) {
            apiSyncNeededRef.current = false;
            onboardingService.saveState(state);
        }
    }, [state, isAuthenticated]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            dispatch({ type: "SYNC_UNLOCKS", now: nowIso() });
        }, 60_000);
        return () => window.clearInterval(interval);
    }, []);

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
            const levelIndex = onboardingLevels.findIndex((level) => level.id === levelId);
            const nextLevel = onboardingLevels[levelIndex + 1];
            const unlockAt = nextLevel
                ? new Date(Date.now() + nextLevel.unlockDelayHours * 60 * 60 * 1000).toISOString()
                : undefined;
            dispatch({ type: "COMPLETE_LEVEL", levelId, score, unlockNextAt: unlockAt });
        },
        resetLevel: (levelId) => dispatch({ type: "RESET_LEVEL", levelId }),
        syncUnlocks: () => dispatch({ type: "SYNC_UNLOCKS", now: nowIso() }),
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
