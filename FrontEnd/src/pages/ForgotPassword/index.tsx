import React, { useState } from "react";
import { Link } from "react-router-dom";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../../assets/logo.svg";

const ForgotPassword: React.FC = () => {
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const validateEmail = (email: string) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
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
        setLoading(true);
        setMessage("");

        try {
            // TODO: Integrate actual forgot password API
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setMessage("Password reset instructions sent to your email");
        } catch (err: any) {
            setEmailError(err.message || "Failed to send reset instructions");
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
                <div className="flex h-[15%] items-center space-x-2 p-12 pb-0">
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
                <div className="flex flex-col h-[20%] justify-end pt-0 p-12">
                    <h2 className="text-2xl font-bold leading-snug mt-8">
                        Driving Health Forward <br />
                        One Smart Solution At a Time
                    </h2>
                    <p className="mt-4 text-sm opacity-80">
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
                    <p className="text-gray-500 mb-8">
                        No worries! Enter your email address and we'll send you reset instructions.
                    </p>

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
                            {emailError && (
                                <p className="text-xs text-red-500 mt-1">{emailError}</p>
                            )}
                        </div>

                        {/* Success Message */}
                        {message && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                                <p className="text-sm text-green-600">{message}</p>
                            </div>
                        )}

                        {/* Send Instructions Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-[#6b1176] text-white rounded-md font-medium hover:bg-[#8b2a96] transition disabled:opacity-50"
                        >
                            {loading ? "Sending..." : "Send Reset Instructions"}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-500 mt-8 space-y-2">
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
