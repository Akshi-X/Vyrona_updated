import React, { useState } from "react";
import { Link } from "react-router-dom";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../../assets/logo.svg";
import EyeOffIcon from "../../assets/eye-off.svg";

const Signup: React.FC = () => {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [designation, setDesignation] = useState("");
    const [organization, setOrganization] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [firstNameError, setFirstNameError] = useState("");
    const [lastNameError, setLastNameError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [designationError, setDesignationError] = useState("");
    const [organizationError, setOrganizationError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [confirmPasswordError, setConfirmPasswordError] = useState("");

    const [showPassword, setShowPassword] = useState(false);

    const validateEmail = (value: string) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const validatePassword = (value: string) =>
        /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(value);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        setFirstNameError("");
        setLastNameError("");
        setEmailError("");
        setDesignationError("");
        setOrganizationError("");
        setPasswordError("");
        setConfirmPasswordError("");

        let valid = true;

        if (!firstName) {
            setFirstNameError("First Name is required");
            valid = false;
        }
        if (!lastName) {
            setLastNameError("Last Name is required");
            valid = false;
        }
        if (!email) {
            setEmailError("Email is required");
            valid = false;
        } else if (!validateEmail(email)) {
            setEmailError("Please enter a valid email address");
            valid = false;
        }
        if (!designation) {
            setDesignationError("Designation is required");
            valid = false;
        }
        if (!organization) {
            setOrganizationError("Organization is required");
            valid = false;
        }
        if (!password) {
            setPasswordError("Password is required");
            valid = false;
        } else if (!validatePassword(password)) {
            setPasswordError(
                "Password must be ≥8 characters, include 1 uppercase, 1 number, and 1 special character"
            );
            valid = false;
        }
        if (!confirmPassword) {
            setConfirmPasswordError("Confirm Password is required");
            valid = false;
        } else if (password !== confirmPassword) {
            setConfirmPasswordError("Passwords do not match");
            valid = false;
        }

        if (valid) alert("Form submitted successfully!");
    };

    return (
        <div className="bg-white w-full min-h-screen flex overflow-hidden font-['Work_Sans']">
            {/* Left Section */}
            <aside
                className="w-[35%] h-screen flex flex-col justify-between text-white relative overflow-hidden 
             bg-gradient-to-b from-[#9C3AA6] to-[#30024D] 
             rounded-tr-[40px] rounded-br-[40px]"
            >
                <div className="flex h-[15%] items-center space-x-2 p-12 pb-0">
                    <img src={MyGrapeLogo} alt="logo" className="w-[41.87px] h-[55px]" />
                    <h1 className="font-semibold text-[30px]">myGrape</h1>
                </div>

                <div className="flex-1 flex items-center justify-center overflow-hidden">
                    <img
                        src={MyGrapeBanner}
                        className="w-full h-full object-cover"
                        alt="banner"
                    />
                </div>

                <div className="flex flex-col h-[20%] justify-end pt-0 p-12">
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
            <main className="flex-1 flex items-center justify-center overflow-auto">
                <div className="w-full max-w-[500px]">
                    <div className="flex flex-col items-start gap-2 mb-4">
                        <h1 className="font-bold text-[#232323] text-[28px] tracking-tighter">
                            Sign up
                        </h1>
                        <p className="font-normal text-[#6c6c6c] text-base">
                            Create an account to access myGrape
                        </p>
                    </div>

                    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
                        {/* First & Last Name */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => {
                                        setFirstName(e.target.value);
                                        if (firstNameError) setFirstNameError("");
                                    }}
                                    placeholder="First Name"
                                    className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${firstNameError ? "border-red-500" : "border-gray-300"
                                        }`}
                                />
                                {firstNameError && (
                                    <p className="text-xs text-red-500 mt-1">{firstNameError}</p>
                                )}
                            </div>

                            <div className="relative w-full">
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => {
                                        setLastName(e.target.value);
                                        if (lastNameError) setLastNameError("");
                                    }}
                                    placeholder="Last Name"
                                    className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${lastNameError ? "border-red-500" : "border-gray-300"
                                        }`}
                                />
                                {lastNameError && (
                                    <p className="text-xs text-red-500 mt-1">{lastNameError}</p>
                                )}
                            </div>
                        </div>

                        {/* Email */}
                        <div className="relative w-full">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setEmail(value);
                                    if (emailError) setEmailError("");
                                    if (value && !validateEmail(value)) {
                                        setEmailError("Invalid email format");
                                    }
                                }}
                                placeholder="Email"
                                className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${emailError ? "border-red-500" : "border-gray-300"
                                    }`}
                            />
                            {emailError && (
                                <p className="text-xs text-red-500 mt-1">{emailError}</p>
                            )}
                        </div>

                        {/* Designation */}
                        <div className="relative w-full">
                            <select
                                value={designation}
                                onChange={(e) => {
                                    setDesignation(e.target.value);
                                    if (designationError) setDesignationError("");
                                }}
                                className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 appearance-none focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${designationError ? "border-red-500" : "border-gray-300"
                                    } ${!designation ? "text-gray-400" : "text-black"}`}
                            >
                                <option value="" disabled>
                                    Designation
                                </option>
                                <option value="Manager">Manager</option>
                                <option value="User">User</option>
                            </select>
                            {designationError && (
                                <p className="text-xs text-red-500 mt-1">{designationError}</p>
                            )}
                        </div>

                        {/* Organization */}
                        <div className="relative w-full">
                            <input
                                type="text"
                                value={organization}
                                onChange={(e) => {
                                    setOrganization(e.target.value);
                                    if (organizationError) setOrganizationError("");
                                }}
                                placeholder="Organization"
                                className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${organizationError ? "border-red-500" : "border-gray-300"
                                    }`}
                            />
                            {organizationError && (
                                <p className="text-xs text-red-500 mt-1">
                                    {organizationError}
                                </p>
                            )}
                        </div>

                        {/* Passwords */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative w-full">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setPassword(value);
                                        if (passwordError) setPasswordError("");
                                        if (value && !validatePassword(value)) {
                                            setPasswordError("Weak password");
                                        }
                                    }}
                                    placeholder="Password"
                                    className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${passwordError ? "border-red-500" : "border-gray-300"
                                        }`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 "
                                >
                                    <img src={EyeOffIcon} className="w-5 h-5 my-2.5" />
                                </button>
                                {passwordError && (
                                    <p className="text-xs text-red-500 mt-1">{passwordError}</p>
                                )}
                                <p
                                    className={`text-[10px] mt-1 ${passwordError ? "text-red-500" : "text-[#9a9a9a]"
                                        }`}
                                >
                                    Use at least 8 characters, including a number, an
                                    <br /> uppercase letter, and a special symbol
                                </p>
                            </div>

                            <div className="relative w-full">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value);
                                        if (confirmPasswordError) setConfirmPasswordError("");
                                    }}
                                    placeholder="Confirm Password"
                                    className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${confirmPasswordError ? "border-red-500" : "border-gray-300"
                                        }`}
                                />
                                {confirmPasswordError && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {confirmPasswordError}
                                    </p>
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="h-[40px] w-full px-2 bg-[#6b1176] hover:bg-[#5a0e62] rounded-lg font-semibold text-white text-base"
                        >
                            Sign up
                        </button>
                    </form>

                    <p className="mt-2 text-center font-normal text-base">
                        <span className="text-[#6c6c6c]">Already have an account? </span>
                        <Link to="/login" className="font-semibold text-[#6b1176] underline">
                            Sign in
                        </Link>
                    </p>

                    <p className="mt-2 text-center text-[#9a9a9a] text-sm whitespace-nowrap">
                        By signing up, you agree to myGrape's{" "}
                        <a href="#" className="text-[#6b1176] inline">
                            Terms of Service
                        </a>{" "}
                        and{" "}
                        <a href="#" className="text-[#6b1176] inline">
                            Privacy Policy
                        </a>
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Signup;


