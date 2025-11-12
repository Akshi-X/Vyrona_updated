import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MyGrapeLogo from "../../assets/logo.svg";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";
import { useAuth } from "../../contexts/AuthContext";
import { authService } from "../../services/authService";
import { authUtils } from "../../utils/auth";

const VerifyOtp: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { login } = useAuth();

    const { userId, otpExpiry, fromPath } = location.state || {};

    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [timer, setTimer] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Helper function to clear the timer interval
    const clearTimer = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    // Removed API_BASE_URL - now using authService

    // Countdown for OTP Expiry (if backend sends expiry in ISO)
    useEffect(() => {
        // Clear any existing interval
        clearTimer();

        if (otpExpiry) {
            const expiry = new Date(otpExpiry).getTime();
            const now = new Date().getTime();
            const initialRemaining = Math.max(0, Math.floor((expiry - now) / 1000));
            setTimer(initialRemaining);
            
            const interval = setInterval(() => {
                const currentTime = new Date().getTime();
                const remaining = Math.max(0, Math.floor((expiry - currentTime) / 1000));
                setTimer(remaining);
                if (remaining <= 0) {
                    clearTimer();
                }
            }, 1000);
            intervalRef.current = interval;
            return () => {
                clearTimer();
            };
        } else {
            // If no expiry provided, set a default timer (e.g., 5 minutes)
            setTimer(300); // 5 minutes default
            const interval = setInterval(() => {
                setTimer(prev => {
                    if (prev === null || prev <= 1) {
                        clearTimer();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            intervalRef.current = interval;
            return () => {
                clearTimer();
            };
        }
    }, [otpExpiry]);

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
            const response = await authService.verifyOTP({
                user_id: userId,
                otp,
            });

            if (response.status === "Logged In") {
                setSuccess("OTP verified successfully!");
                // Stop the timer when verification is successful
                clearTimer();
                // Save auth token using context
                if (response.auth_token) {
                    // Set token with proper expiration (1 hour for non-remember me)
                    authUtils.setToken(response.auth_token, false);
                    login(response.auth_token, response.role);
                }
                // Persist user id for pages that need it (e.g., My Tickets)
                try {
                    localStorage.setItem('user_id', response.user_id);
                } catch {}
                
                // Check if user role is admin and redirect accordingly
                let target;
                if (response.role === "mygrape_admin") {
                    target = "/user-profile";
                } else {
                    // Redirect back to original page if provided, else dashboard
                    target = fromPath && typeof fromPath === "string" ? fromPath : "/dashboard";
                }
                
                setTimeout(() => navigate(target, { replace: true }), 500);
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
            {/* Left Section */}
            <aside
                className="w-[35%] h-screen flex flex-col justify-between text-white relative overflow-hidden 
             bg-gradient-to-b from-[#9C3AA6] to-[#30024D] 
             rounded-tr-[40px] rounded-br-[40px]"
            >
                {/* Background Banner Image */}
                <div className="absolute inset-0 flex items-center justify-center z-0 overflow-hidden">
                    <img
                        src={MyGrapeBanner}
                        className="w-full h-auto max-h-full object-contain"
                        alt="banner"
                    />
                </div>
                
                <div className="flex h-[15%] items-center space-x-2 p-12 pb-0 relative z-10">
                    <img src={MyGrapeLogo} alt="logo" className="w-[41.87px] h-[55px]" />
                    <h1 className="font-semibold text-[30px]">myGrape</h1>
                </div>

                <div className="flex-1 relative z-0"></div>

                <div className="flex flex-col h-[20%] justify-end pt-0 p-12 pr-0 relative z-10">
                    <h2 className="text-2xl font-bold leading-snug mt-8">
                        Driving Health Forward <br />
                        One Smart Solution At a Time
                    </h2>
                    <p className="mt-4 opacity-80 font-[12px]">
                        Because every patient is someone's everything.
                    </p>
                </div>
            </aside>

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
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength={6}
                                placeholder="Enter OTP"
                                className="w-full border border-gray-300 rounded-md px-3 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#8b2a96]"
                            />
                            

                        {error && <p className="text-red-500 text-sm text-center mt-1">{error}</p>}
                        {success && <p className="text-green-600 text-sm text-center mt-1">{success}</p>}
                        </div>

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
                                OTP expired. Please resend.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3 mb-3 rounded-md font-medium text-white transition ${loading
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-[#6b1176] hover:bg-[#8b2a96]"
                                }`}
                        >
                            {loading ? "Verifying..." : "Verify OTP"}
                        </button>

                        <button
                            type="button"
                            className="w-full py-2 text-[#8b2a96] text-sm font-semibold underline mt-2"
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
