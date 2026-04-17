import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import EyeOffIcon from "../../assets/eye-off.svg";
import EyeOpenIcon from "../../assets/EyeOpen.svg";
import { authService } from "../../services/authService";
import { useAuth } from "../../contexts/AuthContext";
import AuthBrandPanel from "../../components/AuthBrandPanel";

const Login: React.FC = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [apiError, setApiError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, isLoading, userRole } = useAuth();

    // Removed API_BASE_URL - now using authService
    const validateEmail = (email: string) => {
        const regex = /^[^\s@#]+@[^\s@#]+\.[^\s@#]+$/;
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

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        if (!e.target.value) {
            setPasswordError("Password is required");
        } else {
            setPasswordError("");
        }
    };

    // Redirect if already authenticated
    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            // Check if user came from a specific page (e.g., approval screen)
            const from = (location.state as any)?.from;
            if (from) {
                const fromPath = `${from.pathname ?? ""}${from.search ?? ""}${from.hash ?? ""}`;
                navigate(fromPath, { replace: true });
                return;
            }

            // If user is Mygrape_admin, redirect to user-profile
            if (userRole?.toLowerCase() === 'mygrape_admin') {
                navigate('/user-profile', { replace: true });
            } else {
                // For other roles, redirect to dashboard
                navigate('/dashboard', { replace: true });
            }
        }
    }, [isAuthenticated, isLoading, userRole, navigate, location.state]);

    // Show loading spinner while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6b1176]"></div>
            </div>
        );
    }

    // Redirect if authenticated (this handles the case where useEffect hasn't run yet)
    if (isAuthenticated) {
        // Check if user came from a specific page (e.g., approval screen)
        const from = (location.state as any)?.from;
        if (from) {
            const fromPath = `${from.pathname ?? ""}${from.search ?? ""}${from.hash ?? ""}`;
            return <Navigate to={fromPath} replace />;
        }

        if (userRole?.toLowerCase() === 'mygrape_admin') {
            return <Navigate to="/user-profile" replace />;
        }
        return <Navigate to="/dashboard" replace />;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setApiError("");
        let valid = true;

        if (!email) {
            setEmailError("Email is required");
            valid = false;
        } else if (!validateEmail(email)) {
            setEmailError("Invalid Email ID");
            valid = false;
        } else {
            setEmailError("");
        }

        if (!password) {
            setPasswordError("Password is required");
            valid = false;
        } else {
            setPasswordError("");
        }

        if (!valid) return;

        try {
            setLoading(true);
            const response = await authService.login({
                email,
                password,
                remember_me: rememberMe,
            });

            if (response.status === "OTP Sent") {
                // Preserve original destination (if any) to return after OTP login
                // Check multiple sources: state.fromPath, state.from object, and sessionStorage
                const state = location.state as any;

                let fromPath: string | undefined = state?.fromPath;

                if (!fromPath) {
                    // Fallback 1: construct from 'from' object
                    const from = state?.from;
                    if (from) {
                        const pathname = from.pathname || "";
                        const search = from.search || "";
                        const hash = from.hash || "";
                        if (pathname) {
                            fromPath = `${pathname}${search}${hash}`;
                        } else if (search) {
                            fromPath = `/approval${search}${hash}`;
                        }
                    }
                }

                // Fallback 2: check sessionStorage
                if (!fromPath) {
                    try {
                        const storedPath = sessionStorage.getItem('approval_redirect_path');
                        if (storedPath) {
                            fromPath = storedPath;
                            // Clear it after use
                            sessionStorage.removeItem('approval_redirect_path');
                        }
                    } catch (e) {
                        // Silently handle sessionStorage errors
                    }
                }

                // Navigate to OTP page with preserved redirect path
                navigate("/verify-otp", {
                    state: {
                        userId: response.user_id,
                        email: response.email,
                        otpExpiry: response.otp_expiry,
                        fromPath,
                        rememberMe,
                    },
                });
            } else {
                setApiError(response.message || "Unexpected response");
            }
        } catch (err: any) {
            setApiError(err.message || "Login failed");
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
                        Welcome Back!
                    </h2>
                    <p className="text-gray-500 mb-8">
                        Please sign in to continue to your account
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

                        {/* Password Field */}
                        <div className="relative w-full my-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={handlePasswordChange}
                                    placeholder="Password"
                                    className={`peer w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${passwordError ? "border-red-500" : "border-gray-300"
                                        }`}
                                />
                                <label
                                    className={`absolute -top-3 left-2 bg-white px-1 text-sm font-medium tracking-wide transition-opacity
                                ${passwordError ? "text-red-500 opacity-100" : "text-[#8b2a96] opacity-0 peer-focus:opacity-100"}`}
                                >
                                    Password
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
                            {passwordError && (
                                <p className="text-xs text-red-500 mt-1">{passwordError}</p>
                            )}
                        </div>

                        {/* Remember Me + Forgot */}
                        <div className="flex justify-between items-center text-sm">
                            <label className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="w-4 h-4 border-gray-300 accent-[#8b2a96]"
                                />
                                <span className="text-gray-700 font-medium">Remember me</span>
                            </label>
                            <Link to="/forgot-password" className="text-[#8b2a96] font-semibold underline">
                                Forgot Password?
                            </Link>
                        </div>

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3 mb-1 text-white rounded-md font-medium transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-[#6b1176] hover:bg-[#8b2a96] cursor-pointer"
                                }`}
                        >
                            {loading ? "Signing in..." : "Sign in"}
                        </button>
                        {apiError && (
                            <p className="text-sm text-red-500 flex justify-center">{apiError}</p>
                        )}
                    </form>

                    {/* Footer */}
                    <p className="text-center text-sm text-gray-500 mt-2">
                        New to myGrape?{" "}
                        <Link to="/signup" className="text-[#8b2a96] font-semibold underline">
                            Create an account
                        </Link>
                    </p>

                </div>
                <p className="mt-2 text-center text-[#9a9a9a] text-sm">
                    Having trouble signing in?<br className="md:hidden" /> Contact <a href="#" className="text-[#6b1176] inline">
                        support@mygrape.org
                    </a>{" "} for help.
                </p>
            </main>
        </div>
    );
};

export default Login;

