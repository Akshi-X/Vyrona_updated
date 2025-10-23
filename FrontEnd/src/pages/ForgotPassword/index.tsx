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
            setServerError(err?.message || "Network error. Please try again.");
            setMessage("");
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
                        </div>

                        {/* Send Instructions Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-[#6b1176] text-white rounded-md font-medium hover:bg-[#8b2a96] transition disabled:opacity-50"
                        >
                            {loading ? "Sending..." : "Send"}
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
