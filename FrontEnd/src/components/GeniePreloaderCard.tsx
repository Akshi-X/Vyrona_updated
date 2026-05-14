import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useGeniePreloader } from "../contexts/GeniePreloaderContext";

const GENIE_PORTRAIT = "/genie/welcoming_with_waving_hand.webp";

export const GeniePreloaderCard: React.FC = () => {
    const { state, retry } = useGeniePreloader();

    if (state.status === "ready" || state.status === "idle") return null;

    const isError = state.status === "error";
    const loaded = state.loaded;
    const total = state.total;
    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    const failedCount = state.failed.length;

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#FDFAFF] px-4 py-10">
            <div className="mx-auto w-full max-w-2xl rounded-3xl border border-white/60 bg-white/80 p-8 shadow-sm backdrop-blur">
                <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b1176]">
                                Getting things ready
                            </p>
                            <h2 className="text-2xl font-semibold text-slate-900">
                                {isError
                                    ? "Couldn't finish preparing the tour"
                                    : "Preparing your guided tour…"}
                            </h2>
                            <p className="text-sm text-slate-600">
                                {isError
                                    ? "Some character art couldn't be downloaded. You can retry — already-cached files will be skipped."
                                    : "We're caching Genie's character art so the tour stays smooth across the journey."}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                                <span>{isError ? "Stalled" : "Caching images"}</span>
                                <span>
                                    {loaded} / {total} {total > 0 && `(${percent}%)`}
                                </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                                        isError ? "bg-rose-400" : "bg-[#6b1176]"
                                    }`}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            {failedCount > 0 && (
                                <p className="flex items-center gap-1.5 text-xs text-rose-600">
                                    <AlertCircle size={12} strokeWidth={2.5} />
                                    {failedCount} file{failedCount === 1 ? "" : "s"} failed to load
                                </p>
                            )}
                        </div>

                        {isError ? (
                            <button
                                type="button"
                                onClick={retry}
                                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
                            >
                                <RotateCcw size={14} strokeWidth={2.5} />
                                Retry
                            </button>
                        ) : (
                            <p className="text-xs text-slate-400">
                                This is a one-time setup. Future visits will skip straight to the tour.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-center">
                        <img
                            src={GENIE_PORTRAIT}
                            alt=""
                            aria-hidden
                            className="h-56 w-56 object-contain"
                            // If this specific image hasn't been downloaded yet on a fresh
                            // visit, just hide instead of showing a broken-image icon.
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
