import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext } from "../../contexts/TourNavContext";
import OnboardingWelcome from "./Welcome";
import OnboardingTimeline from "./Timeline";
import LevelOverlay from "./LevelOverlay";
import LevelWelcomeCard from "./LevelWelcomeCard";

export default function OnboardingOverlay() {
    const location  = useLocation();
    const { levels, getSteps, state } = useOnboarding();
    const { isOpen: isTourOpen } = useTour();
    const tourNavCtx = useTourNavContext();

    const [isOpen, setIsOpen] = useState(() => location.pathname.startsWith("/onboarding/"));
    const [showWelcome, setShowWelcome] = useState(false);
    const [showLevelWelcome, setShowLevelWelcome] = useState(false);
    const [levelWelcomeId, setLevelWelcomeId] = useState<string | null>(null);
    // Tracks which level's quiz/completion screen to show.
    // Kept separately so it survives activeLevelId changing after completeLevel fires.
    // Initialized synchronously from persisted state so there is no timeline flash on reload.
    const [quizLevelId, setQuizLevelId] = useState<string | null>(() => {
        const inProgress = levels.find((l) => state.levels[l.id]?.status === "in_progress");
        if (!inProgress) return null;
        const prog = state.levels[inProgress.id];
        if (prog?.status === "completed") return null;
        const steps = getSteps(inProgress.id);
        const isTourDone = steps.length > 0 && (prog?.lastStepIndex ?? 0) >= steps.length;
        return isTourDone ? inProgress.id : null;
    });

    // Lock scroll while tour is active — covers body AND inner scrollable elements
    useEffect(() => {
        if (!isTourOpen) return;

        const prevent = (e: Event) => e.preventDefault();

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("wheel", prevent, { passive: false });
        document.addEventListener("touchmove", prevent, { passive: false });

        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener("wheel", prevent);
            document.removeEventListener("touchmove", prevent);
        };
    }, [isTourOpen]);

    // Mutable ref so the openOverlay closure (registered once) can read live quiz state
    const quizStateRef = useRef({ tourComplete: false, activeLevelId: null as string | null, status: undefined as string | undefined });

    // Register openOverlay so the tour close button can open this panel
    useEffect(() => {
        tourNavCtx?.setOpenOverlay(() => {
            setShowWelcome(false);
            setShowLevelWelcome(false);
            const { tourComplete: tc, activeLevelId: alid, status } = quizStateRef.current;
            if (tc && alid && status !== "completed") {
                setQuizLevelId(alid);
                setShowTimeline(false);
            }
            setIsOpen(true);
        });
        return () => { tourNavCtx?.setOpenOverlay(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Active level = the one that is in_progress (or available as fallback)
    const activeLevelId = useMemo(() => {
        const inProgress = levels.find((l) => state.levels[l.id]?.status === "in_progress");
        if (inProgress) return inProgress.id;
        const available = levels.find((l) => state.levels[l.id]?.status === "available");
        return available?.id ?? null;
    }, [levels, state.levels]);

    const activeLevelProgress = activeLevelId ? state.levels[activeLevelId] : undefined;
    const activeLevelSteps    = activeLevelId ? getSteps(activeLevelId) : [];
    const tourComplete = activeLevelId
        ? activeLevelSteps.length > 0 && (activeLevelProgress?.lastStepIndex ?? 0) >= activeLevelSteps.length
        : false;

    // Keep ref in sync so openOverlay closure always reads current values
    quizStateRef.current = { tourComplete, activeLevelId, status: activeLevelProgress?.status };

    const level0Status = state.levels["level-0"]?.status;

    // Auto-open welcome on first dashboard landing (only if level-0 not yet completed)
    useEffect(() => {
        if (location.pathname === "/onboarding/dashboard" && level0Status !== "completed") {
            setShowWelcome(true);
            setIsOpen(true);
        }
    }, [location.pathname, level0Status]);

    const [showTimeline, setShowTimeline] = useState(false);

    // Open quiz overlay when tour is complete — on reload (already true on mount)
    // AND on fresh completion (false → true transition).
    // Captures activeLevelId into quizLevelId BEFORE completeLevel can change activeLevelId.
    const prevTourCompleteRef = useRef(false);
    useEffect(() => {
        prevTourCompleteRef.current = tourComplete;
        if (tourComplete && activeLevelId && activeLevelProgress?.status !== "completed") {
            setQuizLevelId(activeLevelId);
            setShowWelcome(false);
            setShowTimeline(false);
            setIsOpen(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourComplete, activeLevelId, activeLevelProgress?.status]);

    // When level-0 transitions to completed, hide welcome and show level-1's welcome card.
    // On reload (already completed), just hide welcome without re-showing the card.
    const prevLevel0StatusRef = useRef(level0Status);
    useEffect(() => {
        const prev = prevLevel0StatusRef.current;
        prevLevel0StatusRef.current = level0Status;

        if (level0Status === "completed") {
            setShowWelcome(false);
            if (prev !== "completed") {
                // Fresh completion — show the first real level's welcome card
                const firstLevel = levels.find((l) => l.id !== "level-0");
                if (firstLevel && state.levels[firstLevel.id]?.status !== "completed") {
                    setLevelWelcomeId(firstLevel.id);
                    setShowLevelWelcome(true);
                    setShowTimeline(false);
                    setIsOpen(true);
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level0Status]);

    const handleStartTour = () => {
        tourNavCtx?.startTour?.();
        setIsOpen(false);
    };

    const handleStartWelcome = (levelId: string) => {
        setLevelWelcomeId(levelId);
        setShowLevelWelcome(true);
        setShowWelcome(false);
        setShowTimeline(false);
        setIsOpen(true);
    };

    const handleResumeToQuiz = (levelId: string) => {
        setQuizLevelId(levelId);
        setShowTimeline(false);
        setIsOpen(true);
    };

    const handleBeginTourFromWelcome = () => {
        if (levelWelcomeId) {
            tourNavCtx?.setPendingStartLevelId(levelWelcomeId);
        }
        setShowLevelWelcome(false);
        setLevelWelcomeId(null);
        setIsOpen(false);
    };

    const renderContent = () => {
        if (showLevelWelcome && levelWelcomeId) {
            return <LevelWelcomeCard levelId={levelWelcomeId} onBeginTour={handleBeginTourFromWelcome} />;
        }
        // Quiz / completion screen — shown for the captured level even after activeLevelId changes
        if (quizLevelId) {
            return (
                <LevelOverlay
                    levelId={quizLevelId}
                    onComplete={() => { setQuizLevelId(null); setShowTimeline(true); }}
                />
            );
        }
        if (showTimeline) {
            return (
                <OnboardingTimeline
                    onStart={() => { setShowTimeline(false); setIsOpen(false); }}
                    onStartWelcome={(id) => { setShowTimeline(false); handleStartWelcome(id); }}
                    onResumeToQuiz={handleResumeToQuiz}
                />
            );
        }
        if (showWelcome) {
            return <OnboardingWelcome onStart={handleStartTour} />;
        }
        return (
            <OnboardingTimeline
                onStart={() => setIsOpen(false)}
                onStartWelcome={handleStartWelcome}
                onResumeToQuiz={handleResumeToQuiz}
            />
        );
    };

    // Hide the floating button and panel while tour is actively running
    if (!tourComplete && isTourOpen) {
        return null;
    }

    return (
        <>
            {!isTourOpen && (
                <button
                    type="button"
                    onClick={() => { setShowWelcome(false); setShowLevelWelcome(false); setIsOpen(true); }}
                    className="fixed top-0 left-1/2 -translate-x-1/2 z-40 rounded-b-2xl bg-slate-900/90 backdrop-blur-sm px-8 py-2.5 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] border border-t-0 border-white/10 tracking-wide"
                >
                    Onboarding
                </button>
            )}

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
                    <div className="relative w-full max-w-xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">

                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Immersive Journey</p>
                                <h2 className="text-lg font-semibold">Onboarding Mission Control</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (quizLevelId) {
                                        // Exit quiz/interlude → show timeline instead of closing
                                        setQuizLevelId(null);
                                        setShowTimeline(true);
                                    } else {
                                        setIsOpen(false);
                                    }
                                }}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                {quizLevelId ? "← Timeline" : "Close"}
                            </button>
                        </div>

                        {/* Content */}
                        <div className="mt-6 max-h-[70vh] overflow-y-auto pr-2">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
