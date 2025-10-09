import React, { useState } from "react";
import MyGrapeBanner from "../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../assets/logo.svg";
import EyeOffIcon from "../assets/eye-off.svg";

const Login: React.FC = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");

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

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        if (!e.target.value) {
            setPasswordError("Password is required");
        } else {
            setPasswordError("");
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        let valid = true;

        if (!email) {
            setEmailError("Email is required");
            valid = false;
        } else if (!validateEmail(email)) {
            setEmailError("Invalid Email ID");
            valid = false;
        }

        if (!password) {
            setPasswordError("Password is required");
            valid = false;
        }

        if (!valid) return;

        setEmailError("");
        setPasswordError("");
    };

    return (
        <div className="w-full h-screen flex overflow-hidden bg-white" style={{ fontFamily: "'Work Sans', sans-serif" }}>
            {/* Left Section */}
            <aside
                className="w-[36%] flex flex-col justify-between text-white relative overflow-hidden"
                style={{
                    background: "linear-gradient(180deg, #9C3AA6 0%, #30024D 100%)",
                    borderTopRightRadius: "40px",
                    borderBottomRightRadius: "40px",
                }}
            >
                <div className="flex h-[15%] items-center space-x-2  p-12 pb-0 ">
                    <img src={MyGrapeLogo} style={{ width: "41.87px", height: "55px" }} alt="logo" />
                    <h1 className="font-semibold text-[30px]">myGrape</h1>
                </div>
                <div className="flex items-center overflow-hidden">
                    <img
                        src={MyGrapeBanner}
                        style={{ width: "100%", height: "125%", objectFit: "fill" }}
                        alt="banner"
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
                    <h2
                        className="text-3xl font-black text-gray-700 mb-2 tracking-tighter"
                        style={{ fontFamily: "'Work Sans', sans-serif", fontSize: "32px" }}
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
                                        src={EyeOffIcon}
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
                                    className="w-4 h-4 border-gray-300 accent-[#8b2a96]"
                                />
                                <span className="text-gray-700 font-medium">Remember me</span>
                            </label>
                            <a href="#" className="text-[#8b2a96] font-medium underline">
                                Forgot password ?
                            </a>
                        </div>

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            className="w-full py-3 bg-[#6b1176] text-white rounded-md font-medium hover:bg-[#8b2a96] transition"
                        >
                            Sign in
                        </button>
                    </form>

                    {/* Footer */}
                    <p className="text-center text-sm text-gray-500 mt-8">
                        New to myGrape?{" "}
                        <a href="#" className="text-[#8b2a96] font-medium underline">
                            Create an account
                        </a>
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Login;
