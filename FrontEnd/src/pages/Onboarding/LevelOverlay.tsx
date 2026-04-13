import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useOnboarding } from "../../contexts/OnboardingContext";

interface LevelOverlayProps {
    levelId: string;
}

export default function LevelOverlay({ levelId }: LevelOverlayProps) {
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

    const steps = getSteps(levelId);
    const quiz = getQuiz(levelId);
    const progress = getLevelProgress(levelId);
    const quizIndex = progress?.lastQuizIndex ?? 0;
    const [quizResult, setQuizResult] = useState<"pass" | "fail" | null>(null);

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

        if (score >= (levelConfig?.pointsRequired ?? 0)) {
            completeLevel(levelId, score);
            logEvent({ type: "quiz_pass", levelId, payload: { score } });
            setQuizResult("pass");
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
        return (
            <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">Almost there</h3>
                <p className="text-sm text-slate-600">Retry the tour to earn more points.</p>
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
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Tour in progress</h3>
                <p className="text-sm text-slate-600">Follow the highlighted prompts to continue.</p>
            </div>
        );
    }

    if (isCompleted || quizResult === "pass") {
        return (
            <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">Level complete!</h3>
                <p className="text-sm text-slate-600">You have unlocked the next mission.</p>
                <Link
                    to="/onboarding/status"
                    className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                    View status
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
