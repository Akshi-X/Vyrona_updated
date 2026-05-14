import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authService } from "../../services/authService";
import { authUtils } from "../../utils/auth";
import AuthBrandPanel from "../../components/AuthBrandPanel";

const VerifyOtp: React.FC = () => {
    const OTP_EXPIRY_SESSION_KEY = "verify_otp_expiry_timestamp";
    const OTP_EMAIL_SESSION_KEY = "verify_otp_email";

    const location = useLocation();
    const navigate = useNavigate();
    const { login, isAuthenticated } = useAuth();

    const { userId, email: emailFromState, otpExpiry, fromPath: fromPathFromState, rememberMe } = location.state || {};
    const otpEmail = emailFromState || sessionStorage.getItem(OTP_EMAIL_SESSION_KEY) || "";
    
    // Get fromPath from state or sessionStorage
    const getFromPath = () => {
        if (fromPathFromState) {
            return fromPathFromState;
        }
        // Fallback to sessionStorage
        try {
            const storedPath = sessionStorage.getItem('approval_redirect_path');
            if (storedPath) {
                return storedPath;
            }
        } catch (e) {
            // Silently handle sessionStorage errors
        }
        return undefined;
    };
    
    const fromPath = getFromPath();
    
    // Store fromPath in a ref to ensure it persists
    const fromPathRef = useRef<string | undefined>(fromPath);
    
    // Update ref when fromPath changes
    useEffect(() => {
        const currentPath = getFromPath();
        if (currentPath) {
            fromPathRef.current = currentPath;
        }
    }, [fromPathFromState, location.state, isAuthenticated]);
    
    // State to track if OTP was successfully verified
    const [otpVerified, setOtpVerified] = useState(false);
    const [verifiedRole, setVerifiedRole] = useState<string | undefined>(undefined);
    const [verifiedOnboardingCompleted, setVerifiedOnboardingCompleted] = useState<boolean>(true);

    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [timer, setTimer] = useState<number | null>(null);
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
    const [currentOtpExpiry, setCurrentOtpExpiry] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const expiryTimestampRef = useRef<number | null>(null);

    // Helper function to clear the timer interval
    const clearTimer = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    // Initialize currentOtpExpiry from incoming otpExpiry
    useEffect(() => {
        if (otpExpiry && !currentOtpExpiry) {
            setCurrentOtpExpiry(otpExpiry);
        }
    }, [otpExpiry, currentOtpExpiry]);

    // Persist OTP email for resend flow after refresh
    useEffect(() => {
        if (!emailFromState) {
            return;
        }

        try {
            sessionStorage.setItem(OTP_EMAIL_SESSION_KEY, emailFromState);
        } catch {
            // Silently handle sessionStorage errors
        }
    }, [emailFromState]);

    // Removed API_BASE_URL - now using authService

    // Countdown for OTP expiry based on absolute timestamp.
    // This remains accurate even when browser throttles inactive tabs.
    useEffect(() => {
        // Clear any existing interval
        clearTimer();

        const DEFAULT_OTP_TTL_SECONDS = 600;

        const resolveExpiryTimestamp = (): number => {
            const parseExpiry = (value: unknown): number | null => {
                if (typeof value === "number" && Number.isFinite(value)) {
                    return value > 1_000_000_000_000 ? value : value * 1000;
                }

                if (typeof value === "string") {
                    const asNumber = Number(value);
                    if (Number.isFinite(asNumber) && value.trim() !== "") {
                        return asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
                    }

                    const parsed = Date.parse(value);
                    if (!Number.isNaN(parsed)) {
                        return parsed;
                    }
                }

                return null;
            };

            const fromState = parseExpiry(currentOtpExpiry);
            if (fromState) {
                try {
                    sessionStorage.setItem(OTP_EXPIRY_SESSION_KEY, String(fromState));
                } catch { }
                return fromState;
            }

            try {
                const stored = sessionStorage.getItem(OTP_EXPIRY_SESSION_KEY);
                const fromStorage = parseExpiry(stored);
                if (fromStorage) {
                    return fromStorage;
                }
            } catch { }

            const fallback = Date.now() + DEFAULT_OTP_TTL_SECONDS * 1000;
            try {
                sessionStorage.setItem(OTP_EXPIRY_SESSION_KEY, String(fallback));
            } catch { }
            return fallback;
        };

        expiryTimestampRef.current = resolveExpiryTimestamp();

        const updateTimerFromExpiry = () => {
            const expiryTimestamp = expiryTimestampRef.current;
            if (!expiryTimestamp) {
                setTimer(0);
                return;
            }

            const remainingSeconds = Math.max(0, Math.ceil((expiryTimestamp - Date.now()) / 1000));
            setTimer(remainingSeconds);

            if (remainingSeconds <= 0) {
                clearTimer();
            }
        };

        updateTimerFromExpiry();

        const interval = setInterval(() => {
            updateTimerFromExpiry();
        }, 1000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                updateTimerFromExpiry();
            }
        };

        const handleOnline = () => {
            setIsOnline(true);
            updateTimerFromExpiry();
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        
        intervalRef.current = interval;
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            clearTimer();
        };
    }, [currentOtpExpiry]); // Re-start timer if OTP is resent (currentOtpExpiry changes)

    const handleResendOTP = async () => {
        const DEFAULT_OTP_TTL_MS = 10 * 60 * 1000;
        setResending(true);
        setError("");
        setSuccess("");
        setOtp("");

        try {
            if (!userId) {
                setError("Session expired. Please login again.");
                navigate("/login");
                return;
            }

            if (!otpEmail) {
                setError("Session expired. Please login again.");
                navigate("/login");
                return;
            }

            const response = await authService.resendOTP(userId, otpEmail);

            const normalizedExpiry = response?.otp_expiry
                ? (typeof response.otp_expiry === "number"
                    ? (response.otp_expiry > 1_000_000_000_000 ? response.otp_expiry : response.otp_expiry * 1000)
                    : typeof response.otp_expiry === "string"
                        ? (Number(response.otp_expiry) > 1_000_000_000_000 ? Number(response.otp_expiry) : Number(response.otp_expiry) * 1000)
                        : response.otp_expiry.getTime?.())
                : null;

            const nextExpiry = Number.isFinite(normalizedExpiry)
                ? Number(normalizedExpiry)
                : Date.now() + DEFAULT_OTP_TTL_MS;

            setCurrentOtpExpiry(nextExpiry);
            setSuccess(response?.message || "A new one-time password (OTP) has been sent to your registered email");
            try {
                sessionStorage.setItem(OTP_EXPIRY_SESSION_KEY, String(nextExpiry));
            } catch {
                // Silently handle sessionStorage errors
            }
        } catch (err: any) {
            setError(err.message || "Failed to resend OTP");
        } finally {
            setResending(false);
        }
    };
    
    // Handle redirect after OTP verification
    useEffect(() => {
        if (otpVerified && isAuthenticated) {
            const targetPath = fromPathRef.current;

            setTimeout(() => {
                // Onboarding-pending users always go to onboarding, regardless of fromPath
                if (!verifiedOnboardingCompleted) {
                    navigate("/onboarding/dashboard", { replace: true });
                } else if (targetPath && typeof targetPath === "string" && targetPath.trim() !== "") {
                    navigate(targetPath, { replace: true });
                } else if (verifiedRole?.toLowerCase() === "mygrape_admin") {
                    navigate("/user-profile", { replace: true });
                } else {
                    navigate("/dashboard", { replace: true });
                }
            }, 500);
        }
    }, [otpVerified, isAuthenticated, verifiedRole, verifiedOnboardingCompleted, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (otp.trim().length !== 6) {
            setError("Please enter a valid 6-digit OTP");
            return;
        }

        try {
            setLoading(true);
            const shouldRemember = rememberMe === true;
            const response = await authService.verifyOTP({
                user_id: userId,
                otp,
            }, shouldRemember);

            if (response.status === "Logged In") {
                setSuccess("OTP verified successfully!");
                // Stop the timer when verification is successful
                clearTimer();
                try {
                    sessionStorage.removeItem(OTP_EXPIRY_SESSION_KEY);
                    sessionStorage.removeItem(OTP_EMAIL_SESSION_KEY);
                } catch { }

                // Persist department for feature gating (e.g., IVF Control Tower)
                try {
                    if (response.department) {
                        localStorage.setItem('department', response.department);
                    } else {
                        localStorage.removeItem('department');
                    }
                } catch { }

                // Save auth token using context
                if (response.auth_token) {
                    // Set token with proper expiration based on rememberMe setting
                    const shouldRemember = rememberMe === true;
                    authUtils.setToken(response.auth_token, shouldRemember);
                    login(response.auth_token, response.role, shouldRemember, response.onboarding_completed ?? true);
                }
                // Persist user id for pages that need it (e.g., My Tickets)
                try {
                    localStorage.setItem('user_id', response.user_id);
                } catch { }

                // Set flags to trigger redirect in useEffect
                setOtpVerified(true);
                setVerifiedRole(response.role);
                setVerifiedOnboardingCompleted(response.onboarding_completed ?? true);
            } else {
                setError(response.message || "Invalid OTP");
            }
        } catch (err: any) {
            setError(err.message || "Verification failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-screen flex overflow-hidden bg-white font-['Work_Sans']">
            <AuthBrandPanel />

            {/* Right Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-16 overflow-hidden">
                <div className="w-full max-w-[22rem]">
                    <h2 className="text-[32px] font-black text-gray-700 mb-2 tracking-tighter">
                        Verify OTP
                    </h2>
                    <p className="text-gray-500 mb-6">
                        Enter Your 6-digit code
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="relative mb-3">
                            <input
                                type="text"
                                inputMode="numeric"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength={6}
                                placeholder="Enter OTP"
                                className="w-full border border-gray-300 rounded-md px-3 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#8b2a96]"
                            />


                            {error && <p className="text-red-500 text-sm text-center mt-1">{error}</p>}
                            {success && <p className="text-green-600 text-sm text-center mt-1">{success}</p>}
                        </div>

                        {!isOnline && (
                            <p className="text-xs text-amber-600 text-center mb-2">
                                You are offline. Timer may not sync with server until internet reconnects.
                            </p>
                        )}

                        {timer === null ? (
                            <p className="text-sm text-gray-500 text-center mb-3">
                                Loading timer...
                            </p>
                        ) : timer > 0 ? (
                            <p className="text-sm text-gray-500 text-center mb-3">
                                OTP expires in {(() => {
                                    const minutes = Math.floor((timer as number) / 60);
                                    const seconds = (timer as number) % 60;
                                    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                    return <span className="font-medium">{formatted}</span>;
                                })()}
                            </p>
                        ) : (
                            <p className="text-sm text-red-500 text-center mb-3">
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={resending}
                                    className="text-[#8b2a96] font-semibold underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {resending ? "Sending..." : "Resend OTP"}
                                </button>
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || timer === 0}
                            className={`w-full py-3 mb-3 rounded-md font-medium text-white transition ${loading || timer === 0
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-primary hover:bg-[#8b2a96] cursor-pointer"
                                }`}
                        >
                            {loading ? "Verifying..." : "Verify OTP"}
                        </button>

                        <button
                            type="button"
                            className="w-full py-2 text-[#8b2a96] text-sm font-semibold underline mt-2 cursor-pointer"
                            onClick={() => navigate("/login")}
                        >
                            Back to Login
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
};

export default VerifyOtp;
