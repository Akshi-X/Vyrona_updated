import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const DISMISSED_STORAGE_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPromptContextValue {
    canInstall: boolean;
    promptInstall: () => Promise<void>;
    dismiss: () => void;
}

const InstallPromptContext = createContext<InstallPromptContextValue | undefined>(undefined);

const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

export const InstallPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(isStandalone);
    const [dismissed, setDismissed] = useState(
        () => localStorage.getItem(DISMISSED_STORAGE_KEY) === "true",
    );

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
        if (!deferredEvent) return;
        await deferredEvent.prompt();
        await deferredEvent.userChoice;
        setDeferredEvent(null);
    }, [deferredEvent]);

    const dismiss = useCallback(() => {
        localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
        setDismissed(true);
    }, []);

    const canInstall = Boolean(deferredEvent) && !installed && !dismissed;

    const value = useMemo<InstallPromptContextValue>(
        () => ({ canInstall, promptInstall, dismiss }),
        [canInstall, promptInstall, dismiss],
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
