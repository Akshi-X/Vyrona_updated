import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface OnboardingGateProps {
    children: React.ReactNode;
}

export const OnboardingGate: React.FC<OnboardingGateProps> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();
    const [isTooSmall, setIsTooSmall] = useState(() => window.innerWidth < 900);

    useEffect(() => {
        const check = () => setIsTooSmall(window.innerWidth < 900);
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (isTooSmall) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#F6F0FF] via-[#FDF9F2] to-[#F2FBFF] flex flex-col items-center justify-center px-6 text-center">
                <div className="bg-white/80 border border-white/60 rounded-3xl px-8 py-10 max-w-sm w-full shadow-sm flex flex-col items-center gap-5">
                    <img
                        src="/genie/explaining_casual.webp"
                        alt="Genie"
                        className="w-28 h-28 object-contain"
                    />
                    <div className="space-y-2">
                        <h2 className="text-lg font-semibold text-slate-900">You need a bigger screen</h2>
                        <p className="text-sm text-slate-500 leading-relaxed">
                            The onboarding journey is built for desktop. Please switch to a laptop or desktop to continue.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                        </svg>
                        Minimum 900px width required
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
