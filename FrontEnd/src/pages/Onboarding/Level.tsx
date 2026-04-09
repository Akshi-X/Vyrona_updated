import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import ReplicaDashboard from "./ReplicaDashboard";
import ReplicaControlTower from "./ReplicaControlTower";

interface OnboardingLevelProps {
    levelId: string;
}

export default function OnboardingLevel({ levelId }: OnboardingLevelProps) {
    const {
        levels,
        state,
        getSteps,
        getQuiz,
        getLevelProgress,
        startLevel,
        setStepIndex,
        setQuizIndex,
        answerQuiz,
        completeLevel,
        resetLevel,
        logEvent,
    } = useOnboarding();
    const navigate = useNavigate();
    const {
        setIsOpen,
        setSteps,
        setCurrentStep,
        currentStep,
        isOpen,
    } = useTour();

    const config = levels.find((level) => level.id === levelId);
    const steps = getSteps(levelId);
    const quiz = getQuiz(levelId);
    const progress = getLevelProgress(levelId);

    const [showQuiz, setShowQuiz] = useState(false);
    const [quizResult, setQuizResult] = useState<"pass" | "fail" | null>(null);
    const [confirmedSteps, setConfirmedSteps] = useState<Record<string, boolean>>({});

    const stepIndex = progress?.lastStepIndex ?? 0;
    const quizIndex = progress?.lastQuizIndex ?? 0;

    const answerMap = useMemo(() => {
        return state.quizAnswers[levelId] || {};
    }, [state.quizAnswers, levelId]);

    useEffect(() => {
        if (!progress || progress.status === "locked") {
            navigate("/onboarding/timeline");
            return;
        }
        if (progress.status === "available") {
            startLevel(levelId);
            logEvent({ type: "level_start", levelId });
        }
    }, [levelId, progress?.status, startLevel, logEvent, navigate]);

    useEffect(() => {
        if (stepIndex >= steps.length && steps.length > 0) {
            setShowQuiz(true);
        }
    }, [stepIndex, steps.length]);

    useEffect(() => {
        const mappedSteps = steps.map((step) => ({
            selector: step.target,
            content: step.content,
            position: step.placement || "bottom",
        }));
        setSteps(mappedSteps);
        setCurrentStep(stepIndex);
        if (!showQuiz && steps.length > 0) {
            setIsOpen(true);
        }
    }, [steps, stepIndex, showQuiz, setSteps, setCurrentStep, setIsOpen]);

    useEffect(() => {
        if (typeof currentStep === "number" && currentStep !== stepIndex) {
            setStepIndex(levelId, currentStep);
            logEvent({ type: "tour_step", levelId, payload: { stepIndex: currentStep } });
        }
    }, [currentStep, stepIndex, levelId, setStepIndex, logEvent]);

    useEffect(() => {
        if (!isOpen && !showQuiz && steps.length > 0) {
            setShowQuiz(true);
            logEvent({ type: "tour_completed", levelId });
        }
    }, [isOpen, showQuiz, steps.length, levelId, logEvent]);

    useEffect(() => {
        if (showQuiz || steps.length === 0) return;
        if (typeof currentStep !== "number") return;
        const activeStep = steps[currentStep];
        if (!activeStep?.requireClick) return;

        const target = document.querySelector(activeStep.target);
        if (!target) return;
        const alreadyConfirmed = confirmedSteps[activeStep.id];
        if (alreadyConfirmed) return;

        const handleClick = () => {
            setConfirmedSteps((prev) => ({
                ...prev,
                [activeStep.id]: true,
            }));
            logEvent({ type: "tour_confirm", levelId, payload: { stepId: activeStep.id } });
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            setStepIndex(levelId, nextStep);
        };

        target.addEventListener("click", handleClick, { once: true });
        return () => {
            target.removeEventListener("click", handleClick);
        };
    }, [currentStep, steps, confirmedSteps, showQuiz, levelId, logEvent, setCurrentStep, setStepIndex]);

    useEffect(() => {
        if (showQuiz || steps.length === 0) return;
        if (typeof currentStep !== "number") return;
        const activeStep = steps[currentStep];
        if (!activeStep?.requireClick) return;
        if (confirmedSteps[activeStep.id]) return;
        if (currentStep !== stepIndex) {
            setCurrentStep(stepIndex);
        }
    }, [currentStep, stepIndex, steps, confirmedSteps, showQuiz, setCurrentStep]);

    useEffect(() => {
        if (showQuiz) return;
        if (steps.length === 0) return;
        if (!isOpen) {
            setIsOpen(true);
        }
    }, [isOpen, showQuiz, steps.length, setIsOpen]);

    useEffect(() => {
        if (progress?.status === "completed") {
            setShowQuiz(true);
            setQuizResult("pass");
        }
    }, [progress?.status]);

    if (!config) {
        return (
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-red-600">Unknown level.</p>
            </div>
        );
    }

    const currentQuestion = quiz[quizIndex];

    const handleAnswer = (choiceIndex: number) => {
        if (!currentQuestion) return;
        answerQuiz(levelId, currentQuestion.id, choiceIndex);
        logEvent({ type: "quiz_answer", levelId, payload: { questionId: currentQuestion.id, choiceIndex } });

        if (quizIndex + 1 < quiz.length) {
            setQuizIndex(levelId, quizIndex + 1);
        } else {
            const score = quiz.reduce((sum, question) => {
                const resolved = question.id === currentQuestion.id
                    ? choiceIndex
                    : answerMap[question.id];
                return resolved === question.correctIndex ? sum + question.points : sum;
            }, 0);

            if (score >= config.pointsRequired) {
                completeLevel(levelId, score);
                logEvent({ type: "quiz_pass", levelId, payload: { score } });
                setQuizResult("pass");
            } else {
                logEvent({ type: "quiz_fail", levelId, payload: { score } });
                setQuizResult("fail");
            }
        }
    };

    const handleRetry = () => {
        resetLevel(levelId);
        setShowQuiz(false);
        setQuizResult(null);
        logEvent({ type: "tour_retry", levelId });
    };

    const renderReplica = () => {
        switch (config.replica) {
            case "dashboard":
                return <ReplicaDashboard />;
            case "control-tower":
                return <ReplicaControlTower />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{config.id}</p>
                        <h2 className="text-xl font-semibold">{config.title}</h2>
                        <p className="text-sm text-slate-600">Earn {config.pointsRequired} points to clear this level.</p>
                    </div>
                    <Link
                        to="/onboarding/timeline"
                        className="rounded-full border border-slate-200 bg-white px-4 py-1 text-xs font-semibold text-slate-900"
                    >
                        Timeline
                    </Link>
                </div>
            </div>

            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg">
                {renderReplica()}
            </div>

            {showQuiz && (
                <div className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg">
                    {quizResult === "pass" && (
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
                    )}
                    {quizResult === "fail" && (
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
                    )}
                    {!quizResult && currentQuestion && (
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
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
