import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTour } from "@reactour/tour";
import confetti from "canvas-confetti";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext } from "../../contexts/TourNavContext";

interface LevelOverlayProps {
    levelId: string;
    onComplete?: () => void;
    onHeaderTitle?: (title: string) => void;
}

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

export default function LevelOverlay({ levelId, onComplete, onHeaderTitle }: LevelOverlayProps) {
    const {
        levels,
        getSteps,
        getQuiz,
        getLevelProgress,
        answerQuiz,
        setQuizIndex,
        completeLevel,
        resetLevel,
        resetQuiz,
    } = useOnboarding();

    const navigate = useNavigate();
    const { setIsOpen: setTourOpen } = useTour();
    const tourNavCtx = useTourNavContext();
    const steps = getSteps(levelId);
    const quiz = getQuiz(levelId);
    const progress = getLevelProgress(levelId);
    const quizIndex = progress?.lastQuizIndex ?? 0;
    const isCompleted = progress?.status === "completed";

    const [quizResult, setQuizResult] = useState<"pass" | "fail" | null>(null);
    const [lastScore, setLastScore] = useState<number>(0);

    // Fire confetti only on a fresh quiz pass, not when revisiting a completed level
    useEffect(() => {
        if (quizResult !== "pass") return;

        const isLastLevel = levels.length > 0 && levelId === levels[levels.length - 1].id;
        const colors = ["var(--color-primary)", "#a855f7", "#ffffff", "#f9a8d4", "#fbbf24", "#34d399"];

        if (isLastLevel) {
            // Grand finale — centre burst + sustained side cannons for 5 s
            confetti({ particleCount: 180, spread: 100, origin: { y: 0.5 }, colors, startVelocity: 45, gravity: 0.9, scalar: 1.2 });
            setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { x: 0.2, y: 0.6 }, angle: 75, colors, startVelocity: 40 }), 250);
            setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { x: 0.8, y: 0.6 }, angle: 105, colors, startVelocity: 40 }), 400);

            const end = Date.now() + 5000;
            const frame = () => {
                confetti({ particleCount: 10, angle: 60, spread: 70, origin: { x: 0 }, colors });
                confetti({ particleCount: 10, angle: 120, spread: 70, origin: { x: 1 }, colors });
                if (Date.now() < end) requestAnimationFrame(frame);
            };
            setTimeout(frame, 600);
        } else {
            const end = Date.now() + 2200;
            const frame = () => {
                confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors });
                confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors });
                if (Date.now() < end) requestAnimationFrame(frame);
            };
            frame();
        }
    }, [quizResult, levelId]);

    // Reveal state — set when user clicks an answer, cleared when advancing
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isRevealed, setIsRevealed] = useState(false);

    const tourComplete = steps.length > 0 && (progress?.lastStepIndex ?? 0) >= steps.length;

    const [showInterlude, setShowInterlude] = useState(() => quizIndex === 0 && !isCompleted);

