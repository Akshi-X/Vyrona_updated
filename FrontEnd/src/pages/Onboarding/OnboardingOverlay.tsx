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

    const [isOpen, setIsOpen] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const [showLevelWelcome, setShowLevelWelcome] = useState(false);
    const [levelWelcomeId, setLevelWelcomeId] = useState<string | null>(null);

    // Register openOverlay so the tour close button can open this panel
    useEffect(() => {
        tourNavCtx?.setOpenOverlay(() => {
            setShowWelcome(false);
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

    const level1Status = state.levels["level-1"]?.status;

    // Auto-open welcome on first dashboard landing
    useEffect(() => {
        if (location.pathname === "/onboarding/dashboard" && level1Status === "available") {
            setShowWelcome(true);
            setIsOpen(true);
        }
    }, [location.pathname, level1Status]);

    const [showTimeline, setShowTimeline] = useState(false);

    // Only open quiz overlay when tourComplete transitions false → true (not on mount/navigation)
    const prevTourCompleteRef = useRef(tourComplete);
    useEffect(() => {
        const justCompleted = tourComplete && !prevTourCompleteRef.current;
        prevTourCompleteRef.current = tourComplete;
        if (justCompleted && activeLevelProgress?.status !== "completed") {
            setShowWelcome(false);
            setShowTimeline(false);
            setIsOpen(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourComplete, activeLevelProgress?.status]);

    // Once tour starts, drop welcome view
    useEffect(() => {
        if (level1Status !== "available" && level1Status !== undefined) {
            setShowWelcome(false);
        }
    }, [level1Status]);

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
        if (showTimeline) {
            return (
                <OnboardingTimeline
                    onStart={() => { setShowTimeline(false); setIsOpen(false); }}
                    onStartWelcome={(id) => { setShowTimeline(false); handleStartWelcome(id); }}
                />
            );
        }
        if (activeLevelId && tourComplete) {
            return <LevelOverlay levelId={activeLevelId} onComplete={() => { setShowTimeline(true); }} />;
        }
        if (showWelcome) {
            return <OnboardingWelcome onStart={handleStartTour} />;
        }
        return (
            <OnboardingTimeline
                onStart={() => setIsOpen(false)}
                onStartWelcome={handleStartWelcome}
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
                    className="fixed right-6 top-6 z-40 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg"
                >
                    Onboarding
                </button>
            )}

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 p-6">
                    <div className="relative w-full max-w-xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">

                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Immersive Journey</p>
                                <h2 className="text-lg font-semibold">Onboarding Mission Control</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Close
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
