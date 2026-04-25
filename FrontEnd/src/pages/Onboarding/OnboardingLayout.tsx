import { Outlet, Link, useLocation } from "react-router-dom";
import { TourProvider } from "@reactour/tour";
import { useEffect } from "react";
import { OnboardingModeProvider } from "../../contexts/OnboardingModeContext";
import { disableOnboardingMocks, enableOnboardingMocks } from "../../onboarding/mockApi";
import { useOnboarding } from "../../contexts/OnboardingContext";

export default function OnboardingLayout() {
    const { levels, state } = useOnboarding();
    const location = useLocation();
    const completedCount = levels.filter((level) => state.levels[level.id]?.status === "completed").length;
    const overallScore = levels.reduce((sum, l) => sum + (state.levels[l.id]?.highScore ?? 0), 0);

    useEffect(() => {
        enableOnboardingMocks();
        return () => {
            disableOnboardingMocks();
        };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F6F0FF] via-[#FDF9F2] to-[#F2FBFF] text-slate-900">
            <header className="flex items-center justify-between px-6 py-4 md:px-10">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Onboarding Quest</p>
                    <h1 className="text-2xl font-semibold">Immersive Journey</h1>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-1.5 rounded-full bg-white/70 border border-slate-200/60 px-3 py-1.5 shadow-sm">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Score</span>
                        <span className="text-sm font-bold text-slate-900">{overallScore} pts</span>
                    </div>
                    <div className="rounded-full bg-white/70 border border-slate-200/60 px-3 py-1.5 shadow-sm text-[11px] font-semibold text-slate-500">
                        {completedCount}/{levels.length} levels
                    </div>
                    {location.pathname !== "/onboarding/status" && (
                        <Link
                            to="/onboarding/status"
                            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm hover:border-slate-300 hover:bg-white"
                        >
                            Status
                        </Link>
                    )}
                </div>
            </header>
            <main className="px-6 pb-10 md:px-10">
                <OnboardingModeProvider value={true}>
                    <TourProvider
                        steps={[]}
                        disableInteraction={false}
                        styles={{
                            popover: (base) => ({
                                ...base,
                                borderRadius: 16,
                                padding: 16,
                            }),
                        }}
                    >
                        <Outlet />
                    </TourProvider>
                </OnboardingModeProvider>
            </main>
        </div>
    );
}
