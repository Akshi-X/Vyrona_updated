import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import EyeOffIcon from "../../assets/eye-off.svg";
import EyeOpenIcon from "../../assets/EyeOpen.svg";
import AuthBrandPanel from "../../components/AuthBrandPanel";
import { userService } from "../../services/userService";

const InviteSignup: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token") ?? "";

    const [inviteData, setInviteData] = useState<{
        email: string;
        role: string;
        hospital_name: string | null;
        expires_at: string;
        branch_name: string | null;
    } | null>(null);
    const [tokenError, setTokenError] = useState("");
    const [tokenLoading, setTokenLoading] = useState(true);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [firstNameError, setFirstNameError] = useState("");
    const [lastNameError, setLastNameError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [confirmPasswordError, setConfirmPasswordError] = useState("");

    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState("");
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setTokenError("Invalid or missing invite link.");
            setTokenLoading(false);
            return;
        }
        userService.getInviteToken(token)
            .then((data) => setInviteData(data))
            .catch((e) => setTokenError(e?.message || "This invite link is invalid or has expired."))
            .finally(() => setTokenLoading(false));
    }, [token]);

    const validate = () => {
        let valid = true;
        setFirstNameError("");
        setLastNameError("");
        setPasswordError("");
        setConfirmPasswordError("");

        if (!firstName.trim()) { setFirstNameError("First name is required."); valid = false; }
        if (!lastName.trim()) { setLastNameError("Last name is required."); valid = false; }
        if (password.length < 8) { setPasswordError("Password must be at least 8 characters."); valid = false; }
        if (password !== confirmPassword) { setConfirmPasswordError("Passwords do not match."); valid = false; }
        return valid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        setApiError("");
        try {
            await userService.registerFromInvite({
                token,
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                password,
                confirm_password: confirmPassword,
            });
            setSuccess(true);
        } catch (err: any) {
            setApiError(err?.message || "Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const expiresLabel = inviteData
        ? new Date(inviteData.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
        : "";

    return (
        <div className="min-h-screen flex">
            <AuthBrandPanel />

            <div className="flex-1 flex items-center justify-center bg-white px-6 py-10">
                <div className="w-full max-w-md">
                    {tokenLoading ? (
                        <p className="text-gray-500 text-sm">Validating invite link...</p>
                    ) : tokenError ? (
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-800 mb-3">Invalid Invite</h2>
                            <p className="text-red-600 text-sm mb-6">{tokenError}</p>
                            <button onClick={() => navigate("/login")} className="text-[#6b1176] text-sm font-medium underline">
                                Go to Login
                            </button>
                        </div>
                    ) : success ? (
                        <div className="text-center">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Account Created!</h2>
                            <p className="text-gray-500 text-sm mb-6">
                                Your account is pending admin approval. You'll receive an email once approved.
                            </p>
                            <button
                                onClick={() => navigate("/login")}
                                className="px-6 py-2 bg-[#6b1176] text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors"
                            >
                                Go to Login
                            </button>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-gray-800 mb-1">Accept Invite</h2>
                            <p className="text-gray-500 text-sm mb-1">
                                You've been invited to join <span className="font-medium text-gray-700">{inviteData?.hospital_name ?? "myGrape"}</span> as a <span className="font-medium text-gray-700">{inviteData?.role}</span>.
                            </p>
                            <p className="text-xs text-amber-600 mb-6">Invite expires on {expiresLabel}.</p>

                            {/* Fixed fields */}
                            <div className="mb-4 p-3 bg-[#F2E4FF] rounded-lg flex flex-col gap-2">
                                <div>
                                    <p className="text-xs text-gray-500">Email</p>
                                    <p className="text-sm font-medium text-gray-800">{inviteData?.email}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Role</p>
                                    <p className="text-sm font-medium text-gray-800">{inviteData?.role}</p>
                                </div>
                                {inviteData?.branch_name && (
                                    <div>
                                        <p className="text-xs text-gray-500">Branch</p>
                                        <p className="text-sm font-medium text-gray-800">{inviteData.branch_name}</p>
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="flex gap-3">
                                    <div className="flex-1 flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-gray-600">First Name</label>
                                        <input
                                            type="text"
                                            placeholder="John"
                                            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b1176]/30"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            disabled={loading}
                                        />
                                        {firstNameError && <p className="text-xs text-red-500">{firstNameError}</p>}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-gray-600">Last Name</label>
                                        <input
                                            type="text"
                                            placeholder="Doe"
                                            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b1176]/30"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            disabled={loading}
                                        />
                                        {lastNameError && <p className="text-xs text-red-500">{lastNameError}</p>}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-gray-600">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Min. 8 characters"
                                            className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b1176]/30"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            disabled={loading}
                                        />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((p) => !p)}>
                                            <img src={showPassword ? EyeOpenIcon : EyeOffIcon} alt="" className="w-4 h-4 opacity-60" />
                                        </button>
                                    </div>
                                    {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-gray-600">Confirm Password</label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Repeat password"
                                            className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#6b1176]/30"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            disabled={loading}
                                        />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowConfirmPassword((p) => !p)}>
                                            <img src={showConfirmPassword ? EyeOpenIcon : EyeOffIcon} alt="" className="w-4 h-4 opacity-60" />
                                        </button>
                                    </div>
                                    {confirmPasswordError && <p className="text-xs text-red-500">{confirmPasswordError}</p>}
                                </div>

                                {apiError && <p className="text-sm text-red-600">{apiError}</p>}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 bg-[#6b1176] text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors disabled:opacity-50"
                                >
                                    {loading ? "Creating Account..." : "Create Account"}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InviteSignup;
