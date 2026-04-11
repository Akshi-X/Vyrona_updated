import { Link } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";

export default function OnboardingStatus() {
    const { levels, state } = useOnboarding();

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg">
                <h2 className="text-xl font-semibold">Onboarding Status</h2>
                <p className="text-sm text-slate-600">Track your milestones and locked levels.</p>
            </div>
            <div className="space-y-4">
                {levels.map((level) => {
                    const progress = state.levels[level.id];
                    const status = progress?.status ?? "locked";
                    return (
                        <div key={level.id} className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{level.id}</p>
                                    <h3 className="text-lg font-semibold">{level.title}</h3>
                                    <p className="text-sm text-slate-500">Score: {progress?.score ?? 0}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">{status.replace("_", " ")}</p>
                                    {status === "completed" && progress?.completedAt && (
                                        <p className="text-xs text-slate-500">Completed at {new Date(progress.completedAt).toLocaleString()}</p>
                                    )}
                                    {status !== "completed" && (
                                        <Link
                                            to={level.route}
                                            className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-semibold text-slate-900"
                                        >
                                            View
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
