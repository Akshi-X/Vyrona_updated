import React from "react";
import { Download, X } from "lucide-react";
import { useInstallPrompt } from "../contexts/InstallPromptContext";

export const InstallPromptCard: React.FC = () => {
    const { canInstall, promptInstall, dismiss } = useInstallPrompt();

    if (!canInstall) return null;

    return (
        <div className="relative flex-shrink-0 z-10 mx-4 md:mx-6 mb-2 rounded-xl border border-white/15 bg-white/10 p-3">
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss install prompt"
                className="absolute right-2 top-2 text-white/50 hover:text-white transition-colors"
            >
                <X size={14} strokeWidth={2.5} />
            </button>

            <div className="flex items-center gap-2.5 pr-4">
                <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0">
                    <Download size={15} strokeWidth={2.25} />
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">Install App</p>
                    <p className="text-[10px] text-white/70 leading-snug">
                        Quick, full-screen access
                    </p>
                </div>
            </div>

            <button
                type="button"
                onClick={promptInstall}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white text-primary text-xs font-semibold py-1.5 hover:bg-white/90 transition-colors"
            >
                <Download size={13} strokeWidth={2.5} />
                Install
            </button>
        </div>
    );
};
