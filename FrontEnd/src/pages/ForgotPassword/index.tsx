import React, { useState } from "react";
import { Link } from "react-router-dom";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../../assets/logo.svg";
import { authService } from "../../services/authService";

const ForgotPassword: React.FC = () => {
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [serverError, setServerError] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const validateEmail = (email: string) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
        setServerError(""); // Clear server error when user types
        if (!e.target.value) {
            setEmailError("Email is required");
        } else if (!validateEmail(e.target.value)) {
            setEmailError("Invalid Email ID");
        } else {
            setEmailError("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let valid = true;

        if (!email) {
            setEmailError("Email is required");
            valid = false;
        } else if (!validateEmail(email)) {
            setEmailError("Invalid Email ID");
            valid = false;
        }

        if (!valid) return;

        setEmailError("");
        setServerError("");
        setLoading(true);
        setMessage("");

        try {
            const resp = await authService.forgotPassword(email);
            setMessage(resp?.message || "Password reset link has been sent to your email");
            setServerError("");
        } catch (err: any) {
            // Extract error message from backend response
            const errorMessage = err?.response?.data?.message || err?.message || "Network error. Please try again.";
            setServerError(errorMessage);
            setMessage("");
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

                <div className="flex flex-col h-[20%] justify-end pt-0 p-12 relative z-10">
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
                    <h2
                        className="font-['Work_Sans'] text-[32px] font-black text-gray-700 mb-2 tracking-tighter"
                    >
                        Forgot Password?
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Email Field */}
                        <div className="relative w-full my-4">
                            <input
                                type="email"
                                value={email}
                                onChange={handleEmailChange}
                                placeholder="Enter your email"
                                className={`peer w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${emailError ? "border-red-500" : "border-gray-300"}`}
                            />
                            <label
                                className={`absolute -top-3 left-2 bg-white px-1 text-sm font-medium tracking-wide transition-opacity
                                ${emailError ? "text-red-500 opacity-100" : "text-[#8b2a96] opacity-0 peer-focus:opacity-100"}`}
                            >
                                Email
                            </label>

                        </div>

                        {/* Send Instructions Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 mb-1 bg-[#6b1176] text-white rounded-md font-medium hover:bg-[#8b2a96] transition disabled:opacity-50"
                        >
                            {loading ? "Sending..." : "Send"}
                        </button>
                        {/* Server Response Message */}
                        {(message || emailError || serverError) && (
                            <div>
                                {message && (
                                    <p className="text-sm text-green-600 mt-2">{message}</p>
                                )}
                                {emailError && !message && (
                                    <p className="text-sm text-red-600 mt-2">{emailError}</p>
                                )}
                                {serverError && !message && (
                                    <p className="text-sm text-red-600 mt-2">{serverError}</p>
                                )}
                            </div>
                        )}
                    </form>

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-500 mt-2 space-y-2">
                        <p>
                            Remember your password?{" "}
                            <Link to="/login" className="text-[#8b2a96] font-medium underline">
                                Sign in
                            </Link>
                        </p>
                        <p>
                            Don't have an account?{" "}
                            <Link to="/signup" className="text-[#8b2a96] font-medium underline">
                                Create one
                            </Link>
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ForgotPassword;
