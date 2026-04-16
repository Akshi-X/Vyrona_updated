import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import OnboardingWelcome from "./Welcome";
import OnboardingTimeline from "./Timeline";
import OnboardingStatus from "./Status";
import LevelOverlay from "./LevelOverlay";

type Tab = "welcome" | "timeline" | "status";

const TABS: { id: Tab; label: string }[] = [
    { id: "welcome",  label: "Welcome"  },
    { id: "timeline", label: "Timeline" },
    { id: "status",   label: "Status"   },
];

const isLevelRoute = (pathname: string) => pathname.includes("/onboarding/level-");

const pathnameToTab = (pathname: string): Tab => {
    if (pathname === "/onboarding/timeline") return "timeline";
    if (pathname === "/onboarding/status")   return "status";
    return "welcome";
};

export default function OnboardingOverlay() {
    const location  = useLocation();
    const navigate  = useNavigate();
    const { levels, getSteps, state } = useOnboarding();
    const { isOpen: isTourOpen } = useTour();

    const [isOpen, setIsOpen]   = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>(pathnameToTab(location.pathname));

    const currentLevelId = useMemo(() => {
        const match = levels.find((level) => location.pathname.includes(level.id));
        return match?.id;
    }, [levels, location.pathname]);

    const currentLevelProgress = currentLevelId ? state.levels[currentLevelId] : undefined;
    const currentLevelSteps    = currentLevelId ? getSteps(currentLevelId) : [];
    const tourComplete = currentLevelId
        ? currentLevelSteps.length > 0 && (currentLevelProgress?.lastStepIndex ?? 0) >= currentLevelSteps.length
        : false;

    // Auto-open overlay on welcome route or when a level tour finishes
    useEffect(() => {
        if (location.pathname === "/onboarding/welcome") {
            setIsOpen(true);
        }
        if (isLevelRoute(location.pathname) && tourComplete && currentLevelProgress?.status !== "completed") {
            setIsOpen(true);
        }
    }, [location.pathname, tourComplete, currentLevelProgress?.status]);

    // Sync active tab when route changes from outside the overlay
    useEffect(() => {
        if (!isLevelRoute(location.pathname)) {
            setActiveTab(pathnameToTab(location.pathname));
        }
    }, [location.pathname]);

    const handleTabClick = (tab: Tab) => {
        setActiveTab(tab);
        navigate(`/onboarding/${tab}`);
    };

    const renderContent = () => {
        if (currentLevelId && isLevelRoute(location.pathname)) {
            return <LevelOverlay levelId={currentLevelId} />;
        }
        switch (activeTab) {
            case "timeline": return <OnboardingTimeline />;
            case "status":   return <OnboardingStatus />;
            default:         return <OnboardingWelcome />;
        }
    };

    // Hide while the tour popover is actively open and not yet complete
    if (isLevelRoute(location.pathname) && !tourComplete && isTourOpen) {
        return null;
    }

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

                        {/* Tab selector */}
                        <div className="mt-4 flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleTabClick(tab.id)}
                                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                                        activeTab === tab.id && !isLevelRoute(location.pathname)
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
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
