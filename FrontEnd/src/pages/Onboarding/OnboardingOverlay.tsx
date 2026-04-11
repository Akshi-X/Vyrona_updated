import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";
import OnboardingWelcome from "./Welcome";
import OnboardingTimeline from "./Timeline";
import OnboardingStatus from "./Status";
import LevelOverlay from "./LevelOverlay";

const isLevelRoute = (pathname: string) => pathname.includes("/onboarding/level-");

export default function OnboardingOverlay() {
    const location = useLocation();
    const { levels, getSteps, state } = useOnboarding();
    const [isOpen, setIsOpen] = useState(false);

    const currentLevelId = useMemo(() => {
        const match = levels.find((level) => location.pathname.includes(level.id));
        return match?.id;
    }, [levels, location.pathname]);

    const currentLevelProgress = currentLevelId ? state.levels[currentLevelId] : undefined;
    const currentLevelSteps = currentLevelId ? getSteps(currentLevelId) : [];
    const tourComplete = currentLevelId
        ? currentLevelSteps.length > 0 && (currentLevelProgress?.lastStepIndex ?? 0) >= currentLevelSteps.length
        : false;

    useEffect(() => {
        if (location.pathname === "/onboarding/welcome") {
            setIsOpen(true);
        }
        if (isLevelRoute(location.pathname) && tourComplete && currentLevelProgress?.status !== "completed") {
            setIsOpen(true);
        }
    }, [location.pathname, tourComplete, currentLevelProgress?.status]);

    const renderContent = () => {
        if (location.pathname === "/onboarding/welcome") {
            return <OnboardingWelcome />;
        }
        if (location.pathname === "/onboarding/timeline") {
            return <OnboardingTimeline />;
        }
        if (location.pathname === "/onboarding/status") {
            return <OnboardingStatus />;
        }
        if (currentLevelId) {
            return <LevelOverlay levelId={currentLevelId} />;
        }
        return <OnboardingWelcome />;
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="fixed right-6 top-6 z-40 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg"
            >
                Onboarding
            </button>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 p-6">
                    <div className="relative w-full max-w-xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Immersive Journey</p>
                                <h2 className="text-lg font-semibold">Onboarding Mission Control</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold"
                            >
                                Close
                            </button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            <Link
                                to="/onboarding/welcome"
                                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                            >
                                Welcome
                            </Link>
                            <Link
                                to="/onboarding/timeline"
                                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                            >
                                Timeline
                            </Link>
                            <Link
                                to="/onboarding/status"
                                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                            >
                                Status
                            </Link>
                            {isLevelRoute(location.pathname) && currentLevelId && (
                                <span className="rounded-full bg-slate-900 px-3 py-1 text-white">
                                    {currentLevelId}
                                </span>
                            )}
                        </div>
                        <div className="mt-6 max-h-[70vh] overflow-y-auto pr-2">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