const levelConfig = levels.find((level) => level.id === levelId);
    const isLastLevelId = levels.length > 0 && levelId === levels[levels.length - 1].id;
    const currentQuestion = quiz[quizIndex];

    // Notify parent of the current section so the overlay header can update
    useEffect(() => {
        if (!onHeaderTitle) return;
        if (isCompleted) {
            onHeaderTitle(levelConfig?.completion?.headerTitle ?? "Quiz Scorecard");
        } else if (quizResult === "fail") {
            onHeaderTitle(levelConfig?.quiz?.headerTitle ?? "Quiz");
        } else if (showInterlude) {
            onHeaderTitle(levelConfig?.interlude?.headerTitle ?? "Tour");
        } else {
            onHeaderTitle(levelConfig?.quiz?.headerTitle ?? "Quiz");
        }
    }, [isCompleted, quizResult, showInterlude, onHeaderTitle, levelConfig]);

    const handleAnswer = (choiceIndex: number) => {
        if (!currentQuestion || isRevealed) return;

        setSelectedIndex(choiceIndex);
        setIsRevealed(true);

        const isCorrect = choiceIndex === currentQuestion.correctIndex;
        const newScore = (progress?.currentScore ?? 0) + (isCorrect ? currentQuestion.points : 0);

        // Delay advancing so the user sees the green/red feedback
        setTimeout(() => {
            setSelectedIndex(null);
            setIsRevealed(false);

            answerQuiz(levelId, currentQuestion.id, choiceIndex);

            if (quizIndex + 1 < quiz.length) {
                setQuizIndex(levelId, quizIndex + 1);
                return;
            }

            setLastScore(newScore);
            // Always complete the level — score is tracked for highScore but never blocks progress
            completeLevel(levelId, newScore);
            if (newScore >= (levelConfig?.pointsRequired ?? 0)) {
                setQuizResult("pass");
            } else {
                setQuizResult("fail");
            }
        }, 900);
    };

    const handleRetry = () => {
        resetLevel(levelId);
        setQuizResult(null);
        setSelectedIndex(null);
        setIsRevealed(false);
        tourNavCtx?.setPendingStartLevelId(levelId);
        onComplete?.();
    };

    const handleRetryQuiz = () => {
        resetQuiz(levelId);
        setQuizResult(null);
        setSelectedIndex(null);
        setIsRevealed(false);
        setShowInterlude(true);
    };

    // ── Fail screen ─────────────────────────────────────────────────────────
    if (quizResult === "fail") {
        const maxScore = quiz.reduce((sum, q) => sum + q.points, 0);
        const needed = levelConfig?.pointsRequired ?? 0;
        const pct = maxScore > 0 ? Math.round((lastScore / maxScore) * 100) : 0;

        return (
            <div className="space-y-4">
                <div>
                    <p className="text-sm text-slate-500">Retry the tour to earn more points.</p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em]">Your Score</p>
                            <p className="mt-0.5 text-3xl font-bold text-slate-900">
                                {lastScore}
                                <span className="ml-1 text-base font-normal text-slate-400">/ {maxScore}</span>
                            </p>
                            {(progress?.highScore ?? 0) > 0 && (
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Best: <span className="font-semibold text-slate-600">{progress?.highScore} pts</span>
                                </p>
                            )}
                        </div>
                        <p className="text-2xl font-bold text-slate-700">{pct}%</p>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                            className="h-full rounded-full bg-amber-400 transition-all duration-700"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <p className="text-[11px] text-slate-400">
                        Need <span className="font-semibold text-slate-600">{needed} pts</span> to pass —{" "}
                        <span className="font-semibold text-amber-600">{needed - lastScore} more needed</span>
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                        Retry tour
                    </button>
                    <button
                        type="button"
                        onClick={handleRetryQuiz}
                        className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                        Retry quiz
                    </button>
                    <button
                        type="button"
                        onClick={() => onComplete?.()}
                        className="inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                    >
                        Continue →
                    </button>
                </div>
            </div>
        );
    }

    // ── Tour still in progress ───────────────────────────────────────────────
    if (!tourComplete) {
        return (
            <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">Tour in progress</h3>
                <p className="text-sm text-slate-600">Follow the highlighted prompts to complete the tour.</p>
                <button
                    type="button"
                    onClick={() => setTourOpen(true)}
                    className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                    Resume tour →
                </button>
            </div>
        );
    }

    // ── Interlude (between tour and quiz) ────────────────────────────────────
    if (showInterlude && !isCompleted && quizResult === null) {
        const interlude = levelConfig?.interlude;
        return (
            <div className="space-y-6">
                <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-slate-900">
                        {interlude?.title ?? "Tour complete!"}
                    </h3>
                    {interlude?.message && (
                        <p className="text-sm text-slate-500">{interlude.message}</p>
                    )}
                </div>

                {interlude?.covered && interlude.covered.length > 0 && (
                    <ul className="space-y-2">
                        {interlude.covered.map((item) => (
                            <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white font-bold">✓</span>
                                {item}
                            </li>
                        ))}
                    </ul>
                )}

                <button
                    type="button"
                    onClick={() => {
                        // Quiz temporarily disabled: skip straight to completion. Records
                        // pointsRequired as the level's score so the completion card reads
                        // as a full pass (unlocks are date-only, not score-gated).
                        if (quiz.length === 0) {
                            completeLevel(levelId, levelConfig?.pointsRequired ?? 0);
                        } else {
                            setShowInterlude(false);
                        }
                    }}
                    className="inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
                >
                    {quiz.length === 0 ? "Finish →" : "Start Quiz →"}
                </button>
            </div>
        );
    }

    // ── Completion screen ────────────────────────────────────────────────────
    if (isCompleted || quizResult === "pass") {
        const maxScore = quiz.reduce((sum, q) => sum + q.points, 0);
        const latestScore = quizResult === "pass" ? lastScore : (progress?.currentScore ?? 0);
        const pct = maxScore > 0 ? Math.round((latestScore / maxScore) * 100) : 0;
        const completion = levelConfig?.completion;

        return (
            <div className="space-y-5">
                <div className="flex items-start gap-4">
                    {completion?.badge && (
                        <span className="text-5xl leading-none">{completion.badge}</span>
                    )}
                    <div className="space-y-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                            {isLastLevelId ? "Onboarding Complete 🎓" : "Level complete"}
                        </p>
                        <h3 className="text-xl font-semibold text-slate-900">
                            {completion?.title ?? levelConfig?.title}
                        </h3>
                        {completion?.message && (
                            <p className="text-sm text-slate-600 leading-relaxed">{completion.message}</p>
                        )}
                    </div>
                </div>

                {maxScore > 0 && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em]">Quiz Score</p>
                                <p className="mt-0.5 text-3xl font-bold text-slate-900">
                                    {latestScore}
                                    <span className="ml-1 text-base font-normal text-slate-400">/ {maxScore}</span>
                                </p>
                                {(progress?.highScore ?? 0) > latestScore && (
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Best: <span className="font-semibold text-slate-600">{progress?.highScore} pts</span>
                                    </p>
                                )}
                            </div>
                            <p className="text-2xl font-bold text-slate-700">{pct}%</p>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                                className="h-full rounded-full bg-slate-900 transition-all duration-700"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                            <span>Pass threshold: {levelConfig?.pointsRequired} pts</span>
                            <span className="font-semibold text-green-600">Passed ✓</span>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                        Retry tour
                    </button>
                    {maxScore > 0 && (
                        <button
                            type="button"
                            onClick={handleRetryQuiz}
                            className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            Retry quiz
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => isLastLevelId ? navigate("/dashboard") : onComplete?.()}
                        className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                        {isLastLevelId ? "Go to Dashboard →" : "Continue →"}
                    </button>
                </div>
            </div>
        );
    }

    if (!currentQuestion) {
        return (
            <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">Quiz ready</h3>
                <p className="text-sm text-slate-600">Start the quiz to complete the level.</p>
            </div>
        );
    }

    // ── Quiz question ────────────────────────────────────────────────────────
    const maxScore = quiz.reduce((sum, q) => sum + q.points, 0);
    const currentScore = progress?.currentScore ?? 0;
    const scorePct = maxScore > 0 ? Math.round((currentScore / maxScore) * 100) : 0;

    return (
        <div className="space-y-5">

            {/* Header: question counter + live score */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    {quiz.map((_, i) => (
                        <span
                            key={i}
                            className={`block rounded-full transition-all duration-300 ${
                                i < quizIndex
                                    ? "h-2 w-2 bg-slate-900"
                                    : i === quizIndex
                                      ? "h-2 w-5 bg-slate-900"
                                      : "h-2 w-2 bg-slate-200"
                            }`}
                        />
                    ))}
                </div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.2em]">
                    {quizIndex + 1} / {quiz.length}
                </span>
            </div>

            {/* Points badge + question */}
            <div className="space-y-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                    ⚡ {currentQuestion.points} pts
                </span>
                <p className="text-[15px] font-semibold text-slate-900 leading-snug">
                    {currentQuestion.prompt}
                </p>
            </div>

            {/* Answer options */}
            <div className="grid gap-2.5">
                {currentQuestion.choices.map((choice, index) => {
                    const isCorrect = index === currentQuestion.correctIndex;
                    const isSelected = index === selectedIndex;

                    let style = "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 cursor-pointer";
                    let labelStyle = "bg-slate-100 text-slate-500";
                    let icon: string | null = null;

                    if (isRevealed) {
                        if (isCorrect) {
                            style = "border-emerald-400 bg-emerald-50 text-emerald-900 cursor-default";
                            labelStyle = "bg-emerald-400 text-white";
                            icon = "✓";
                        } else if (isSelected) {
                            style = "border-red-400 bg-red-50 text-red-900 cursor-default";
                            labelStyle = "bg-red-400 text-white";
                            icon = "✕";
                        } else {
                            style = "border-slate-100 bg-slate-50 text-slate-400 cursor-default opacity-50";
                            labelStyle = "bg-slate-200 text-slate-400";
                        }
                    }

                    return (
                        <button
                            key={choice}
                            type="button"
                            disabled={isRevealed}
                            onClick={() => handleAnswer(index)}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-sm transition-all duration-200 ${style}`}
                        >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-200 ${labelStyle}`}>
                                {isRevealed && icon ? icon : OPTION_LABELS[index]}
                            </span>
                            <span className="flex-1 leading-snug">{choice}</span>
                        </button>
                    );
                })}
            </div>

            {/* Live score bar */}
            <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Score so far</span>
                    <span className="font-semibold text-slate-600">{currentScore} / {maxScore} pts</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                        className="h-full rounded-full bg-slate-900 transition-all duration-500"
                        style={{ width: `${scorePct}%` }}
                    />
                </div>
            </div>

        </div>
    );
}
