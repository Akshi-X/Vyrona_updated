import { Outlet, Link, useLocation } from "react-router-dom";
import { TourProvider } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";

export default function OnboardingLayout() {
    const { levels, state } = useOnboarding();
    const location = useLocation();
    const completedCount = levels.filter((level) => state.levels[level.id]?.status === "completed").length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F6F0FF] via-[#FDF9F2] to-[#F2FBFF] text-slate-900">
            <header className="flex items-center justify-between px-6 py-4 md:px-10">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Onboarding Quest</p>
                    <h1 className="text-2xl font-semibold">Immersive Journey</h1>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="rounded-full bg-white/70 px-3 py-1 shadow-sm">
                        {completedCount}/{levels.length} levels complete
                    </span>
                    {location.pathname !== "/onboarding/status" && (
                        <Link
                            to="/onboarding/status"
                            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 shadow-sm hover:border-slate-300"
                        >
                            Status
                        </Link>
                    )}
                </div>
            </header>
            <main className="px-6 pb-10 md:px-10">
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
            </main>
        </div>
    );
}
