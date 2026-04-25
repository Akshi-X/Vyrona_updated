import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext } from "../../contexts/TourNavContext";
import { useTour } from "@reactour/tour";
import { Lock } from "lucide-react";

interface OnboardingTimelineProps {
    onStart?: () => void;
    onStartWelcome?: (levelId: string) => void;
    onResumeToQuiz?: (levelId: string) => void;
}

const STATUS_CONFIG = {
    completed:   { dot: "bg-emerald-500", ring: "ring-emerald-200", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Completed", icon: "✓" },
    in_progress: { dot: "bg-amber-400 animate-pulse", ring: "ring-amber-200", badge: "bg-amber-50 text-amber-700 border-amber-200", label: "In Progress", icon: "→" },
    available:   { dot: "bg-slate-300", ring: "ring-slate-100", badge: "bg-slate-50 text-slate-600 border-slate-200", label: "Available", icon: "○" },
    locked:      { dot: "bg-slate-200", ring: "ring-slate-100", badge: "bg-slate-50 text-slate-400 border-slate-200", label: "Locked", icon: "⚿" },
};

export default function OnboardingTimeline({ onStart, onStartWelcome, onResumeToQuiz }: OnboardingTimelineProps) {
    const { levels, state, resetLevel, getSteps } = useOnboarding();
    const tourNavCtx = useTourNavContext();
    const { setCurrentStep } = useTour();
    const navigate = useNavigate();

    const anyInProgress = levels.some((l) => state.levels[l.id]?.status === "in_progress");
    const activeLevel = levels.find((l) => state.levels[l.id]?.status === "in_progress");
    const activeLevelProgress = activeLevel ? state.levels[activeLevel.id] : undefined;
    const activeTourComplete = activeLevel && activeLevelProgress
        ? (() => {
            const steps = getSteps(activeLevel.id);
            return steps.length > 0 && (activeLevelProgress.lastStepIndex ?? 0) >= steps.length;
          })()
        : false;

    return (
        <div className="space-y-1">
            {/* ── Ongoing Mission ─────────────────────────────────────── */}
            {activeLevel && activeLevelProgress && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500 mb-1">
                        Ongoing Mission
                    </p>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">{activeLevel.title}</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">{activeLevel.id}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                navigate(activeLevel.route);
                                if (activeTourComplete && onResumeToQuiz) {
                                    // Tour done — open the quiz overlay directly
                                    onResumeToQuiz(activeLevel.id);
                                } else {
                                    tourNavCtx?.setPendingStartLevelId(activeLevel.id);
                                    onStart?.();
                                }
                            }}
                            className="shrink-0 inline-flex rounded-full bg-amber-500 px-4 py-1.5 text-[11px] font-semibold text-white shadow-sm"
                        >
                            {activeTourComplete ? "Take Quiz →" : "Resume →"}
                        </button>
                    </div>
                    {/* Step / quiz progress bar */}
                    {activeLevelProgress.totalSteps > 0 && (() => {
                        const stepsDone = Math.min(activeLevelProgress.lastStepIndex, activeLevelProgress.totalSteps);
                        const pct = Math.round((stepsDone / activeLevelProgress.totalSteps) * 100);
                        return (
                            <div className="mt-3 space-y-1">
                                <div className="flex justify-between text-[10px] text-amber-600">
                                    <span>Tour progress</span>
                                    <span className="font-semibold">{stepsDone} / {activeLevelProgress.totalSteps} steps</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
                                    <div
                                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}


            <div className="mb-5">
                <h2 className="text-sm font-semibold text-slate-900">Your Progress</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Complete each level to unlock the next.</p>
            </div>

            <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-3 bottom-3 w-px bg-slate-200" />

                <div className="space-y-2">
                    {levels.map((level, idx) => {
                        const progress = state.levels[level.id];
                        const status = (progress?.status ?? "locked") as keyof typeof STATUS_CONFIG;
                        const cfg = STATUS_CONFIG[status];
                        const highScore = progress?.highScore ?? 0;
                        const pointsRequired = level.pointsRequired ?? 0;
                        const pct = pointsRequired > 0 ? Math.min(Math.round((highScore / pointsRequired) * 100), 100) : 0;
                        const isLocked = status === "locked";
                        const isCompleted = status === "completed";
                        const isAvailable = status === "available";
                        const isInProgress = status === "in_progress";

                        // Per-level tour completion — determines whether Resume opens tour or quiz
                        const levelSteps = getSteps(level.id);
                        const levelTourComplete = levelSteps.length > 0 && (progress?.lastStepIndex ?? 0) >= levelSteps.length;

                        const unlockDate = progress?.unlockedAt
                            ? new Date(progress.unlockedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                            : null;

                        return (
                            <div key={level.id} className="relative flex gap-4">
                                {/* Dot */}
                                <div className={`relative z-10 mt-3.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ring-4 ${cfg.ring} ${cfg.dot}`}>
                                    {isCompleted && (
                                        <span className="text-[9px] font-bold text-white">✓</span>
                                    )}
                                </div>

                                {/* Card */}
                                <div className={`flex-1 rounded-2xl border px-4 py-3 transition-all ${
                                    isLocked
                                        ? "border-slate-100 bg-slate-50/50 opacity-60"
                                        : isCompleted
                                          ? "border-emerald-100 bg-white"
                                          : isInProgress
                                            ? "border-amber-200 bg-amber-50/30"
                                            : "border-slate-200 bg-white"
                                }`}>
                                    <div className="flex items-start justify-between gap-3">
                                        {/* Left: title + meta */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                    {level.id}
                                                </p>
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.badge}`}>
                                                    {cfg.label}
                                                </span>
                                            </div>
                                            <h3 className={`mt-0.5 text-sm font-semibold ${isLocked ? "text-slate-400" : "text-slate-900"}`}>
                                                {level.title}
                                            </h3>

                                            {/* Progress bar — only for non-locked */}
                                            {!isLocked && (
                                                <div className="mt-2 space-y-1">
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ${
                                                                isCompleted ? "bg-emerald-400" : isInProgress ? "bg-amber-400" : "bg-slate-300"
                                                            }`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-slate-400">
                                                        <span>
                                                            {highScore > 0
                                                                ? `Best: ${highScore} / ${pointsRequired} pts`
                                                                : `${pointsRequired} pts to pass`}
                                                        </span>
                                                        {pct > 0 && (
                                                            <span className={`font-semibold ${isCompleted ? "text-emerald-600" : "text-slate-500"}`}>
                                                                {pct}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Unlock hint */}
                                            {isLocked && unlockDate && (
                                                <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-slate-100/80 px-3 py-1.5">
                                                    <Lock className="h-3 w-3 shrink-0 text-slate-400" />
                                                    <p className="text-[10px] font-semibold text-slate-500">
                                                        Unlocks on {unlockDate}
                                                    </p>
                                                </div>
                                            )}
                                            {isLocked && !unlockDate && (
                                                <p className="mt-1 text-[10px] text-slate-400">
                                                    Complete the welcome to unlock
                                                </p>
                                            )}
                                        </div>

                                        {/* Right: action buttons */}
                                        <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                                            {isCompleted && !anyInProgress && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        resetLevel(level.id);
                                                        setCurrentStep(0);
                                                        navigate(level.route);
                                                        if (onStartWelcome) {
                                                            onStartWelcome(level.id);
                                                        } else {
                                                            tourNavCtx?.setPendingStartLevelId(level.id);
                                                            onStart?.();
                                                        }
                                                    }}
                                                    className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                                                >
                                                    ↩ Replay
                                                </button>
                                            )}

                                            {(isAvailable || isInProgress) && (() => {
                                                if (isAvailable && anyInProgress) {
                                                    return (
                                                        <p className="text-[10px] text-amber-600 font-medium max-w-[120px] text-right leading-tight">
                                                            Finish current level first
                                                        </p>
                                                    );
                                                }
                                                return (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                navigate(level.route);
                                                                if (isInProgress && levelTourComplete && onResumeToQuiz) {
                                                                    onResumeToQuiz(level.id);
                                                                } else if (isAvailable && onStartWelcome) {
                                                                    onStartWelcome(level.id);
                                                                } else {
                                                                    tourNavCtx?.setPendingStartLevelId(level.id);
                                                                    onStart?.();
                                                                }
                                                            }}
                                                            className="inline-flex rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-semibold text-white shadow-sm"
                                                        >
                                                            {isInProgress && levelTourComplete ? "Take Quiz →" : isInProgress ? "Resume →" : "Start →"}
                                                        </button>
                                                        {isInProgress && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    resetLevel(level.id);
                                                                    setCurrentStep(0);
                                                                    navigate(level.route);
                                                                    if (onStartWelcome) {
                                                                        onStartWelcome(level.id);
                                                                    } else {
                                                                        tourNavCtx?.setPendingStartLevelId(level.id);
                                                                        onStart?.();
                                                                    }
                                                                }}
                                                                className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                                                            >
                                                                Start Over
                                                            </button>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
