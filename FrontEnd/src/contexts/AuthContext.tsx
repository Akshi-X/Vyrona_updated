import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
} from "react";
import type { ReactNode } from "react";
import { authUtils } from "../utils/auth";
import { authService } from "../services/authService";
import { userService } from "../services/userService";
import { runAuthenticatedHealthCheck } from "../utils/variantHealthCheck";

interface AuthContextType {
    isAuthenticated: boolean;
    token: string | undefined;
    isLoading: boolean;
    userRole?: string;
    /** undefined = profile not yet fetched; true/false = known value */
    onboardingCompleted: boolean | undefined;
    isEmailNotificationsEnabled: boolean;
    setIsEmailNotificationsEnabled: (enabled: boolean) => void;
    login: (token: string, role?: string, rememberMe?: boolean, onboardingCompleted?: boolean) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        // In dev tools / error boundaries React may render components outside the provider.
        // Fall back to a safe default instead of throwing to avoid crashing the app.
        if (import.meta.env?.MODE !== "production") {
            console.warn(
                "useAuth called outside AuthProvider – returning default unauthenticated context",
            );
        }
        return {
            isAuthenticated: false,
            token: undefined,
            isLoading: false,
            userRole: undefined,
            onboardingCompleted: undefined,
            isEmailNotificationsEnabled: true,
            setIsEmailNotificationsEnabled: () => {},
            login: () => {},
            logout: () => {},
        } as AuthContextType;
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [token, setToken] = useState<string | undefined>(undefined);
    const [userRole, setUserRole] = useState<string | undefined>(undefined);
    const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | undefined>(() => {
        // Read from localStorage so the value is immediately known on page reload.
        // undefined = unauthenticated / not yet fetched.
        try {
            const stored = localStorage.getItem("onboarding_completed");
            if (stored !== null) return stored === "true";
        } catch {}
        return undefined;
    });
    const [isLoading, setIsLoading] = useState(true);
    const [rememberMe, setRememberMe] = useState<boolean>(false);
    const sessionTimeoutRef = useRef<number | null>(null);
    const rememberMeRef = useRef<boolean>(false);
    const roleSyncAttemptedRef = useRef(false);
    const [isEmailNotificationsEnabled, setIsEmailNotificationsEnabled] =
        useState<boolean>(() => {
            try {
                const stored = localStorage.getItem("email_notify_pref");
                return stored !== null ? JSON.parse(stored) : true;
            } catch {
                return true;
            }
        });

    // Function to clear session timeout
    const clearSessionTimeout = () => {
        if (sessionTimeoutRef.current) {
            clearTimeout(sessionTimeoutRef.current);
            sessionTimeoutRef.current = null;
        }
    };

    // Function to reset inactivity timeout (only when rememberMe is false)
    const resetInactivityTimeout = React.useCallback(() => {
        // Only reset timeout when rememberMe is false and user is authenticated
        if (rememberMeRef.current || !isAuthenticated) {
            return;
        }

        // Clear existing timeout
        clearSessionTimeout();

        // Set new timeout for 1 hour of inactivity
        const timeoutDuration = 60 * 60 * 1000; // 1 hour in milliseconds
        sessionTimeoutRef.current = window.setTimeout(() => {
            // Access logout through the ref pattern to avoid circular dependency
            clearSessionTimeout();
            authService.logout();
            setToken(undefined);
            setUserRole(undefined);
            setIsAuthenticated(false);
            setRememberMe(false);
            rememberMeRef.current = false;
            localStorage.clear();
        }, timeoutDuration);
    }, [isAuthenticated]);

    // Function to set session timeout
    const setSessionTimeoutHandler = React.useCallback(
        (rememberMeValue: boolean = false) => {
            // Clear existing timeout
            clearSessionTimeout();

            setRememberMe(rememberMeValue);
            rememberMeRef.current = rememberMeValue;

            if (rememberMeValue) {
                // Fixed 9-hour timer when remember me is enabled
                const timeoutDuration = 9 * 60 * 60 * 1000; // 9 hours in milliseconds
                sessionTimeoutRef.current = window.setTimeout(() => {
                    clearSessionTimeout();
                    authService.logout();
                    setToken(undefined);
                    setUserRole(undefined);
                    setIsAuthenticated(false);
                    setRememberMe(false);
                    rememberMeRef.current = false;
                    localStorage.clear();
                }, timeoutDuration);
            } else {
                // Inactivity-based 1-hour timeout when remember me is disabled
                // Will be set up by the activity tracking useEffect
                resetInactivityTimeout();
            }
        },
        [resetInactivityTimeout],
    );

