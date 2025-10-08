import React, { useState } from "react";
import MyGrapeBanner from "../assets/Isolation_Mode.svg";
import Banner from "../assets/banner.svg";
import MyGrapeLogo from "../assets/logo.svg";
// import EyeIcon from "../assets/eye.svg";
import EyeOffIcon from "../assets/eye-off.svg";


const Login: React.FC = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");

    const validateEmail = (email: string) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateEmail(email)) {
            setError("Invalid Email ID");
            return;
        }
        setError("");
        console.log("Login with:", { email, password });
    };

    return (
        <div className="w-full h-screen flex overflow-hidden bg-white">
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
            {/* <div className="flex items-center overflow-hidden">
                <img
                    src={Banner}
                    style={{ width: "100%", height: "100%", objectFit: "fill", zIndex: 1000 }}
                    alt="banner"
                />
            </div> */}
            {/* Right Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-16 overflow-hidden">
                <div className="w-full max-w-md">
                    <h2
                        className="text-3xl font-bold text-gray-900 mb-2 tracking-tighter"
                        style={{ fontFamily: "'Work Sans', sans-serif" }}
                    >
                        Welcome Back!
                    </h2>
                    <p className="text-gray-500 mb-8">
                        Please sign in to continue to your account
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Email Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${error ? "border-red-500" : "border-gray-300"
                                    }`}
                                placeholder="Enter your email"
                            />
                            {error && (
                                <p className="text-xs text-red-500 mt-1">{error}</p>
                            )}
                        </div>

                        {/* Password Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96]"
                                    placeholder="Password"
                                />
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
                        </div>

                        {/* Remember Me + Forgot */}
                        <div className="flex justify-between items-center text-sm">
                            <label className="flex items-center space-x-2">
                                <input type="checkbox" className="w-4 h-4 border-gray-300" />
                                <span className="text-gray-700">Remember me</span>
                            </label>
                            <a href="#" className="text-[#8b2a96] hover:underline">
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
                        <a href="#" className="text-[#8b2a96] font-medium hover:underline">
                            Create an account
                        </a>
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Login;
