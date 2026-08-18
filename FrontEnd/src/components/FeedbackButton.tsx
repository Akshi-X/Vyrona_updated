import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOnboardingMode } from "../contexts/OnboardingModeContext";

interface FeedbackButtonProps {
    /** Feedback type enum value, e.g. "ux_workflow_improvement" */
    feedbackType: string;
    /** Affected module backend enum value, e.g. "embryo_grading" */
    module: string;
    /** Priority enum value, e.g. "high" */
    priority: string;
    /** Pre-filled subject/title */
    title: string;
    /** Field to auto-focus on the Support form once loaded */
    focusField?: "description";
    /**
     * "auto" (default): icon + "Send Feedback" label, glowing for the first 3s,
     * held for 5s total, then a 3s fade/collapse into an icon-only button with
     * a hover tooltip.
     * "text": icon + label, always expanded.
     * "icon": icon only, always collapsed.
     */
    variant?: "icon" | "text" | "auto";
    className?: string;
}

const GLOW_MS = 3000;
const COLLAPSE_START_MS = 5000;
// Exit animation is sequential: text opacity fades out first, then the
// button/text width shrinks down to the icon-only shape.
const FADE_DURATION_MS = 1000;
const SHRINK_DURATION_MS = 2000;

/** Deep-links into the Support form with prefill values carried as URL params. */
const FeedbackButton = ({
    feedbackType,
    module,
    priority,
    title,
    focusField,
    variant = "auto",
    className = "",
}: FeedbackButtonProps) => {
    const navigate = useNavigate();
    const isOnboarding = useOnboardingMode();
    const [expanded, setExpanded] = useState(variant !== "icon");
    const [glow, setGlow] = useState(variant === "auto");

    useEffect(() => {
        if (variant !== "auto") return;
        const glowTimer = setTimeout(() => setGlow(false), GLOW_MS);
        const collapseTimer = setTimeout(() => setExpanded(false), COLLAPSE_START_MS);
        return () => {
            clearTimeout(glowTimer);
            clearTimeout(collapseTimer);
        };
    }, [variant]);

    const goToFeedback = () => {
        const params = new URLSearchParams({
            type: feedbackType,
            module,
            priority,
            title,
        });
        if (focusField) params.set("focus", focusField);
        navigate(`${isOnboarding ? "/onboarding/support" : "/support"}?${params.toString()}`);
    };

    const showText = variant === "text" || (variant === "auto" && expanded);

    return (
        <div className="relative inline-flex shrink-0">
            {variant === "auto" && (
                <span
                    aria-hidden
                    className={`absolute -inset-1 rounded-full bg-primary/40 blur-md transition-opacity duration-700 ${
                        glow ? "opacity-40 animate-pulse" : "opacity-0"
                    }`}
                />
            )}
            <button
                type="button"
                onClick={goToFeedback}
                title="Share feedback"
                aria-label="Share feedback"
                className={`relative z-10 flex items-center h-9 rounded-full border border-primary/20 bg-primary/5 text-primary shrink-0 overflow-hidden ease-in-out hover:bg-primary/10 ${
                    showText ? "gap-2 px-4" : "w-9 justify-center px-0"
                } ${className}`}
                style={{
                    transitionProperty: "padding, gap, background-color",
                    transitionTimingFunction: "ease-in-out",
                    transitionDuration: showText ? "300ms" : `${SHRINK_DURATION_MS}ms`,
                    transitionDelay: showText ? "0ms" : `${FADE_DURATION_MS}ms`,
                }}
            >
                <MessageSquarePlus size={16} className="shrink-0" />
                <span
                    className={`text-sm font-semibold whitespace-nowrap ease-in-out ${
                        showText ? "opacity-100 max-w-[140px]" : "opacity-0 max-w-0"
                    }`}
                    style={{
                        transitionProperty: "opacity, max-width",
                        transitionTimingFunction: "ease-in-out",
                        transitionDuration: showText
                            ? "0ms, 0ms"
                            : `${FADE_DURATION_MS}ms, ${SHRINK_DURATION_MS}ms`,
                        transitionDelay: showText ? "0ms, 0ms" : `0ms, ${FADE_DURATION_MS}ms`,
                    }}
                >
                    Share Feedback
                </span>
            </button>
        </div>
    );
};

export default FeedbackButton;
