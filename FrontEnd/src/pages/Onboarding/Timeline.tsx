import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext } from "../../contexts/TourNavContext";
import { useTour } from "@reactour/tour";

interface OnboardingTimelineProps {
    onStart?: () => void;
}

export default function OnboardingTimeline({ onStart }: OnboardingTimelineProps) {
    const { levels, state, getQuiz, resetLevel } = useOnboarding();
    const tourNavCtx = useTourNavContext();
    const { setCurrentStep } = useTour();
    const navigate = useNavigate();

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="px-1">
                <h2 className="text-base font-semibold">Timeline</h2>
                <p className="text-xs text-slate-500">Your level progression and upcoming unlocks.</p>
            </div>
            <div className="space-y-4">
                {levels.map((level) => {
                    const progress = state.levels[level.id];
                    const status = progress?.status ?? "locked";
                    const quiz = getQuiz(level.id);
                    const answers = state.quizAnswers?.[level.id] || {};
                    const quizScore = quiz.reduce((sum, q) => {
                        return answers[q.id] === q.correctIndex ? sum + q.points : sum;
                    }, 0);
                    const currentScore = Math.max(progress?.score ?? 0, quizScore);
                    const pointsRequired = level.pointsRequired ?? 0;
                    const remaining = Math.max(pointsRequired - currentScore, 0);

                    return (
                        <div
                            key={level.id}
                            className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="space-y-0.5">
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{level.id}</p>
                                    <h3 className="text-base font-semibold">{level.title}</h3>
                                    <p className="text-xs text-slate-500">Current points: {currentScore} / {pointsRequired}</p>
                                    <p className="text-xs text-slate-500">Quiz points scored: {quizScore}</p>
                                    <p className="text-xs text-slate-500">Points remaining: {remaining}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-slate-900">{status.replace("_", " ")}</p>
                                    {progress?.unlockedAt && status === "locked" && (
                                        <p className="text-xs text-slate-500">Unlocks at {new Date(progress.unlockedAt).toLocaleString()}</p>
                                    )}
                                    {status === "completed" && !levels.some((l) => state.levels[l.id]?.status === "in_progress") && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                resetLevel(level.id);
                                                setCurrentStep(0);
                                                tourNavCtx?.setPendingStartLevelId(level.id);
                                                navigate(level.route);
                                                onStart?.();
                                            }}
                                            className="mt-2 inline-flex rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                        >
                                            Play Again
                                        </button>
                                    )}
                                    {(status === "available" || status === "in_progress") && (() => {
                                        const anyInProgress = levels.some(
                                            (l) => l.id !== level.id && (state.levels[l.id]?.status === "in_progress"),
                                        );
                                        if (status === "available" && anyInProgress) {
                                            return (
                                                <p className="mt-2 text-[11px] text-amber-600 font-medium max-w-[140px] text-right">
                                                    Complete the in-progress level first
                                                </p>
                                            );
                                        }
                                        return (
                                            <div className="mt-2 flex flex-col items-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        tourNavCtx?.setPendingStartLevelId(level.id);
                                                        navigate(level.route);
                                                        onStart?.();
                                                    }}
                                                    className="inline-flex rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold text-white"
                                                >
                                                    {status === "in_progress" ? "Resume →" : "Start"}
                                                </button>
                                                {status === "in_progress" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            resetLevel(level.id);
                                                            setCurrentStep(0);
                                                            tourNavCtx?.setPendingStartLevelId(level.id);
                                                            navigate(level.route);
                                                            onStart?.();
                                                        }}
                                                        className="inline-flex rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                                    >
                                                        Start Over
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
