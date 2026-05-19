import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authService } from "../../services/authService";
import AuthBrandPanel from "../../components/AuthBrandPanel";

const ForgotPassword: React.FC = () => {
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [serverError, setServerError] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const validateEmail = (email: string) => {
        const regex = /^[^\s@#]+@[^\s@#]+\.[^\s@#]+$/;
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
            <AuthBrandPanel />

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
                                className={`peer w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-light ${emailError ? "border-red-500" : "border-gray-300"}`}
                            />
                            <label
                                className={`absolute -top-3 left-2 bg-white px-1 text-sm font-medium tracking-wide transition-opacity
                                ${emailError ? "text-red-500 opacity-100" : "text-primary-light opacity-0 peer-focus:opacity-100"}`}
                            >
                                Email
                            </label>

                        </div>

                        {/* Send Instructions Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 mb-1 bg-primary text-white rounded-md font-medium hover:bg-primary-light transition disabled:opacity-50 cursor-pointer"
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
                            <Link to="/login" className="text-primary-light font-semibold underline">
                                Sign in
                            </Link>
                        </p>
                        <p>
                            Don't have an account?{" "}
                            <Link to="/signup" className="text-primary-light font-semibold underline">
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
