import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pushNotificationService, type PushSubscriptionSummary } from "../services/pushNotificationService";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../utils/push";
import { authUtils } from "../utils/auth";

interface PushNotificationContextValue {
    supported: boolean;
    permission: NotificationPermission | "unsupported";
    loading: boolean;
    deviceEnabled: boolean;
    globalEnabled: boolean;
    subscriptions: PushSubscriptionSummary[];
    enableOnThisDevice: () => Promise<void>;
    disableOnThisDevice: () => Promise<void>;
    setGlobalEnabled: (enabled: boolean) => Promise<void>;
    removeSubscription: (id: number) => Promise<void>;
    toggleSubscription: (id: number, enabled: boolean) => Promise<void>;
    sendTest: () => Promise<{ sent: number; total: number }>;
    refresh: () => Promise<void>;
}

const PushNotificationContext = createContext<PushNotificationContextValue | undefined>(undefined);

export const PushNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const supported = isPushSupported();
    const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
        supported ? Notification.permission : "unsupported",
    );
    const [loading, setLoading] = useState(true);
    const [globalEnabled, setGlobalEnabledState] = useState(true);
    const [subscriptions, setSubscriptions] = useState<PushSubscriptionSummary[]>([]);

    const refresh = useCallback(async () => {
        if (!supported || !authUtils.isAuthenticated()) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const existing = await getExistingSubscription();
            const preferences = await pushNotificationService.getPreferences(existing?.endpoint);
            setGlobalEnabledState(preferences.push_enabled);
            setSubscriptions(preferences.subscriptions);
        } catch {
            // Preferences endpoint requires auth — silently no-op when logged out.
        } finally {
            setPermission(Notification.permission);
            setLoading(false);
        }
    }, [supported]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const enableOnThisDevice = useCallback(async () => {
        if (!supported) return;
        const permissionResult = await Notification.requestPermission();
        setPermission(permissionResult);
        if (permissionResult !== "granted") return;

        const { public_key } = await pushNotificationService.getVapidPublicKey();
        const subscription = await subscribeToPush(public_key);
        const raw = subscription.toJSON();

        await pushNotificationService.subscribe({
            endpoint: subscription.endpoint,
            keys: {
                p256dh: raw.keys?.p256dh || "",
                auth: raw.keys?.auth || "",
            },
        });

        await refresh();
    }, [supported, refresh]);

    const disableOnThisDevice = useCallback(async () => {
        const current = subscriptions.find((s) => s.current);
        if (current) {
            await pushNotificationService.updateSubscription(current.id, false);
        }
        await refresh();
    }, [subscriptions, refresh]);

    const setGlobalEnabled = useCallback(async (enabled: boolean) => {
        await pushNotificationService.updatePreferences(enabled);
        setGlobalEnabledState(enabled);
    }, []);

    const removeSubscription = useCallback(async (id: number) => {
        const target = subscriptions.find((s) => s.id === id);
        await pushNotificationService.deleteSubscription(id);
        if (target?.current) {
            await unsubscribeFromPush();
        }
        await refresh();
    }, [subscriptions, refresh]);

    const toggleSubscription = useCallback(async (id: number, enabled: boolean) => {
        await pushNotificationService.updateSubscription(id, enabled);
        await refresh();
    }, [refresh]);

    const sendTest = useCallback(() => pushNotificationService.sendTest(), []);

    const deviceEnabled = subscriptions.some((s) => s.current && s.enabled);

    const value = useMemo<PushNotificationContextValue>(
        () => ({
            supported,
            permission,
            loading,
            deviceEnabled,
            globalEnabled,
            subscriptions,
            enableOnThisDevice,
            disableOnThisDevice,
            setGlobalEnabled,
            removeSubscription,
            toggleSubscription,
            sendTest,
            refresh,
        }),
        [
            supported,
            permission,
            loading,
            deviceEnabled,
            globalEnabled,
            subscriptions,
            enableOnThisDevice,
            disableOnThisDevice,
            setGlobalEnabled,
            removeSubscription,
            toggleSubscription,
            sendTest,
            refresh,
        ],
    );

    return <PushNotificationContext.Provider value={value}>{children}</PushNotificationContext.Provider>;
};

export const usePushNotifications = (): PushNotificationContextValue => {
    const ctx = useContext(PushNotificationContext);
    if (!ctx) {
        throw new Error("usePushNotifications must be used within a PushNotificationProvider");
    }
    return ctx;
};
