import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTour } from "@reactour/tour";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext, type TourNavState } from "../../contexts/TourNavContext";
import type { OnboardingStep } from "../../types/onboarding";

const GAP = 8;   // space between popover and target element
const EDGE = 20; // minimum space from all screen edges

// PositionProps as actually passed by @reactour/popover:
// p.width / p.height  → popover dimensions
// p.top / p.left / p.right / p.bottom → target element rect (with padding)
// p.windowWidth / p.windowHeight → viewport dimensions
type PositionProps = {
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
    windowWidth: number;
    windowHeight: number;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

const POSITION_FNS: Record<NonNullable<OnboardingStep["placement"]>, (p: PositionProps) => [number, number]> = {
    // Standard placements — replicate reactour's built-in logic but clamp to EDGE from all screen edges
    top: (p) => [
        clamp(p.left, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top - p.height - GAP, EDGE, p.windowHeight - p.height - EDGE),
    ],
    bottom: (p) => [
        clamp(p.left, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.bottom + GAP, EDGE, p.windowHeight - p.height - EDGE),
    ],
    left: (p) => [
        clamp(p.left - p.width - GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top, EDGE, p.windowHeight - p.height - EDGE),
    ],
    right: (p) => [
        clamp(p.right + GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top, EDGE, p.windowHeight - p.height - EDGE),
    ],
    center: (p) => [
        (p.windowWidth - p.width) / 2,
        (p.windowHeight - p.height) / 2,
    ],
    middle_middle: (p) => [
        (p.windowWidth - p.width) / 2,
        (p.windowHeight - p.height) / 2,
    ],
    // Corner positions: to the right/left, vertically anchored to target's top or bottom
    top_right: (p) => [
        clamp(p.right + GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top, EDGE, p.windowHeight - p.height - EDGE),
    ],
    top_left: (p) => [
        clamp(p.left - p.width - GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top, EDGE, p.windowHeight - p.height - EDGE),
    ],
    bottom_right: (p) => [
        clamp(p.right + GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.bottom - p.height, EDGE, p.windowHeight - p.height - EDGE),
    ],
    bottom_left: (p) => [
        clamp(p.left - p.width - GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.bottom - p.height, EDGE, p.windowHeight - p.height - EDGE),
    ],
    // Middle positions: above/below target, horizontally centred on the target
    top_middle: (p) => [
        clamp(p.left + (p.right - p.left - p.width) / 2, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top - p.height - GAP, EDGE, p.windowHeight - p.height - EDGE),
    ],
    bottom_middle: (p) => [
        clamp(p.left + (p.right - p.left - p.width) / 2, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.bottom + GAP, EDGE, p.windowHeight - p.height - EDGE),
    ],
    // Side positions: to the right/left, vertically centred on the target
    middle_right: (p) => [
        clamp(p.right + GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top + (p.bottom - p.top - p.height) / 2, EDGE, p.windowHeight - p.height - EDGE),
    ],
    middle_left: (p) => [
        clamp(p.left - p.width - GAP, EDGE, p.windowWidth - p.width - EDGE),
        clamp(p.top + (p.bottom - p.top - p.height) / 2, EDGE, p.windowHeight - p.height - EDGE),
    ],
};

function resolvePosition(placement: OnboardingStep["placement"]) {
    const fn = POSITION_FNS[placement ?? "bottom"];
    return (p: PositionProps) => {
        if (p.right === undefined) return "right" as const;
        return fn(p);
    };
}

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
            position: resolvePosition(step.placement),
        }));
        setSteps?.(mapped);

        const safeIndex = Math.min(stepIndex, steps.length - 1);
        setCurrentStep(safeIndex);
        if (isTourActive) setIsOpen(stepIndex < steps.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steps]);

    // Refs so Effect 4 can read activeStep fields without adding activeStep to deps
    const skipIfMissingRef  = useRef(false);
    const skipIfPresentRef  = useRef<string | undefined>(undefined);
    const stepTargetRef     = useRef<string>("");
    skipIfMissingRef.current  = activeStep?.skipIfMissing  ?? false;
    skipIfPresentRef.current  = activeStep?.skipIfPresent;
    stepTargetRef.current     = activeStep?.target ?? "";

    // ── 4. Keep tour open & in sync with stepIndex ─────────────────
    useEffect(() => {
        if (stepCount === 0) return;
        if (stepIndex >= stepCount) {
            setIsOpen(false);
            return;
        }

        // skipIfPresent: element exists right now → skip immediately (no async needed)
        if (skipIfPresentRef.current && !!document.querySelector(skipIfPresentRef.current)) {
            const next = stepIndex + 1;
            setCurrentStep(next);
            setStepIndex(levelId, next);
            return;
        }

        // skipIfMissing: hide immediately while Effect 5a polls.
        // Without this the tour stays open from the previous step and renders
        // the popover at top-left because the new target doesn't exist yet.
        if (skipIfMissingRef.current) { setIsOpen(false); return; }

        setCurrentStep(stepIndex);
        if (!isTourActive) return;
        setIsOpen(true);
    }, [stepIndex, stepCount, isTourActive, levelId, setCurrentStep, setStepIndex, setIsOpen]);

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
        if (activeStep.skipIfMissing) return;
        if (document.querySelector(activeStep.target)) return;

        const interval = setInterval(() => {
            const el = document.querySelector(activeStep.target) as HTMLElement | null;
            if (el) {
                clearInterval(interval);
                if (!activeStep.requireClick) el.style.setProperty("pointer-events", "none");
                // Force @reactour to reposition even if stepIndex hasn't changed —
                // calling setCurrentStep with the same value is a no-op in @reactour,
                // so close + reopen on the next frame to trigger a fresh spotlight.
                setIsOpen(false);
                requestAnimationFrame(() => {
                    setCurrentStep(stepIndex);
                    setIsOpen(true);
                });
            }
        }, 50);

        return () => clearInterval(interval);
    }, [activeStep, stepIndex, stepCount, setCurrentStep, setIsOpen]);


    // ── 5a. skipIfMissing: poll briefly for element, then open or skip ──────
    // Needed because some elements render async (e.g. left toggle waits for
    // sensorTiles to load). Wide screens: element never appears → skip after
    // MAX_WAIT. Narrow screens with async data: element appears quickly → show.
    useEffect(() => {
        if (!isTourActive || !activeStep?.skipIfMissing) return;
        const MAX_WAIT_MS = 150;
        const TICK_MS     = 16;
        let elapsed = 0;
        const id = setInterval(() => {
            elapsed += TICK_MS;
            const el = document.querySelector(activeStep.target);
            if (el) {
                clearInterval(id);
                setCurrentStep(stepIndex);
                setIsOpen(true);
            } else if (elapsed >= MAX_WAIT_MS) {
                clearInterval(id);
                const next = stepIndex + 1;
                setCurrentStep(next);
                setStepIndex(levelId, next);
            }
        }, TICK_MS);
        return () => clearInterval(id);
    }, [activeStep, isTourActive, stepIndex, levelId, setCurrentStep, setStepIndex, setIsOpen]);

    // ── 5b. Scroll target into view for steps inside overflow containers ──
    useEffect(() => {
        if (!isTourActive || !activeStep?.scrollIntoView) return;
        const el = document.querySelector(activeStep.target) as HTMLElement | null;
        if (!el) return;
        // Instant scroll so the element is in place before @reactour measures it —
        // avoids the popover appearing at the pre-scroll position then jumping.
        el.scrollIntoView({ behavior: "instant", block: "nearest" });
        setCurrentStep(stepIndex);
        setIsOpen(true);
    }, [activeStep, isTourActive, stepIndex, setCurrentStep, setIsOpen]);

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
            applyClass();
            const allFound = ids.every((sel) => !!document.querySelector(sel));
            if (allFound) clearInterval(interval);
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
        if (!isTourActive || !activeStep || confirmedSteps[activeStep.id]) return;
        if (!activeStep.requireClick) return;

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

            // Tour tooltip always passes through (Next / Prev / Close buttons)
            if ((event.target as Element)?.closest(".reactour__popover")) return;

            applyDisabledStyles();

            const hitsBox = (el: Element) => {
                const r = el.getBoundingClientRect();
                return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
            };

            // disableClickID elements are always blocked regardless of step type
            if (activeStep.disableClickID?.some((sel) => {
                const el = document.querySelector(sel);
                return el ? hitsBox(el) : false;
            })) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // No whitelist = read-only step — block everything unconditionally
            const hasWhitelist = (activeStep.clickOnlyId?.length ?? 0) > 0;
            if (!hasWhitelist) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // Has whitelist — only allow clicks that land on a whitelisted element
            let matchedEl: HTMLElement | null = null;
            const hitWhitelisted = activeStep.clickOnlyId!.some((sel) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (!el) return false;
                if ((event.target as Element)?.closest(sel)) { matchedEl = el; return true; }
                if (hitsBox(el)) { matchedEl = el; return true; }
                return false;
            });
            if (!hitWhitelisted) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // Block the raw pointer event, then fire a synthetic click so the
            // element's own onClick always runs (opens modals, toggles panels, etc.)
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
        };

        // Block click events (which trigger React onClick) for non-whitelisted elements.
        // pointerdown alone isn't enough — React onClick fires from the click event.
        const handleClick = (event: Event) => {
            if ((event.target as Element)?.closest(".reactour__popover")) return;
            const hasWhitelist = (activeStep.clickOnlyId?.length ?? 0) > 0;
            if (!hasWhitelist) { event.preventDefault(); event.stopPropagation(); return; }
            const hitWhitelisted = activeStep.clickOnlyId!.some((sel) =>
                !!(event.target as Element)?.closest(sel)
            );
            if (!hitWhitelisted) { event.preventDefault(); event.stopPropagation(); }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("click", handleClick, true);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            document.removeEventListener("click", handleClick, true);
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
        is_wide: activeStep?.is_wide,
        gif: activeStep?.gif,
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

        // Walk back from any prevDisable/rewindOnRefresh step — catches mid-session resumes
        // where HYDRATE hasn't run (no reload).
        let safeIndex = stepIndex;
        while (safeIndex > 0 && (steps[safeIndex]?.prevDisable || steps[safeIndex]?.rewindOnRefresh)) safeIndex--;

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
