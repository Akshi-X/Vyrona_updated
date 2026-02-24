import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../../assets/mGScale.svg";
import EyeOffIcon from "../../assets/eye-off.svg";
import EyeOpenIcon from "../../assets/EyeOpen.svg";
import { authService } from "../../services/authService";

const Signup: React.FC = () => {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setrole] = useState("");
    const [organization, setOrganization] = useState("");
    const [department, setDepartment] = useState("");
    const [branch, setBranch] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [firstNameError, setFirstNameError] = useState("");
    const [lastNameError, setLastNameError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [roleError, setroleError] = useState("");
    const [organizationError, setOrganizationError] = useState("");
    const [departmentError, setDepartmentError] = useState("");
    const [branchError, setBranchError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [confirmPasswordError, setConfirmPasswordError] = useState("");

    const [apiError, setApiError] = useState("");
    const [apiSuccess, setApiSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [registrationSuccess, setRegistrationSuccess] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const branchDropdownRef = useRef<HTMLDivElement>(null);
    const [branchOptions, setBranchOptions] = useState<Array<{ branch_id: number; branch_name: string }>>([]);
    const [hospitalName, setHospitalName] = useState("");
    const [isHospitalEmail, setIsHospitalEmail] = useState(false);

    // navigate removed; success panel no longer shows login button

    // Handle clicks outside dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
                setIsBranchDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Fetch hospital info when email changes
    useEffect(() => {
        const fetchHospitalInfo = async () => {
            if (!email || !validateEmail(email)) {
                setIsHospitalEmail(false);
                setBranchOptions([]);
                setHospitalName("");
                setDepartment("");
                setBranch("");
                return;
            }

            try {
                const hospitalInfo = await authService.getHospitalInfoByEmail(email);
                setIsHospitalEmail(hospitalInfo.is_hospital_email);

                if (hospitalInfo.is_hospital_email) {
                    const hospitalNameValue = hospitalInfo.hospital_name || "";
                    setHospitalName(hospitalNameValue);
                    setBranchOptions(hospitalInfo.branches || []);

                    // Auto-fill organization field with hospital name
                    setOrganization(hospitalNameValue);

                    // Set department value from API response
                    const apiDepartments = hospitalInfo.departments || [];
                    const validDepartmentNames = ["IVF", "Oncology", "CGT"];

                    // Filter out invalid department names (like "public" which is hospital_type, not department)
                    const validApiDepartments = apiDepartments.filter(dept =>
                        validDepartmentNames.includes(dept)
                    );

                    // Set department value based on API response
                    if (validApiDepartments.length === 1) {
                        setDepartment(validApiDepartments[0]);
                    } else {
                        // If no valid departments from API, default to "IVF" (most common)
                        setDepartment("IVF");
                    }
                } else {
                    setBranchOptions([]);
                    setHospitalName("");
                    setDepartment("");
                    setBranch("");
                    // Clear organization field when switching to non-hospital email
                    setOrganization("");
                }
            } catch (error) {
                // Silently handle errors - user might be entering pharma email
                setIsHospitalEmail(false);
                setBranchOptions([]);
                setHospitalName("");
            }
        };

        // Debounce the API call
        const timeoutId = setTimeout(() => {
            fetchHospitalInfo();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [email]);

    const validateEmail = (value: string) =>
        /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value);

    const validatePassword = (value: string) =>
        /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(value);

    const validateName = (value: string) =>
        /^[A-Za-z .]+$/.test(value);

    const roleOptions = [
        { value: "Manager", label: "Manager" },
        { value: "User", label: "User" }
    ];

    const handleRoleSelect = (selectedRole: string) => {
        setrole(selectedRole);
        setIsDropdownOpen(false);
        if (roleError) setroleError("");
        // Manager has no branch; clear branch when switching to Manager
        if (selectedRole === "Manager") {
            setBranch("");
            if (branchError) setBranchError("");
        }
    };

    const handleBranchSelect = (selectedBranch: string) => {
        setBranch(selectedBranch);
        setIsBranchDropdownOpen(false);
        if (branchError) setBranchError("");
    };


    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setApiError("");
        setApiSuccess("");

        // Reset errors
        setFirstNameError("");
        setLastNameError("");
        setEmailError("");
        setroleError("");
        setOrganizationError("");
        setDepartmentError("");
        setBranchError("");
        setPasswordError("");
        setConfirmPasswordError("");

        let valid = true;

        // Validations
        if (!firstName) {
            setFirstNameError("First Name is required");
            valid = false;
        } else if (!validateName(firstName)) {
            setFirstNameError("Only letters, spaces, and . are allowed");
            valid = false;
        }
        if (!lastName) {
            setLastNameError("Last Name is required");
            valid = false;
        } else if (!validateName(lastName)) {
            setLastNameError("Only letters, spaces, and . are allowed");
            valid = false;
        }
        if (!email) {
            setEmailError("Email is required");
            valid = false;
        } else if (/[A-Z]/.test(email)) {
            setEmailError("Use lowercase letters only");
            valid = false;
        } else if (!validateEmail(email)) {
            setEmailError("Please enter a valid email address");
            valid = false;
        }
        if (!role) {
            setroleError("role is required");
            valid = false;
        }
        if (!organization && !isHospitalEmail) {
            setOrganizationError("Organization is required");
            valid = false;
        }
        if (isHospitalEmail) {
            if (!department) {
                setDepartmentError("Department is required");
                valid = false;
            }
            // Branch required only for User role; Manager can register without branch
            if (role !== "Manager" && !branch) {
                setBranchError("Branch is required");
                valid = false;
            }
        }
        if (!password) {
            setPasswordError("Password is required");
            valid = false;
        } else if (!validatePassword(password)) {
            setPasswordError("Weak password");
            valid = false;
        }
        if (!confirmPassword) {
            setConfirmPasswordError("Confirm Password is required");
            valid = false;
        } else if (password !== confirmPassword) {
            setConfirmPasswordError("Passwords do not match");
            valid = false;
        }

        if (!valid) return;

        // Prepare request payload
        const payload: any = {
            email,
            password,
            confirm_password: confirmPassword,
            first_name: firstName,
            last_name: lastName,
            role: role.toLowerCase(), // "manager" or "user" → match backend roles
        };

        if (isHospitalEmail) {
            payload.department = department;
            payload.hospital_name = hospitalName;
            // Manager is saved without branch; only User sends branch_name
            if (role === "User") payload.branch_name = branch;
            payload.company_name = ""; // Empty for hospital users
        } else {
            payload.company_name = organization;
        }

        try {
            setLoading(true);
            const response = await authService.register(payload);

            // Handle backend-declared failures
            const respStatus = (response.status || '').toString().toLowerCase();
            const respMessage = response.message;
            if (respStatus === 'failed' || respStatus === 'error') {
                if (respMessage === 'This email is already registered') {
                    setEmailError('This email is already registered');
                    setApiError("");
                    return; // stop further flow
                }
                setApiError(respMessage || 'Registration failed. Try again.');
                return;
            }

            setApiSuccess(respMessage || 'Registration successful');
            setRegistrationSuccess(true);
        } catch (err: any) {
            const message = err.message;
            if (message === 'This email is already registered') {
                setEmailError('This email is already registered');
                setApiError("");
            } else {
                setApiError(message || "Registration failed. Try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white w-full min-h-screen flex overflow-hidden font-['Work_Sans']">
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
                    <img src={MyGrapeLogo} alt="logo" className="w-[150px] h-[100px]" />
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
            <main className="flex-1 flex items-center justify-center overflow-auto">
                <div className="w-full max-w-[500px]">
                    {!registrationSuccess && (
                        <>
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
                                                const value = e.target.value;
                                                setFirstName(value);
                                                if (firstNameError) setFirstNameError("");
                                                if (value && !validateName(value)) {
                                                    setFirstNameError("Only letters, spaces, and . are allowed");
                                                }
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
                                                const value = e.target.value;
                                                setLastName(value);
                                                if (lastNameError) setLastNameError("");
                                                if (value && !validateName(value)) {
                                                    setLastNameError("Only letters, spaces, and . are allowed");
                                                }
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
                                            if (value && /[A-Z]/.test(value)) {
                                                setEmailError("Use lowercase letters only");
                                            } else if (value && !validateEmail(value)) {
                                                setEmailError("Invalid email format");
                                            }
                                        }}
                                        placeholder="Email"
                                        className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${emailError ? "border-red-500" : "border-gray-300"
                                            }`}
                                        aria-invalid={!!emailError}
                                    />
                                    {emailError && (
                                        <p className="text-xs text-red-500 mt-1">{emailError}</p>
                                    )}
                                </div>

                                {/* Role, Organization, Department, Branch - 2x2 Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Role Dropdown */}
                                    <div className="relative w-full" ref={dropdownRef}>
                                        <div
                                            className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${roleError ? "border-red-500" : "border-gray-300"
                                                } ${!role ? "text-gray-400" : "text-black"}`}
                                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span>{role || "Role"}</span>
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>

                                        {isDropdownOpen && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg">
                                                {roleOptions.map((option) => (
                                                    <div
                                                        key={option.value}
                                                        className={`px-3 py-2 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${role === option.value ? "bg-[#8b2a96] text-white" : "text-black"
                                                            }`}
                                                        onClick={() => handleRoleSelect(option.value)}
                                                    >
                                                        {option.label}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {roleError && (
                                            <p className="text-xs text-red-500 mt-1">{roleError}</p>
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
                                            disabled={isHospitalEmail}
                                            className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${organizationError ? "border-red-500" : "border-gray-300"
                                                } ${isHospitalEmail ? "bg-gray-100 cursor-not-allowed" : ""}`}
                                        />
                                        {organizationError && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {organizationError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Department - Non-editable text field */}
                                    <div className="relative w-full">
                                        <input
                                            type="text"
                                            value={department}
                                            placeholder="Department"
                                            disabled={true}
                                            className={`peer w-full border rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${departmentError ? "border-red-500" : "border-gray-300"
                                                } bg-gray-100 cursor-not-allowed text-gray-600`}
                                        />
                                        {departmentError && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {departmentError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Branch Dropdown - disabled for Manager (can view all branches) */}
                                    <div className="relative w-full" ref={branchDropdownRef}>
                                        <div
                                            className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${branchError ? "border-red-500" : "border-gray-300"
                                                } ${!branch ? "text-gray-400" : "text-black"} ${!isHospitalEmail || role === "Manager" ? "bg-gray-100 cursor-not-allowed" : "cursor-pointer"}`}
                                            onClick={() => isHospitalEmail && role === "User" && setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span>{ (branch || "Branch")}</span>
                                                {isHospitalEmail && role === "User" && (
                                                    <svg
                                                        className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>

                                        {isBranchDropdownOpen && role === "User" && branchOptions.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-60 overflow-y-auto">
                                                {branchOptions.map((option) => (
                                                    <div
                                                        key={option.branch_id}
                                                        className={`px-3 py-2 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${branch === option.branch_name ? "bg-[#8b2a96] text-white" : "text-black"
                                                            }`}
                                                        onClick={() => handleBranchSelect(option.branch_name)}
                                                    >
                                                        {option.branch_name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {branchError && (
                                            <p className="text-xs text-red-500 mt-1">{branchError}</p>
                                        )}
                                    </div>
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
                                            <img src={showPassword ? EyeOpenIcon : EyeOffIcon} className="w-5 h-5 my-2.5" />
                                        </button>
                                        {passwordError && (
                                            <p className="text-xs text-red-500 mt-1">{passwordError}</p>
                                        )}
                                        <p
                                            className={`text-[10px] mt-1 ${password && !validatePassword(password) ? "text-red-500" : "text-[#9a9a9a]"
                                                }`}
                                        >
                                            Use at least 8 characters, including uppercase
                                            <br />and lowercase letters, a number, and a special character.
                                        </p>
                                    </div>

                                    <div className="relative w-full">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            value={confirmPassword}
                                            onChange={(e) => {
                                                setConfirmPassword(e.target.value);
                                                if (confirmPasswordError) setConfirmPasswordError("");
                                            }}
                                            placeholder="Confirm Password"
                                            className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${confirmPasswordError || (passwordError && password === confirmPassword) || (confirmPassword && !validatePassword(confirmPassword)) ? "border-red-500" : "border-gray-300"
                                                }`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 "
                                        >
                                            <img src={showConfirmPassword ? EyeOpenIcon : EyeOffIcon} className="w-5 h-5 my-2.5" />
                                        </button>
                                        {confirmPasswordError && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {confirmPasswordError}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`h-[40px] w-full px-2 rounded-lg font-semibold text-white text-base ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-[#6b1176] hover:bg-[#5a0e62] cursor-pointer"
                                        }`}
                                >
                                    {loading ? "Submitting..." : "Sign up"}
                                </button>
                                {apiError && (
                                    <p className="text-sm text-red-500">{apiError}</p>
                                )}
                                {apiSuccess && (
                                    <p className="text-sm text-green-600">{apiSuccess}</p>
                                )}
                            </form>

                            <p className="mt-2 text-center font-normal text-base">
                                <span className="text-[#6c6c6c]">Already have an account? </span>
                                <Link to="/login" className="font-semibold text-[#6b1176] underline">
                                    Sign in
                                </Link>
                            </p>

                            <p className="mt-2 text-center text-[#9a9a9a] text-sm whitespace-nowrap">
                                Having trouble Signing up? Contact <a href="#" className="text-[#6b1176] inline">
                                    admin@mygrape.org
                                </a>{" "} for help.
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
                        </>
                    )}

                    {registrationSuccess && (
                        <div className="border border-[white] rounded-lg p-6 bg-[#F2E4FF]">
                            <h2 className="text-xl font-bold text-[#6b1176] mb-2">
                                Registration successful
                            </h2>
                            <p className="text-[#6b1176] mb-3">
                                Your request is pending. Once approved, you can log in.
                            </p>
                            <div>
                                <Link
                                    to="/login"
                                    className="inline-block h-[40px] px-4 bg-[#6b1176] hover:bg-[#5a0e62] rounded-lg font-semibold text-white text-base leading-[40px]"
                                >
                                    Go to Login
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default Signup;


