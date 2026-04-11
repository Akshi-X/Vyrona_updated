import { Link } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";

export default function OnboardingTimeline() {
    const { levels, state, syncUnlocks } = useOnboarding();

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">Timeline</h2>
                        <p className="text-sm text-slate-600">Your level progression and upcoming unlocks.</p>
                    </div>
                    <button
                        type="button"
                        onClick={syncUnlocks}
                        className="rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-semibold"
                    >
                        Refresh
                    </button>
                </div>
            </div>
            <div className="space-y-4">
                {levels.map((level) => {
                    const progress = state.levels[level.id];
                    const status = progress?.status ?? "locked";
                    return (
                        <div
                            key={level.id}
                            className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{level.id}</p>
                                    <h3 className="text-lg font-semibold">{level.title}</h3>
                                    <p className="text-sm text-slate-500">Points required: {level.pointsRequired}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">{status.replace("_", " ")}</p>
                                    {progress?.unlockedAt && status === "locked" && (
                                        <p className="text-xs text-slate-500">Unlocks at {new Date(progress.unlockedAt).toLocaleString()}</p>
                                    )}
                                    {status === "available" && (
                                        <Link
                                            to={level.route}
                                            className="mt-2 inline-flex rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold text-white"
                                        >
                                            Start
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
