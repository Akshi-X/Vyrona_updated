import React, { useState, useEffect } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import MyGrapeLogo from "../../assets/logo.svg";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";

const VerifyOtp: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { userId, email, otpExpiry } = location.state || {};

    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [timer, setTimer] = useState(0);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    // Countdown for OTP Expiry (if backend sends expiry in ISO)
    useEffect(() => {
        if (otpExpiry) {
            const expiry = new Date(otpExpiry).getTime();
            const interval = setInterval(() => {
                const now = new Date().getTime();
                const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
                setTimer(remaining);
                if (remaining <= 0) clearInterval(interval);
            }, 1000);
            return () => clearInterval(interval);
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
            const response = await axios.post(`${API_BASE_URL}/api/verify-otp`, {
                user_id: userId,
                otp,
            });

            if (response.data.status === "Logged In") {
                setSuccess("OTP verified successfully!");
                localStorage.setItem("auth_token", response.data.auth_token);
                setTimeout(() => navigate("/dashboard"), 1000);
            } else {
                setError(response.data.message || "Invalid OTP");
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Verification failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-screen flex overflow-hidden bg-white font-['Work_Sans']">
            {/* Left Section */}
            <aside
                className="w-[36%] flex flex-col justify-between text-white relative overflow-hidden 
             bg-gradient-to-b from-[#9C3AA6] to-[#30024D] 
             rounded-tr-[40px] rounded-br-[40px]"
            >
                <div className="flex h-[15%] items-center space-x-2  p-12 pb-0 ">
                    <img src={MyGrapeLogo} alt="logo" className="w-[41.87px] h-[55px]" />
                    <h1 className="font-semibold text-[30px]">myGrape</h1>
                </div>
                <div className="flex items-center overflow-hidden">
                    <img
                        src={MyGrapeBanner}
                        alt="banner"
                        className="w-full h-[125%] object-fill"
                    />
                </div>
                <div className="flex flex-col h-[20%] justify-end pt-0 p-12 ">
                    <h2 className="text-2xl font-bold leading-snug mt-8">
                        Driving Health Forward <br />
                        One Smart Solution At a Time
                    </h2>
                    <p className="mt-4 text-sm opacity-80">
                        Because every patient is someone’s everything.
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

                        {timer > 0 ? (
                            <p className="text-sm text-gray-500 text-center mb-3">
                                OTP expires in <span className="font-medium">{timer}s</span>
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
                            className="w-full py-2 text-[#8b2a96] text-sm font-medium underline mt-2"
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
