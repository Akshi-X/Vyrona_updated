import { Link } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useNavigate } from "react-router-dom";

export default function OnboardingStatus() {
    const { levels, state, resetLevel } = useOnboarding();
    const navigate = useNavigate();

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="px-1">
                <h2 className="text-base font-semibold">Onboarding Status</h2>
                <p className="text-xs text-slate-500">Track your milestones and locked levels.</p>
            </div>
            <div className="space-y-4">
                {levels.map((level) => {
                    const progress = state.levels[level.id];
                    const status = progress?.status ?? "locked";
                    const highScore = progress?.highScore ?? 0;
                    const pointsRequired = level.pointsRequired ?? 0;
                    const remainingPoints = Math.max(pointsRequired - highScore, 0);
                    return (
                        <div key={level.id} className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{level.id}</p>
                                    <h3 className="text-lg font-semibold">{level.title}</h3>
                                    <p className="text-sm text-slate-500">High score: {highScore} / {pointsRequired}</p>
                                    <p className="text-sm text-slate-500">Points remaining: {remainingPoints}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">{status.replace("_", " ")}</p>
                                    {status === "completed" && progress?.completedAt && (
                                        <p className="text-xs text-slate-500">Completed at {new Date(progress.completedAt).toLocaleString()}</p>
                                    )}
                                    {status === "completed" && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                resetLevel(level.id);
                                                navigate(level.route);
                                            }}
                                            className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-semibold text-slate-900 hover:border-slate-300"
                                        >
                                            Play again
                                        </button>
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
