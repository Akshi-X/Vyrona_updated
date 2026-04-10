import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type {
    OnboardingEvent,
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
    advanceWelcome: () => void;
    startLevel: (levelId: string) => void;
    setStepIndex: (levelId: string, index: number) => void;
    setQuizIndex: (levelId: string, index: number) => void;
    answerQuiz: (levelId: string, questionId: string, choiceIndex: number) => void;
    completeLevel: (levelId: string, score: number) => void;
    resetLevel: (levelId: string) => void;
    syncUnlocks: () => void;
    logEvent: (event: Omit<OnboardingEvent, "id" | "timestamp">) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

const STORAGE_KEY = "onboarding_state_v1";

const nowIso = () => new Date().toISOString();

const createInitialProgress = (levels: OnboardingLevelConfig[]): Record<string, OnboardingLevelProgress> => {
    const progress: Record<string, OnboardingLevelProgress> = {};
    levels.forEach((level, index) => {
        progress[level.id] = {
            id: level.id,
            status: index === 0 ? "available" : "locked",
            score: 0,
            attempts: 0,
            lastStepIndex: 0,
            lastQuizIndex: 0,
        };
    });
    return progress;
};

const initialState: OnboardingState = {
    welcomeStage: 0,
    activeLevelId: undefined,
    levels: createInitialProgress(onboardingLevels),
    quizAnswers: {},
    events: [],
    lastUpdatedAt: nowIso(),
};

type Action =
    | { type: "HYDRATE"; payload: Partial<OnboardingState> }
    | { type: "ADVANCE_WELCOME" }
    | { type: "START_LEVEL"; levelId: string }
    | { type: "SET_STEP_INDEX"; levelId: string; index: number }
    | { type: "SET_QUIZ_INDEX"; levelId: string; index: number }
    | { type: "ANSWER_QUIZ"; levelId: string; questionId: string; choiceIndex: number }
    | { type: "COMPLETE_LEVEL"; levelId: string; score: number; unlockNextAt?: string }
    | { type: "RESET_LEVEL"; levelId: string }
    | { type: "SYNC_UNLOCKS"; now: string }
    | { type: "LOG_EVENT"; event: OnboardingEvent };

const reducer = (state: OnboardingState, action: Action): OnboardingState => {
    switch (action.type) {
        case "HYDRATE": {
            const statusRank: Record<OnboardingLevelProgress["status"], number> = {
                locked: 0,
                available: 1,
                in_progress: 2,
                completed: 3,
            };

            const mergedLevels: Record<string, OnboardingLevelProgress> = {
                ...state.levels,
            };

            if (action.payload.levels) {
                Object.entries(action.payload.levels).forEach(([levelId, incoming]) => {
                    const current = state.levels[levelId];
                    if (!current) {
                        mergedLevels[levelId] = incoming as OnboardingLevelProgress;
                        return;
                    }

                    const incomingLevel = incoming as OnboardingLevelProgress;
                    const mergedStatus =
                        statusRank[incomingLevel.status] >= statusRank[current.status]
                            ? incomingLevel.status
                            : current.status;

                    mergedLevels[levelId] = {
                        ...current,
                        ...incomingLevel,
                        status: mergedStatus,
                        attempts: Math.max(current.attempts, incomingLevel.attempts),
                        lastStepIndex: Math.max(current.lastStepIndex, incomingLevel.lastStepIndex),
                        lastQuizIndex: Math.max(current.lastQuizIndex, incomingLevel.lastQuizIndex),
                        score: Math.max(current.score, incomingLevel.score),
                        startedAt: current.startedAt || incomingLevel.startedAt,
                        completedAt: current.completedAt || incomingLevel.completedAt,
                    };
                });
            }

            console.log("[onboarding] hydrate", {
                activeLevelId: action.payload.activeLevelId,
                levels: action.payload.levels,
            });
            return {
                ...state,
                ...action.payload,
                levels: {
                    ...mergedLevels,
                },
                quizAnswers: {
                    ...state.quizAnswers,
                    ...action.payload.quizAnswers,
                },
                events: action.payload.events || state.events,
                lastUpdatedAt: nowIso(),
            };
        }
        case "ADVANCE_WELCOME": {
            return {
                ...state,
                welcomeStage: Math.min(state.welcomeStage + 1, 2),
                lastUpdatedAt: nowIso(),
            };
        }
        case "START_LEVEL": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                activeLevelId: action.levelId,
                levels: {
                    ...state.levels,
                    [action.levelId]: {
                        ...level,
                        status: level.status === "completed" ? "completed" : "in_progress",
                        attempts: level.attempts + 1,
                        startedAt: level.startedAt || nowIso(),
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }
        case "SET_STEP_INDEX": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            console.log("[onboarding] set step index", {
                levelId: action.levelId,
                from: level.lastStepIndex,
                to: action.index,
            });
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: {
                        ...level,
                        lastStepIndex: action.index,
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }
        case "SET_QUIZ_INDEX": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            return {
                ...state,
                levels: {
                    ...state.levels,
                    [action.levelId]: {
                        ...level,
                        lastQuizIndex: action.index,
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }
        case "ANSWER_QUIZ": {
            const answersForLevel = state.quizAnswers[action.levelId] || {};
            return {
                ...state,
                quizAnswers: {
                    ...state.quizAnswers,
                    [action.levelId]: {
                        ...answersForLevel,
                        [action.questionId]: action.choiceIndex,
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }
        case "COMPLETE_LEVEL": {
            const level = state.levels[action.levelId];
            if (!level) return state;
            const nextLevelId = onboardingLevels.find((item, index) => {
                const currentIndex = onboardingLevels.findIndex((config) => config.id === action.levelId);
                return index === currentIndex + 1;
            })?.id;

            const updatedLevels: Record<string, OnboardingLevelProgress> = {
                ...state.levels,
                [action.levelId]: {
                    ...level,
                    status: "completed",
                    score: action.score,
                    completedAt: nowIso(),
                },
            };

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
                        lastStepIndex: 0,
                        lastQuizIndex: 0,
                        score: 0,
                    },
                },
                lastUpdatedAt: nowIso(),
            };
        }
        case "SYNC_UNLOCKS": {
            const now = action.now;
            const updatedLevels = { ...state.levels };
            Object.values(updatedLevels).forEach((level) => {
                if (level.status === "locked" && level.unlockedAt && level.unlockedAt <= now) {
                    level.status = "available";
                }
            });
            return {
                ...state,
                levels: updatedLevels,
                lastUpdatedAt: nowIso(),
            };
        }
        case "LOG_EVENT": {
            return {
                ...state,
                events: [...state.events, action.event],
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
    const [state, dispatch] = useReducer(reducer, initialState);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastEventIndexRef = useRef(0);
    const didHydrateFromStorageRef = useRef(false);
    const didHydrateFromApiRef = useRef(false);
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (didHydrateFromStorageRef.current) return;
        const storedState = loadFromStorage();
        if (storedState) {
            dispatch({ type: "HYDRATE", payload: storedState });
        }
        didHydrateFromStorageRef.current = true;
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }
        if (didHydrateFromApiRef.current) {
            return;
        }
        (async () => {
            const remoteState = await onboardingService.getState();
            if (remoteState) {
                console.log("[onboarding] hydrate from api", {
                    activeLevelId: remoteState.activeLevelId,
                    levels: remoteState.levels,
                });
                dispatch({ type: "HYDRATE", payload: remoteState });
            }
            didHydrateFromApiRef.current = true;
        })();
    }, [isAuthenticated]);

    useEffect(() => {
        persistToStorage(state);
        if (!isAuthenticated) {
            return;
        }
        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
            onboardingService.saveState(state);
        }, 600);
    }, [state, isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }
        const newEvents = state.events.slice(lastEventIndexRef.current);
        if (newEvents.length > 0) {
            onboardingService.appendEvents(newEvents);
            lastEventIndexRef.current = state.events.length;
        }
    }, [state.events, isAuthenticated]);

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
        advanceWelcome: () => dispatch({ type: "ADVANCE_WELCOME" }),
        startLevel: (levelId) => dispatch({ type: "START_LEVEL", levelId }),
        setStepIndex: (levelId, index) => dispatch({ type: "SET_STEP_INDEX", levelId, index }),
        setQuizIndex: (levelId, index) => dispatch({ type: "SET_QUIZ_INDEX", levelId, index }),
        answerQuiz: (levelId, questionId, choiceIndex) =>
            dispatch({ type: "ANSWER_QUIZ", levelId, questionId, choiceIndex }),
        completeLevel: (levelId, score) => {
            const levelIndex = onboardingLevels.findIndex((level) => level.id === levelId);
            const nextLevel = onboardingLevels[levelIndex + 1];
            const unlockAt = nextLevel
                ? new Date(Date.now() + nextLevel.unlockDelayHours * 60 * 60 * 1000).toISOString()
                : undefined;

            dispatch({ type: "COMPLETE_LEVEL", levelId, score, unlockNextAt: unlockAt });
        },
        resetLevel: (levelId) => dispatch({ type: "RESET_LEVEL", levelId }),
        syncUnlocks: () => dispatch({ type: "SYNC_UNLOCKS", now: nowIso() }),
        logEvent: (event) => {
            dispatch({
                type: "LOG_EVENT",
                event: {
                    ...event,
                    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    timestamp: nowIso(),
                },
            });
        },
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
