import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../../assets/logo.svg";
import EyeOffIcon from "../../assets/eye-off.svg";
import EyeOpenIcon from "../../assets/EyeOpen.svg";
import { authService } from "../../services/authService";

const ResetPassword: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const tokenFromQuery = searchParams.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [confirmError, setConfirmError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);

    const validatePassword = (value: string) => {
        return value.length >= 8;
    };

    // Handle navigation to login page after 3 seconds on success
    useEffect(() => {
        if (isSuccess) {
            const timer = setTimeout(() => {
                navigate('/login');
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [isSuccess, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let valid = true;

        if (!tokenFromQuery) {
            setMessage("Invalid or missing token");
            return;
        }

        if (!password) {
            setPasswordError("Password is required");
            valid = false;
        } else if (!validatePassword(password)) {
            setPasswordError("Password must be at least 8 characters");
            valid = false;
        } else {
            setPasswordError("");
        }

        if (!confirmPassword) {
            setConfirmError("Please confirm your password");
            valid = false;
        } else if (confirmPassword !== password) {
            setConfirmError("Passwords do not match");
            valid = false;
        } else {
            setConfirmError("");
        }

        if (!valid) return;

        setLoading(true);
        setMessage("");

        try {
            const resp = await authService.resetPassword(tokenFromQuery, password, confirmPassword);
            setMessage(resp?.message || "Password has been reset successfully");
            setIsSuccess(true);
            setPassword("");
            setConfirmPassword("");
            setConfirmError("");
            setPasswordError("");
        } catch (err: any) {
            setPasswordError(err?.message || "Network error. Please try again.");
            setMessage("");
            setIsSuccess(false);
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
                        <span style={{ color: '#D951E6' }}>Driving Health Forward</span> <br />
                        One Smart Solution At a Time
                    </h2>
                    <p className="mt-1 font-[12px] text-white">
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
                        Reset Password
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Password Field */}
                        <div className="relative w-full my-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter new password"
                                    className={`peer w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${passwordError ? "border-red-500" : "border-gray-300"}`}
                                />
                                <label
                                    className={`absolute -top-3 left-2 bg-white px-1 text-sm font-medium tracking-wide transition-opacity
                                    ${passwordError ? "text-red-500 opacity-100" : "text-[#8b2a96] opacity-0 peer-focus:opacity-100"}`}
                                >
                                    New Password
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                                >
                                    <img
                                        src={showPassword ? EyeOpenIcon : EyeOffIcon}
                                        alt="toggle password visibility"
                                        className="w-5 h-5"
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password Field */}
                        <div className="relative w-full my-4">
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    className={`peer w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${confirmError ? "border-red-500" : "border-gray-300"}`}
                                />
                                <label
                                    className={`absolute -top-3 left-2 bg-white px-1 text-sm font-medium tracking-wide transition-opacity
                                    ${confirmError ? "text-red-500 opacity-100" : "text-[#8b2a96] opacity-0 peer-focus:opacity-100"}`}
                                >
                                    Confirm Password
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                                >
                                    <img
                                        src={showConfirmPassword ? EyeOpenIcon : EyeOffIcon}
                                        alt="toggle password visibility"
                                        className="w-5 h-5"
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 mb-1 bg-[#6b1176] text-white rounded-md font-medium hover:bg-[#8b2a96] transition disabled:opacity-50"
                        >
                            {loading ? "Resetting..." : "Reset Password"}
                        </button>
                        {passwordError && (
                            <p className="text-xs text-red-500 mt-1 mb-1">{passwordError}</p>
                        )}
                        {!passwordError && confirmError && (
                            <p className="text-xs text-red-500 mt-1 mb-1">{confirmError}</p>
                        )}
                    </form>
                    {/* Success Message with Countdown */}
                    {isSuccess && message && (
                        <div className="mt-3 flex flex-col items-center">
                            <p className="text-sm text-green-600 text-center">
                                {message}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                Redirecting to login page in 3 seconds...
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {!isSuccess && message && (
                        <div className="mt-3 flex justify-center">
                            <p className="text-sm text-red-500">{message}</p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-500 mt-3 space-y-2">
                        <p>
                            Need help?{" "}
                            <Link to="/forgot-password" className="text-[#8b2a96] font-semibold underline">
                                Forgot Password
                            </Link>
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ResetPassword;


