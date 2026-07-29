import { useEffect } from "react";
import { Info } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTourNavContext } from "../../contexts/TourNavContext";

// Dedicated overlay for page-launched preview tours (the header "Take a tour" icon).
// Fully separate from OnboardingOverlay so the normal onboarding-hub flow is never
// touched. Drives the shared spotlight engine only via TourNavContext.previewLevelId.
export default function PreviewTourOverlay() {
    const location = useLocation();
    const navigate = useNavigate();
    const { levels } = useOnboarding();
    const tourNavCtx = useTourNavContext();

    const previewLevelId = tourNavCtx?.previewLevelId ?? null;
    const previewPhase   = tourNavCtx?.previewPhase ?? null;

    // Handoff: TourEntryButton navigates to /onboarding/<route> with { previewLevelId,
    // returnTo }. Start the preview session and open the compact welcome card.
    useEffect(() => {
        const s = location.state as { previewLevelId?: string; returnTo?: string } | null;
        if (!s?.previewLevelId) return;
        window.history.replaceState({}, "");
        tourNavCtx?.setReturnPath(s.returnTo ?? null);
        tourNavCtx?.setPreviewLevelId(s.previewLevelId);
        tourNavCtx?.setPreviewPhase("welcome");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    const config = previewLevelId ? levels.find((l) => l.id === previewLevelId) : null;

    const exit = () => {
        const path = tourNavCtx?.returnPath;
        tourNavCtx?.setPreviewLevelId(null);
        tourNavCtx?.setReturnPath(null);
        tourNavCtx?.setPreviewPhase(null);
        if (path) navigate(path);
    };

    const beginTour = () => {
        if (!previewLevelId) return;
        tourNavCtx?.setPreviewPhase("tour");
        tourNavCtx?.setPendingStartLevelId(previewLevelId);
    };

    // Only the welcome and exit cards are modal; the running tour shows the spotlight.
    if (!config || (previewPhase !== "welcome" && previewPhase !== "done")) return null;

    const isDone = previewPhase === "done";

    const headerLabel = isDone
        ? config.quick_exit?.headerTitle ?? config.completion?.title ?? "Tour complete"
        : config.welcome?.headerTitle ?? "Tour";

    const exitContent = config.quick_exit ??
        (config.completion
            ? { title: config.completion.title, message: config.completion.message }
            : { title: "Tour complete", message: "You've finished this tour." });

    const startMessage = config.quick_start?.message ?? config.welcome?.description ?? "";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
            <div className="relative w-full max-w-xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-primary">{headerLabel}</p>
                        <h2 className="text-lg font-semibold">{config.title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={exit}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                        Close
                    </button>
                </div>

                {/* Body */}
                <div className="mt-6 max-h-[70vh] overflow-y-auto pr-2">
                    {isDone ? (
                        <div className="space-y-5">
                            <div className="flex items-start gap-4">
                                <span className="text-5xl leading-none">🎉</span>
                                <div className="space-y-1 min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Tour complete</p>
                                    <h3 className="text-xl font-semibold text-slate-900">{exitContent.title}</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">{exitContent.message}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={exit}
                                className="inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
                            >
                                Exit tour & return to page →
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {startMessage && <p className="text-sm text-slate-600 leading-relaxed">{startMessage}</p>}
                            <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
                                <Info size={15} className="mt-0.5 shrink-0 text-primary" />
                                <p className="text-xs leading-relaxed text-primary/90">
                                    This walkthrough uses sample data to explain the module — nothing here affects your real records.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={beginTour}
                                className="inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
                            >
                                Begin Tour →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
