import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useAuth } from "../../contexts/AuthContext";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext } from "../../contexts/TourNavContext";
import OnboardingWelcome from "./Welcome";
import OnboardingTimeline from "./Timeline";
import LevelOverlay from "./LevelOverlay";
import LevelWelcomeCard from "./LevelWelcomeCard";

export default function OnboardingOverlay() {
    const location  = useLocation();
    const { onboardingCompleted } = useAuth();
    const { levels, getSteps, getQuiz, state, isHydrating } = useOnboarding();
    const overallScore = levels.reduce((sum, l) => sum + (state.levels[l.id]?.highScore ?? 0), 0);
    const { isOpen: isTourOpen } = useTour();
    const tourNavCtx = useTourNavContext();

    // Open on reload only when onboarding is still in progress (onboarding_completed = false in localStorage).
    // onboardingCompleted is seeded from localStorage synchronously by AuthContext before this renders.
    const [isOpen, setIsOpen] = useState(() =>
        onboardingCompleted === false && location.pathname.startsWith("/onboarding/")
    );
    const [showWelcome, setShowWelcome] = useState(false);
    const [showLevelWelcome, setShowLevelWelcome] = useState(false);
    const [levelWelcomeId, setLevelWelcomeId] = useState<string | null>(null);
    const [currentHeaderTitle, setCurrentHeaderTitle] = useState("Onboarding Mission Control");
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

    const activeLevelConfig = activeLevelId ? levels.find((l) => l.id === activeLevelId) : null;
    // When showing LevelOverlay (quiz/completion), prefer the quizLevel's title over the next active level
    const displayLevelConfig = quizLevelId ? levels.find((l) => l.id === quizLevelId) : activeLevelConfig;

    const level0Status = state.levels["level-0"]?.status;

    // Auto-open welcome on first dashboard landing (only if level-0 not yet completed and onboarding is still in progress)
    useEffect(() => {
        if (isHydrating) return;
        if (onboardingCompleted !== false) return;
        if (location.pathname === "/onboarding/dashboard" && level0Status !== "completed") {
            setShowWelcome(true);
            setIsOpen(true);
        }
    }, [location.pathname, level0Status, onboardingCompleted, isHydrating]);

    const [showTimeline, setShowTimeline] = useState(false);

    // Open quiz overlay when tour is complete — on reload (already true on mount)
    // AND on fresh completion (false → true transition).
    // Captures activeLevelId into quizLevelId BEFORE completeLevel can change activeLevelId.
    // Does NOT re-open if the user has already answered all quiz questions (pass or fail) —
    // that prevents the effect from overriding the Continue button on the fail screen.
    const prevTourCompleteRef = useRef(false);
    useEffect(() => {
        prevTourCompleteRef.current = tourComplete;
        if (onboardingCompleted !== false) return;
        if (tourComplete && activeLevelId && activeLevelProgress?.status !== "completed") {
            const quiz = getQuiz(activeLevelId);
            const quizAttempted = quiz.length > 0 && (activeLevelProgress?.lastQuizIndex ?? 0) >= quiz.length;
            if (quizAttempted) return;
            setQuizLevelId(activeLevelId);
            setShowWelcome(false);
            setShowTimeline(false);
            setIsOpen(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourComplete, activeLevelId, activeLevelProgress?.status, activeLevelProgress?.lastQuizIndex, onboardingCompleted]);

    // When level-0 transitions to completed, hide welcome and show level-1's welcome card.
    // On reload (already completed), just hide welcome without re-showing the card.
    useEffect(() => {
        if (level0Status === "completed") {
            setShowWelcome(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level0Status]);

    const handleStartTour = () => {
        setShowWelcome(false);
        setShowTimeline(true);
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
            const cfg = levels.find((l) => l.id === levelWelcomeId);
            const title = cfg?.welcome?.headerTitle ?? "Tour";
            if (currentHeaderTitle !== title) setCurrentHeaderTitle(title);
            return <LevelWelcomeCard levelId={levelWelcomeId} onBeginTour={handleBeginTourFromWelcome} />;
        }
        // Quiz / completion screen — shown for the captured level even after activeLevelId changes
        if (quizLevelId) {
            return (
                <LevelOverlay
                    levelId={quizLevelId}
                    onComplete={() => { setQuizLevelId(null); setShowTimeline(true); setCurrentHeaderTitle("Onboarding Mission Control"); }}
                    onHeaderTitle={setCurrentHeaderTitle}
                />
            );
        }
        if (currentHeaderTitle !== "Onboarding Mission Control") setCurrentHeaderTitle("Onboarding Mission Control");
        if (showTimeline) {
            return (
                <OnboardingTimeline
                    onStart={() => { setShowTimeline(false); setIsOpen(false); }}
                    onStartWelcome={(id) => { setShowTimeline(false); handleStartWelcome(id); }}
                    onResumeToQuiz={handleResumeToQuiz}
                />
            );
        }
        if (showWelcome || level0Status !== "completed") {
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
                    <div className="relative w-full max-w-xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">

                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs uppercase tracking-[0.3em] ${(quizLevelId || showLevelWelcome) ? "text-[#6b1176]" : "text-slate-400"}`}>
                                    {(quizLevelId || showLevelWelcome) ? currentHeaderTitle : "Immersive Journey"}
                                </p>
                                <h2 className="text-lg font-semibold">{(quizLevelId || showLevelWelcome) ? displayLevelConfig?.title ?? "Onboarding Mission Control" : "Onboarding Mission Control"}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 rounded-full bg-[#6b1176] px-3 py-1">
                                    <Zap className="h-3 w-3 text-violet-200" fill="currentColor" />
                                    <span className="text-sm font-bold text-white">{overallScore}</span>
                                    <span className="text-[10px] font-semibold text-violet-300">pts</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (quizLevelId) {
                                            setQuizLevelId(null);
                                            setShowTimeline(true);
                                        } else if (showLevelWelcome) {
                                            setShowLevelWelcome(false);
                                            setLevelWelcomeId(null);
                                            setShowTimeline(true);
                                        } else {
                                            setIsOpen(false);
                                        }
                                    }}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                                >
                                    {quizLevelId || showLevelWelcome ? "← Timeline" : "Close"}
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="mt-6 max-h-[70vh] overflow-y-auto pr-2">
                            {isHydrating ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#6b1176] border-t-transparent" />
                                </div>
                            ) : renderContent()}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
