import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";

interface LevelOverlayProps {
    levelId: string;
    onComplete?: () => void;
}

export default function LevelOverlay({ levelId, onComplete }: LevelOverlayProps) {
    const {
        levels,
        state,
        getSteps,
        getQuiz,
        getLevelProgress,
        answerQuiz,
        setQuizIndex,
        completeLevel,
        resetLevel,
        logEvent,
    } = useOnboarding();

    const { setIsOpen: setTourOpen } = useTour();
    const steps = getSteps(levelId);
    const quiz = getQuiz(levelId);
    const progress = getLevelProgress(levelId);
    const quizIndex = progress?.lastQuizIndex ?? 0;
    const [quizResult, setQuizResult] = useState<"pass" | "fail" | null>(null);
    const [lastScore, setLastScore] = useState<number>(0);

    const tourComplete = steps.length > 0 && (progress?.lastStepIndex ?? 0) >= steps.length;
    const isCompleted = progress?.status === "completed";

    const answerMap = useMemo(() => {
        return state.quizAnswers[levelId] || {};
    }, [state.quizAnswers, levelId]);

    const levelConfig = levels.find((level) => level.id === levelId);

    const currentQuestion = quiz[quizIndex];

    const handleAnswer = (choiceIndex: number) => {
        if (!currentQuestion) return;
        answerQuiz(levelId, currentQuestion.id, choiceIndex);
        logEvent({ type: "quiz_answer", levelId, payload: { questionId: currentQuestion.id, choiceIndex } });

        if (quizIndex + 1 < quiz.length) {
            setQuizIndex(levelId, quizIndex + 1);
            return;
        }

        const score = quiz.reduce((sum, question) => {
            const resolved = question.id === currentQuestion.id
                ? choiceIndex
                : answerMap?.[question.id];
            return resolved === question.correctIndex ? sum + question.points : sum;
        }, 0);

        setLastScore(score);
        if (score >= (levelConfig?.pointsRequired ?? 0)) {
            completeLevel(levelId, score);
            logEvent({ type: "quiz_pass", levelId, payload: { score } });
            setQuizResult("pass");
            onComplete?.();
        } else {
            logEvent({ type: "quiz_fail", levelId, payload: { score } });
            setQuizResult("fail");
        }
    };

    const handleRetry = () => {
        resetLevel(levelId);
        logEvent({ type: "tour_retry", levelId });
        setQuizResult(null);
    };

    if (quizResult === "fail") {
        const maxScore = quiz.reduce((sum, q) => sum + q.points, 0);
        const needed = levelConfig?.pointsRequired ?? 0;
        const pct = maxScore > 0 ? Math.round((lastScore / maxScore) * 100) : 0;

        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Almost there</h3>
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

                <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                    Retry tour
                </button>
            </div>
        );
    }

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

    if (isCompleted || quizResult === "pass") {
        const maxScore = quiz.reduce((sum, q) => sum + q.points, 0);
        const finalScore = progress?.score ?? 0;
        const pct = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0;

        return (
            <div className="space-y-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Level complete</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{levelConfig?.title}</h3>
                </div>

                {/* Score card */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em]">Quiz Score</p>
                            <p className="mt-0.5 text-3xl font-bold text-slate-900">
                                {finalScore}
                                <span className="ml-1 text-base font-normal text-slate-400">/ {maxScore}</span>
                            </p>
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

                <Link
                    to="/onboarding/status"
                    className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                    View status →
                </Link>
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

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Quick Quiz</h3>
            <p className="text-sm text-slate-600">{currentQuestion.prompt}</p>
            <div className="grid gap-3">
                {currentQuestion.choices.map((choice, index) => (
                    <button
                        key={choice}
                        type="button"
                        onClick={() => handleAnswer(index)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800 shadow-sm hover:border-slate-300"
                    >
                        {choice}
                    </button>
                ))}
            </div>
            <p className="text-xs text-slate-500">Question {quizIndex + 1} of {quiz.length}</p>
            <button
                type="button"
                onClick={handleRetry}
                className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900"
            >
                Retry tour
            </button>
        </div>
    );
}
