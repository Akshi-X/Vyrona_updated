import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext, type TourNavState } from "../../contexts/TourNavContext";

interface OnboardingLevelProps {
    levelId: string;
}

export default function OnboardingLevel({ levelId }: OnboardingLevelProps) {
    const { getSteps, getLevelProgress, startLevel, setStepIndex } = useOnboarding();
    const navigate = useNavigate();
    const location = useLocation();
    const { setIsOpen, setSteps, setCurrentStep } = useTour();
    const tourNavCtx = useTourNavContext();

    const steps = getSteps(levelId);
    const progress = getLevelProgress(levelId);

    const [confirmedSteps, setConfirmedSteps] = useState<Record<string, boolean>>({});
    const completionLoggedRef = useRef(false);
    const lastStepsKeyRef = useRef<string | null>(null);
    const prevStepIndexRef = useRef(0);

    const isTourActive = tourNavCtx?.isTourActive ?? false;
    const setIsTourActive = (v: boolean) => tourNavCtx?.setIsTourActive(v);

    const stepIndex = progress?.lastStepIndex ?? 0;
    const stepCount = steps.length;
    const activeStep = stepIndex < stepCount ? steps[stepIndex] : null;
    const canNext = !activeStep?.requireClick || !!confirmedSteps[activeStep.id];

    // Clear confirmed steps when level is reset (stepIndex goes back to 0 from a higher value)
    useEffect(() => {
        if (prevStepIndexRef.current > 0 && stepIndex === 0) {
            setConfirmedSteps({});
            completionLoggedRef.current = false;
        }
        prevStepIndexRef.current = stepIndex;
    }, [stepIndex]);

    const prevTargetIndex = (() => {
        let target = stepIndex - 1;
        while (target >= 0 && steps[target]?.prevDisable) target -= 1;
        return target;
    })();
    const prevLocked = !!activeStep?.prevDisable;
    const canPrev = !prevLocked && prevTargetIndex >= 0;

    // ── 1. Level init ──────────────────────────────────────────────
    useEffect(() => {
        if (progress?.status === "locked") {
            navigate("/onboarding/timeline");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levelId, progress?.status]);

    // ── 2. Completion log ──────────────────────────────────────────
    useEffect(() => { completionLoggedRef.current = false; }, [levelId]);

    useEffect(() => {
        if (stepCount > 0 && stepIndex >= stepCount && !completionLoggedRef.current) {
            completionLoggedRef.current = true;
            setIsTourActive(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepCount, stepIndex, levelId]);

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
        if (isTourActive) setIsOpen(stepIndex < steps.length);
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
        if (isTourActive) setIsOpen(true);
    }, [stepIndex, stepCount, isTourActive, setCurrentStep, setIsOpen]);

    // ── 4b. Navigate to startPage if step requires a specific page ──
    useEffect(() => {
        if (!isTourActive) return;
        if (!activeStep?.startPage) return;
        if (location.pathname === activeStep.startPage) return;
        navigate(activeStep.startPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeStep?.startPage, isTourActive]);

    // ── 5. Re-sync tour when target appears asynchronously ──────────
    useEffect(() => {
        if (!activeStep || stepIndex >= stepCount) return;
        if (document.querySelector(activeStep.target)) return;

        const interval = setInterval(() => {
            if (document.querySelector(activeStep.target)) {
                clearInterval(interval);
                setCurrentStep(stepIndex);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [activeStep, stepIndex, stepCount, setCurrentStep]);

    // ── 5c. Dispatch onboardingEvent when a step becomes active ──────
    useEffect(() => {
        if (!isTourActive || !activeStep?.onboardingEvent) return;
        document.dispatchEvent(new CustomEvent(activeStep.onboardingEvent));
    }, [activeStep, isTourActive]);

    // ── 5b. Auto-fill inputText via a custom DOM event ───────────────
    // Dispatches "onboarding:set-chat-input" so the target component can
    // call setDraftMessage directly — avoids React 18 synthetic-event issues
    // with the native value-setter trick.
    useEffect(() => {
        if (!isTourActive || !activeStep?.inputText) return;

        const dispatch = () => {
            const el = document.querySelector(activeStep.target);
            if (!el) return false;
            document.dispatchEvent(
                new CustomEvent("onboarding:set-chat-input", { detail: activeStep.inputText })
            );
            (el as HTMLElement).focus?.();
            return true;
        };

        if (!dispatch()) {
            const interval = setInterval(() => { if (dispatch()) clearInterval(interval); }, 50);
            return () => clearInterval(interval);
        }
    }, [activeStep, isTourActive]);

    // ── 6. Disable pointer-events on non-interactive steps ──────────
    useEffect(() => {
        if (!isTourActive || !activeStep || activeStep.requireClick) return;
        const el = document.querySelector(activeStep.target) as HTMLElement | null;
        if (!el) return;
        el.style.setProperty("pointer-events", "none");
        return () => { el.style.removeProperty("pointer-events"); };
    }, [activeStep, isTourActive]);

    // ── 7. Trail-border animation on clickOnlyId targets ────────────
    useEffect(() => {
        const ids = activeStep?.clickOnlyId;
        if (!ids?.length || !isTourActive) return;

        const applyClass = () => {
            ids.forEach((sel) => {
                document.querySelector(sel)?.classList.add("tour-click-target");
            });
        };

        applyClass();

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
    }, [activeStep, isTourActive]);

    // ── 8. Click guard ───────────────────────────────────────────────
    useEffect(() => {
        if (!isTourActive || !activeStep?.requireClick || confirmedSteps[activeStep.id]) return;

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

        applyDisabledStyles();

        const handlePointerDown = (event: Event) => {
            const { clientX, clientY } = event as PointerEvent;
            const clickedEl = event.target as Element | null;

            const target = document.querySelector(activeStep.target);
            if (!target) return;

            applyDisabledStyles();

            const hitsBox = (el: Element) => {
                const r = el.getBoundingClientRect();
                return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
            };

            if (activeStep.disableClickID?.some((sel) => {
                const el = document.querySelector(sel);
                return el ? hitsBox(el) : false;
            })) return;

            const hasWhitelist = (activeStep.clickOnlyId?.length ?? 0) > 0;

            if (hasWhitelist) {
                let matchedEl: HTMLElement | null = null;
                const hitWhitelisted = activeStep.clickOnlyId!.some((sel) => {
                    const el = document.querySelector(sel) as HTMLElement | null;
                    if (el && hitsBox(el)) { matchedEl = el; return true; }
                    return false;
                });
                if (!hitWhitelisted) return;

                // Prevent the native click from also firing so elements like
                // toggle buttons aren't triggered twice (once real, once synthetic).
                event.preventDefault();
                event.stopPropagation();

                (matchedEl as HTMLElement | null)?.click();

                const advance = () => {
                    const nextIndex = stepIndex + 1;
                    setConfirmedSteps((prev) => ({ ...prev, [activeStep.id]: true }));
                    setCurrentStep(nextIndex);
                    setStepIndex(levelId, nextIndex);
                };
                if (activeStep.stepDelay) {
                    setTimeout(advance, activeStep.stepDelay);
                } else {
                    advance();
                }
            } else {
                const isInsideTarget = target.contains(clickedEl) || hitsBox(target);
                if (!isInsideTarget) return;

                (target as HTMLElement).click();

                const advance = () => {
                    const nextIndex = stepIndex + 1;
                    setConfirmedSteps((prev) => ({ ...prev, [activeStep.id]: true }));
                    setCurrentStep(nextIndex);
                    setStepIndex(levelId, nextIndex);
                };
                if (activeStep.stepDelay) {
                    setTimeout(advance, activeStep.stepDelay);
                } else {
                    advance();
                }
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            restoreDisabledStyles();
        };
    }, [activeStep, confirmedSteps, stepIndex, levelId, setCurrentStep, setStepIndex, isTourActive]);

    // ── Navigation handlers ─────────────────────────────────────────
    const goNext = useCallback(() => {
        if (!canNext) return;
        const nextIndex = stepIndex + 1;
        setCurrentStep(nextIndex);
        setStepIndex(levelId, nextIndex);
    }, [canNext, stepIndex, levelId, setCurrentStep, setStepIndex]);

    const goPrev = useCallback(() => {
        if (!canPrev) return;
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
    }, [canPrev, prevTargetIndex, stepIndex, steps, levelId, setCurrentStep, setStepIndex]);

    // ── Publish nav state ───────────────────────────────────────────
    const navState = useMemo<TourNavState>(() => ({
        title: activeStep?.title ?? "",
        icon: activeStep?.icon ?? "",
        content: activeStep?.content ?? "",
        genieImage: activeStep?.genieImage,
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

    // ── Open tour when isTourActive flips to true ───────────────────
    useEffect(() => {
        if (!isTourActive || stepCount === 0 || stepIndex >= stepCount) return;

        // Walk back from any prevDisable step — catches mid-session resumes
        // where HYDRATE hasn't run (no reload).
        let safeIndex = stepIndex;
        while (safeIndex > 0 && steps[safeIndex]?.prevDisable) safeIndex--;

        if (safeIndex !== stepIndex) {
            setStepIndex(levelId, safeIndex);
        }
        setCurrentStep(safeIndex);
        setIsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTourActive]);

    // ── Auto-start if navigated here with a pending start request ───
    useEffect(() => {
        if (tourNavCtx?.pendingStartLevelId !== levelId) return;
        tourNavCtx.setPendingStartLevelId(null);
        if (progress?.status === "available") {
            startLevel(levelId);
        }
        setIsTourActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourNavCtx?.pendingStartLevelId]);

    // ── Register startTour ──────────────────────────────────────────
    useEffect(() => {
        const fn = () => {
            if (progress?.status === "available") {
                startLevel(levelId);
            }
            setIsTourActive(true);
            if (stepCount > 0 && stepIndex < stepCount) {
                setCurrentStep(stepIndex);
                setIsOpen(true);
            }
        };
        tourNavCtx?.setStartTour(fn);
        return () => { tourNavCtx?.setStartTour(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [progress?.status, levelId, stepCount, stepIndex]);

    return null;
}
