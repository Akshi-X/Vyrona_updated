import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import Dashboard from "../Dashboard";
import ControlTower from "../ControlTower";

interface OnboardingLevelProps {
    levelId: string;
}

export default function OnboardingLevel({ levelId }: OnboardingLevelProps) {
    const {
        levels,
        getSteps,
        getLevelProgress,
        startLevel,
        setStepIndex,
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
    const progress = getLevelProgress(levelId);

    const [confirmedSteps, setConfirmedSteps] = useState<Record<string, boolean>>({});
    const completionLoggedRef = useRef(false);
    const syncingFromTourRef = useRef(false);
    const lastAppliedStepRef = useRef<number | null>(null);
    const lastStepsKeyRef = useRef<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const didDumpIdsRef = useRef(false);

    const stepIndex = progress?.lastStepIndex ?? 0;
    const stepCount = steps.length;

    useEffect(() => {
        completionLoggedRef.current = false;
    }, [levelId]);

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
        if (stepCount > 0 && stepIndex >= stepCount && !completionLoggedRef.current) {
            logEvent({ type: "tour_completed", levelId });
            completionLoggedRef.current = true;
        }
    }, [stepCount, stepIndex, logEvent, levelId]);

    useEffect(() => {
        if (stepIndex < stepCount) {
            completionLoggedRef.current = false;
        }
    }, [stepIndex, stepCount]);

    useEffect(() => {
        const stepsKey = steps
            .map((step) => `${step.id}|${step.target}|${step.placement ?? ""}|${step.content}`)
            .join("::");
        if (stepsKey === lastStepsKeyRef.current) return;
        lastStepsKeyRef.current = stepsKey;

        const mappedSteps = steps.map((step) => ({
            selector: step.target,
            content: step.content,
            position: step.placement || "bottom",
        }));
        console.log("[onboarding] level steps", {
            levelId,
            stepCount: steps.length,
            targets: steps.map((step) => step.target),
        });
        setSteps(mappedSteps);
        if (steps.length > 0 && typeof currentStep !== "number") {
            const safeIndex = Math.min(stepIndex, steps.length - 1);
            setCurrentStep(safeIndex);
            setIsOpen(stepIndex < steps.length);
        }
    }, [steps, stepIndex, currentStep, setSteps, setCurrentStep, setIsOpen]);

    useEffect(() => {
        if (typeof currentStep === "number" && currentStep !== stepIndex) {
            console.log("[onboarding] tour step -> state", {
                levelId,
                currentStep,
                stepIndex,
            });
            syncingFromTourRef.current = true;
            setStepIndex(levelId, currentStep);
            logEvent({ type: "tour_step", levelId, payload: { stepIndex: currentStep } });
        }
    }, [currentStep, stepIndex, levelId, setStepIndex, logEvent]);

    useEffect(() => {
        if (steps.length === 0) return;
        if (lastAppliedStepRef.current === stepIndex) {
            syncingFromTourRef.current = false;
            return;
        }
        lastAppliedStepRef.current = stepIndex;
        if (!syncingFromTourRef.current && typeof currentStep === "number" && currentStep !== stepIndex) {
            console.log("[onboarding] state step -> tour", {
                levelId,
                stepIndex,
                currentStep,
            });
            const safeIndex = Math.min(stepIndex, steps.length - 1);
            setCurrentStep(safeIndex);
        }
        syncingFromTourRef.current = false;
    }, [stepIndex, steps.length, currentStep, setCurrentStep]);

    useEffect(() => {
        if (steps.length === 0) return;
        if (typeof currentStep !== "number") return;
        const activeStep = steps[currentStep];
        if (!activeStep?.requireClick) return;

        const target = document.querySelector(activeStep.target);
        if (!target) {
            console.log("[onboarding] target not found", {
                levelId,
                stepId: activeStep.id,
                target: activeStep.target,
                currentStep,
            });
            return;
        }
        const alreadyConfirmed = confirmedSteps[activeStep.id];
        if (alreadyConfirmed) return;

        const handleClick = () => {
            console.log("[onboarding] target clicked", {
                levelId,
                stepId: activeStep.id,
                target: activeStep.target,
                currentStep,
            });
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
    }, [currentStep, steps, confirmedSteps, levelId, logEvent, setCurrentStep, setStepIndex]);

    useEffect(() => {
        if (steps.length === 0) return;
        if (typeof currentStep !== "number") return;
        const activeStep = steps[currentStep];
        if (!activeStep?.requireClick) return;
        if (confirmedSteps[activeStep.id]) return;
        if (currentStep !== stepIndex) {
            setCurrentStep(stepIndex);
        }
    }, [currentStep, stepIndex, steps, confirmedSteps, setCurrentStep]);

    useEffect(() => {
        if (steps.length === 0) return;
        if (!isOpen && stepIndex < steps.length) {
            setIsOpen(true);
        }
    }, [isOpen, steps.length, stepIndex, setIsOpen]);

    useEffect(() => {
        if (didDumpIdsRef.current) return;
        const root = wrapperRef.current;
        if (!root) return;
        const ids = Array.from(root.querySelectorAll("[id]"))
            .map((node) => node.id)
            .filter(Boolean)
            .sort();
        console.log("[onboarding] dashboard ids", {
            levelId,
            count: ids.length,
            ids,
        });
        didDumpIdsRef.current = true;
    }, [levelId]);

    if (!config) {
        return (
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-red-600">Unknown level.</p>
            </div>
        );
    }

    const renderReplica = () => {
        switch (config.replica) {
            case "dashboard":
                return <Dashboard />;
            case "control-tower":
                return <ControlTower />;
            default:
                return null;
        }
    };

    return (
        <div ref={wrapperRef} className="min-h-screen">
            {renderReplica()}
        </div>
    );
}