    useEffect(() => {
        // Check for existing token on mount
        const existingToken = authUtils.getToken();
        const existingRole = localStorage.getItem("user_role");
        if (existingToken) {
            setToken(existingToken);
            setIsAuthenticated(true);
            if (existingRole) {
                setUserRole(existingRole);
            }
            // Set session timeout for existing session (assume non-remember me for security)
            setSessionTimeoutHandler(false);
        }
        setIsLoading(false);

        // Function to check and sync authentication state
        const checkAndSyncAuth = () => {
            const currentToken = authUtils.getToken();
            const currentRole = localStorage.getItem("user_role");

            if (currentToken) {
                // If we have a token, ensure we're authenticated
                setToken(currentToken);
                setIsAuthenticated(true);
                if (currentRole) {
                    setUserRole(currentRole);
                }
            } else {
                // If we don't have a token, ensure we're not authenticated
                setToken(undefined);
                setIsAuthenticated(false);
                setUserRole(undefined);
            }
        };

        // Listen for storage changes (for user_role in localStorage)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "user_role") {
                const newRole = e.newValue;
                if (newRole) {
                    setUserRole(newRole);
                } else {
                    setUserRole(undefined);
                }
            }
            // Check auth state when storage changes (cookies are shared, so check token)
            checkAndSyncAuth();
        };

        // Listen for window focus to check authentication state
        // This handles the case where user logs in on another tab
        const handleFocus = () => {
            checkAndSyncAuth();
        };

        // Listen for visibility changes (when tab becomes visible)
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                checkAndSyncAuth();
            }
        };

        window.addEventListener("storage", handleStorageChange);
        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, []);

    // Fetch profile once per authenticated session to hydrate userRole and onboardingCompleted.
    // Runs whenever authenticated — decoupled from userRole so onboardingCompleted is always fresh.
    useEffect(() => {
        if (!isAuthenticated) return;
        if (!token) return;
        if (roleSyncAttemptedRef.current) return;

        roleSyncAttemptedRef.current = true;

        (async () => {
            try {
                const profile = await userService.getProfile();
                const role = (profile?.role || "").toString();
                if (role) {
                    setUserRole(role);
                    try { localStorage.setItem("user_role", role); } catch {}
                }
                const completed = profile?.onboarding_completed ?? true;
                setOnboardingCompleted(completed);
                try { localStorage.setItem("onboarding_completed", String(completed)); } catch {}
            } catch {
                // Profile fetch failed — default to completed so user isn't stuck
                setOnboardingCompleted(true);
            }
        })();
    }, [isAuthenticated, token]);

    // Persist email notification preference
    useEffect(() => {
        try {
            localStorage.setItem(
                "email_notify_pref",
                JSON.stringify(isEmailNotificationsEnabled),
            );
        } catch {}
    }, [isEmailNotificationsEnabled]);

    // Activity tracking for inactivity timeout (only when rememberMe is false)
    useEffect(() => {
        if (!rememberMe && isAuthenticated) {
            // List of events that indicate user activity
            const activityEvents = [
                "mousedown",
                "mousemove",
                "keypress",
                "scroll",
                "touchstart",
                "click",
                "keydown",
            ];

            // Throttle function to limit how often we reset the timeout
            let throttleTimer: number | null = null;
            const handleActivity = () => {
                // Only reset if rememberMe is still false
                if (rememberMeRef.current) {
                    return;
                }

                if (throttleTimer) {
                    return;
                }

                throttleTimer = window.setTimeout(() => {
                    resetInactivityTimeout();
                    throttleTimer = null;
                }, 1000); // Reset timeout at most once per second
            };

            // Add event listeners
            activityEvents.forEach((event) => {
                document.addEventListener(event, handleActivity, true);
            });

            // Initial timeout setup
            resetInactivityTimeout();

            // Cleanup
            return () => {
                activityEvents.forEach((event) => {
                    document.removeEventListener(event, handleActivity, true);
                });
                if (throttleTimer) {
                    clearTimeout(throttleTimer);
                }
            };
        }
    }, [rememberMe, isAuthenticated, resetInactivityTimeout]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            clearSessionTimeout();
        };
    }, []);

    const login = (
        newToken: string,
        role?: string,
        rememberMe: boolean = false,
        onboardingCompleted?: boolean,
    ) => {
        authUtils.setToken(newToken, rememberMe);
        setToken(newToken);
        setIsAuthenticated(true);

        if (role) {
            setUserRole(role);
            localStorage.setItem("user_role", role);
        }

        if (onboardingCompleted !== undefined) {
            setOnboardingCompleted(onboardingCompleted);
            localStorage.setItem("onboarding_completed", String(onboardingCompleted));
        }

        // Set session timeout
        setSessionTimeoutHandler(rememberMe);
    };

    const logout = () => {
        // Clear session timeout
        clearSessionTimeout();

        setRememberMe(false);
        rememberMeRef.current = false;
        roleSyncAttemptedRef.current = false;
        authService.logout();
        setToken(undefined);
        setUserRole(undefined);
        setOnboardingCompleted(undefined);
        setIsAuthenticated(false);
        localStorage.clear();
    };

    const value: AuthContextType = {
        isAuthenticated,
        token,
        isLoading,
        userRole,
        onboardingCompleted,
        isEmailNotificationsEnabled,
        setIsEmailNotificationsEnabled,
        login,
        logout,
    };

    // Run variant health check once the user becomes authenticated (dev/staging only).
    // This ensures the health check never fires on the login page or any
    // unauthenticated route, because it calls authenticated server endpoints.
    useEffect(() => {
        if (isAuthenticated) {
            runAuthenticatedHealthCheck();
        }
    }, [isAuthenticated]);

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};
