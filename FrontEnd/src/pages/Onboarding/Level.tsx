import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext, type TourNavState } from "../../contexts/TourNavContext";
import Dashboard from "../Dashboard";
import ControlTower from "../ControlTower";

interface OnboardingLevelProps {
    levelId: string;
}

export default function OnboardingLevel({ levelId }: OnboardingLevelProps) {
    const { levels, getSteps, getLevelProgress, startLevel, setStepIndex, logEvent } = useOnboarding();
    const navigate = useNavigate();
    const { setIsOpen, setSteps, setCurrentStep } = useTour();
    const tourNavCtx = useTourNavContext();

    const config = levels.find((level) => level.id === levelId);
    const steps = getSteps(levelId);
    const progress = getLevelProgress(levelId);

    const [confirmedSteps, setConfirmedSteps] = useState<Record<string, boolean>>({});
    const completionLoggedRef = useRef(false);
    const lastStepsKeyRef = useRef<string | null>(null);

    const stepIndex = progress?.lastStepIndex ?? 0;
    const stepCount = steps.length;
    const activeStep = stepIndex < stepCount ? steps[stepIndex] : null;
    const canNext = !activeStep?.requireClick || !!confirmedSteps[activeStep.id];

    // Compute the real target index when going back, skipping prevDisable steps
    const prevTargetIndex = (() => {
        let target = stepIndex - 1;
        if (target >= 0 && steps[target]?.prevDisable) target -= 1;
        return target;
    })();
    const prevLocked = !!activeStep?.prevDisable;
    const canPrev = !prevLocked && prevTargetIndex >= 0;

    // ── 1. Level init ──────────────────────────────────────────────
    useEffect(() => {
        if (!progress || progress.status === "locked") {
            navigate("/onboarding/timeline");
            return;
        }
        if (progress.status === "available") {
            startLevel(levelId);
            logEvent({ type: "level_start", levelId });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levelId, progress?.status]);

    // ── 2. Completion log ──────────────────────────────────────────
    useEffect(() => { completionLoggedRef.current = false; }, [levelId]);

    useEffect(() => {
        if (stepCount > 0 && stepIndex >= stepCount && !completionLoggedRef.current) {
            logEvent({ type: "tour_completed", levelId });
            completionLoggedRef.current = true;
        }
    }, [stepCount, stepIndex, logEvent, levelId]);

    // ── 3. Tour steps setup & initial position ─────────────────────
    useEffect(() => {
        if (steps.length === 0) return;
        const stepsKey = steps.map((s) => s.id).join(",");
        if (stepsKey === lastStepsKeyRef.current) return;
        lastStepsKeyRef.current = stepsKey;

        const mapped = steps.map((step) => ({
            selector: step.target,
            content: step.content,
            position: step.placement || "bottom",
        }));
        setSteps?.(mapped);

        const safeIndex = Math.min(stepIndex, steps.length - 1);
        setCurrentStep(safeIndex);
        setIsOpen(stepIndex < steps.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steps]);

    // ── 4. Keep tour open & in sync with stepIndex ─────────────────
    useEffect(() => {
        if (stepCount === 0) return;
        if (stepIndex >= stepCount) {
            setIsOpen(false);
            return;
        }
        setCurrentStep(stepIndex);
        setIsOpen(true);
    }, [stepIndex, stepCount, setCurrentStep, setIsOpen]);

    // ── 5. Re-sync tour when target appears asynchronously (e.g. modal opens after step advances) ──
    useEffect(() => {
        if (!activeStep || stepIndex >= stepCount) return;
        if (document.querySelector(activeStep.target)) return; // already in DOM

        const interval = setInterval(() => {
            if (document.querySelector(activeStep.target)) {
                clearInterval(interval);
                setCurrentStep(stepIndex);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [activeStep, stepIndex, stepCount, setCurrentStep]);

    // ── 6. Disable pointer-events on non-interactive steps ───────────
    useEffect(() => {
        if (!activeStep || activeStep.requireClick) return;
        const el = document.querySelector(activeStep.target) as HTMLElement | null;
        if (!el) return;
        el.style.setProperty("pointer-events", "none");
        return () => { el.style.removeProperty("pointer-events"); };
    }, [activeStep]);

    // ── 7. Trail-border animation on clickOnlyId targets ─────────────
    useEffect(() => {
        const ids = activeStep?.clickOnlyId;
        if (!ids?.length) return;

        const applyClass = () => {
            ids.forEach((sel) => {
                document.querySelector(sel)?.classList.add("tour-click-target");
            });
        };

        applyClass();

        // Re-apply for async elements (e.g. modal not yet in DOM)
        const interval = setInterval(() => {
            const missing = ids.some((sel) => !document.querySelector(sel));
            if (!missing) { clearInterval(interval); return; }
            applyClass();
        }, 50);

        return () => {
            clearInterval(interval);
            ids.forEach((sel) => {
                document.querySelector(sel)?.classList.remove("tour-click-target");
            });
        };
    }, [activeStep]);

    // ── 8. Click guard (bounding-box, bypasses tour mask overlay) ──
    useEffect(() => {
        if (!activeStep?.requireClick || confirmedSteps[activeStep.id]) return;

        const applyDisabledStyles = () => {
            activeStep.disableClickID?.forEach((sel) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (el) el.style.setProperty("pointer-events", "none");
            });
        };
        const restoreDisabledStyles = () => {
            activeStep.disableClickID?.forEach((sel) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (el) el.style.removeProperty("pointer-events");
            });
        };

        // Apply immediately for already-rendered elements (e.g. not inside a modal)
        applyDisabledStyles();

        const handlePointerDown = (event: Event) => {
            const { clientX, clientY } = event as PointerEvent;
            const clickedEl = event.target as Element | null;

            // Query target fresh — handles portal-rendered elements (e.g. modals) that
            // may not be in the DOM when this effect first ran.
            const target = document.querySelector(activeStep.target);
            if (!target) return;

            // Re-apply disabled styles for elements that appeared after effect ran (e.g. modal opened)
            applyDisabledStyles();

            // Bounding-box helper (needed because the tour mask intercepts pointer events)
            const hitsBox = (el: Element) => {
                const r = el.getBoundingClientRect();
                return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
            };

            // disableClickID — completely blocked, no step advance
            if (activeStep.disableClickID?.some((sel) => {
                const el = document.querySelector(sel);
                return el ? hitsBox(el) : false;
            })) return;

            const hasWhitelist = (activeStep.clickOnlyId?.length ?? 0) > 0;

            if (hasWhitelist) {
                // Whitelist mode: ONLY clicks on clickOnlyId elements advance the step.
                // Any other click inside the target is ignored.
                let matchedEl: HTMLElement | null = null;
                const hitWhitelisted = activeStep.clickOnlyId!.some((sel) => {
                    const el = document.querySelector(sel) as HTMLElement | null;
                    if (el && hitsBox(el)) { matchedEl = el; return true; }
                    return false;
                });
                if (!hitWhitelisted) return;

                const nextIndex = stepIndex + 1;
                setConfirmedSteps((prev) => ({ ...prev, [activeStep.id]: true }));
                logEvent({ type: "tour_confirm", levelId, payload: { stepId: activeStep.id } });
                setCurrentStep(nextIndex);
                setStepIndex(levelId, nextIndex);

                // Programmatically fire the click so the element's own action (e.g. close modal)
                // always runs — the tour mask can intercept the natural click event.
                matchedEl?.click();
            } else {
                // Normal mode: any click inside the target advances the step.
                const isInsideTarget = target.contains(clickedEl) || hitsBox(target);
                if (!isInsideTarget) return;

                const nextIndex = stepIndex + 1;
                setConfirmedSteps((prev) => ({ ...prev, [activeStep.id]: true }));
                logEvent({ type: "tour_confirm", levelId, payload: { stepId: activeStep.id } });
                setCurrentStep(nextIndex);
                setStepIndex(levelId, nextIndex);

                // Forward click so side effects (e.g. opening modals) still fire.
                (target as HTMLElement).click();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            restoreDisabledStyles();
        };
    }, [activeStep, confirmedSteps, stepIndex, levelId, logEvent, setCurrentStep, setStepIndex]);

    // ── Navigation handlers (exposed via context) ──────────────────
    const goNext = useCallback(() => {
        if (!canNext) return;
        const nextIndex = stepIndex + 1;
        setCurrentStep(nextIndex);
        setStepIndex(levelId, nextIndex);
        logEvent({ type: "tour_step", levelId, payload: { stepIndex: nextIndex } });
    }, [canNext, stepIndex, levelId, setCurrentStep, setStepIndex, logEvent]);

    const goPrev = useCallback(() => {
        if (!canPrev) return;
        // Clear confirmations for every step from the landing index up to (not including)
        // the current one — this covers both the target step and any prevDisable steps
        // jumped over, so requireClick is enforced again if the user re-enters them.
        setConfirmedSteps((prev) => {
            const next = { ...prev };
            for (let i = prevTargetIndex; i < stepIndex; i++) {
                const s = steps[i];
                if (s?.requireClick) delete next[s.id];
            }
            return next;
        });
        setCurrentStep(prevTargetIndex);
        setStepIndex(levelId, prevTargetIndex);
        logEvent({ type: "tour_step", levelId, payload: { stepIndex: prevTargetIndex } });
    }, [canPrev, prevTargetIndex, stepIndex, steps, levelId, setCurrentStep, setStepIndex, logEvent]);

    // ── Publish nav state to context so TourNavigation can read it ─
    const navState = useMemo<TourNavState>(() => ({
        title: activeStep?.title ?? "",
        icon: activeStep?.icon ?? "",
        content: activeStep?.content ?? "",
        stepIndex,
        totalSteps: stepCount,
        canNext,
        canPrev,
        prevLocked,
        requiresClick: !!activeStep?.requireClick && !confirmedSteps[activeStep?.id ?? ""],
        goNext,
        goPrev,
    }), [activeStep, stepIndex, stepCount, canNext, canPrev, prevLocked, confirmedSteps, goNext, goPrev]);

    useEffect(() => {
        tourNavCtx?.setNav(navState);
    }, [navState, tourNavCtx]);

    useEffect(() => {
        return () => { tourNavCtx?.setNav(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!config) {
        return (
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-red-600">Unknown level.</p>
            </div>
        );
    }

    const renderReplica = () => {
        switch (config.replica) {
            case "dashboard": return <Dashboard />;
            case "control-tower": return <ControlTower />;
            default: return null;
        }
    };

    return <div className="min-h-screen">{renderReplica()}</div>;
}
