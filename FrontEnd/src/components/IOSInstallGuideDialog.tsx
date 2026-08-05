import React from "react";
import { createPortal } from "react-dom";
import { Share, SquarePlus, X } from "lucide-react";
import { useInstallPrompt } from "../contexts/InstallPromptContext";

export const IOSInstallGuideDialog: React.FC = () => {
    const { showIOSGuide, closeIOSGuide, dismiss } = useInstallPrompt();

    if (!showIOSGuide) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={closeIOSGuide}
        >
            <div
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-lg text-black">Install App</h3>
                    <button
                        type="button"
                        onClick={closeIOSGuide}
                        className="w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500"
                        aria-label="Close install guide"
                    >
                        <X size={16} />
                    </button>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                    Safari on iOS installs apps manually — follow these two steps.
                </p>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 font-bold text-sm">
                            1
                        </span>
                        <p className="text-sm text-gray-700 flex items-center gap-1.5 flex-wrap">
                            Tap the Share icon
                            <Share size={15} strokeWidth={2.25} className="text-primary shrink-0" />
                            in Safari's toolbar.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 font-bold text-sm">
                            2
                        </span>
                        <p className="text-sm text-gray-700 flex items-center gap-1.5 flex-wrap">
                            Scroll down and tap
                            <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
                                <SquarePlus size={15} strokeWidth={2.25} className="text-primary shrink-0" />
                                Add to Home Screen
                            </span>
                            .
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={dismiss}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Don't show again
                    </button>
                    <button
                        type="button"
                        onClick={closeIOSGuide}
                        className="rounded-lg bg-primary text-white text-xs font-semibold px-4 py-2 hover:bg-primary/90 transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
