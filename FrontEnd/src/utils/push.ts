export const isPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const getExistingSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

export const subscribeToPush = async (vapidPublicKey: string): Promise<PushSubscription> => {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
};

export const unsubscribeFromPush = async (): Promise<boolean> => {
  const subscription = await getExistingSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
};

/**
 * Best-effort cleanup on logout: removes this browser's subscription row
 * server-side (using a token captured before the auth cookie is cleared,
 * since logout clears it synchronously) and unsubscribes the browser's
 * PushManager so a shared workstation stops receiving the previous user's
 * alerts immediately, without waiting on the network call.
 */
export const unsubscribeFromPushOnLogout = (authToken: string | undefined): void => {
  if (!authToken || !isPushSupported()) return;

  void (async () => {
    try {
      const subscription = await getExistingSubscription();
      if (!subscription) return;

      const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
      const baseUrl = envBaseUrl && envBaseUrl !== "undefined" ? envBaseUrl : "http://localhost:8000";

      await fetch(`${baseUrl}/api/push/subscribe`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);

      await subscription.unsubscribe();
    } catch {
      // Best-effort only — a failed cleanup here must never block logout.
    }
  })();
};
