import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const DISMISSED_STORAGE_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPromptContextValue {
    canInstall: boolean;
    isIOS: boolean;
    showIOSGuide: boolean;
    promptInstall: () => Promise<void>;
    dismiss: () => void;
    closeIOSGuide: () => void;
}

const InstallPromptContext = createContext<InstallPromptContextValue | undefined>(undefined);

const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

// iOS Safari never fires beforeinstallprompt — no native install flow exists there.
// iPadOS reports as "MacIntel" in the UA, so touch support disambiguates it from a real Mac.
const isIOS = () => {
    const ua = window.navigator.userAgent;
    return (
        /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
};

export const InstallPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(isStandalone);
    const [dismissed, setDismissed] = useState(
        () => localStorage.getItem(DISMISSED_STORAGE_KEY) === "true",
    );
    const [showIOSGuide, setShowIOSGuide] = useState(false);
    const ios = useMemo(isIOS, []);

    useEffect(() => {
        const onBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setDeferredEvent(event as BeforeInstallPromptEvent);
        };
        const onAppInstalled = () => {
            setInstalled(true);
            setDeferredEvent(null);
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.addEventListener("appinstalled", onAppInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("appinstalled", onAppInstalled);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        if (ios) {
            setShowIOSGuide(true);
            return;
        }
        if (!deferredEvent) return;
        await deferredEvent.prompt();
        await deferredEvent.userChoice;
        setDeferredEvent(null);
    }, [ios, deferredEvent]);

    const dismiss = useCallback(() => {
        localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
        setDismissed(true);
        setShowIOSGuide(false);
    }, []);

    const closeIOSGuide = useCallback(() => {
        setShowIOSGuide(false);
    }, []);

    // iOS has no beforeinstallprompt event, so canInstall can't wait on deferredEvent there.
    const canInstall = (ios || Boolean(deferredEvent)) && !installed && !dismissed;

    const value = useMemo<InstallPromptContextValue>(
        () => ({ canInstall, isIOS: ios, showIOSGuide, promptInstall, dismiss, closeIOSGuide }),
        [canInstall, ios, showIOSGuide, promptInstall, dismiss, closeIOSGuide],
    );

    return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
};

export const useInstallPrompt = (): InstallPromptContextValue => {
    const ctx = useContext(InstallPromptContext);
    if (!ctx) {
        throw new Error("useInstallPrompt must be used within an InstallPromptProvider");
    }
    return ctx;
};
