import { Outlet, useNavigate } from "react-router-dom";
import { useLayoutEffect } from "react";
import { Sidebar } from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { TourProvider } from "@reactour/tour";
import { OnboardingModeProvider } from "../../contexts/OnboardingModeContext";
import { disableOnboardingMocks, enableOnboardingMocks } from "../../onboarding/mockApi";
import OnboardingOverlay from "./OnboardingOverlay";

export default function OnboardingShell() {
    const navigate = useNavigate();
    const { logout } = useAuth();

    useLayoutEffect(() => {
        const previousDepartment = localStorage.getItem("department");
        const previousRole = localStorage.getItem("user_role");
        const previousCompany = localStorage.getItem("company_name");

        localStorage.setItem("department", "IVF");
        localStorage.setItem("user_role", "User");
        localStorage.setItem("company_name", "Iris Fertility");
        enableOnboardingMocks();

        return () => {
            if (previousDepartment) {
                localStorage.setItem("department", previousDepartment);
            } else {
                localStorage.removeItem("department");
            }
            if (previousRole) {
                localStorage.setItem("user_role", previousRole);
            } else {
                localStorage.removeItem("user_role");
            }
            if (previousCompany) {
                localStorage.setItem("company_name", previousCompany);
            } else {
                localStorage.removeItem("company_name");
            }
            disableOnboardingMocks();
        };
    }, []);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="bg-[#FDFAFF] flex w-full min-h-screen overflow-x-hidden">
            <Sidebar onLogout={handleLogout} />
            <div className="flex-1 ml-0 md:ml-60 min-w-0">
                <OnboardingModeProvider value={true}>
                    <TourProvider
                        steps={[]}
                        disableInteraction={false}
                        styles={{
                            popover: (base) => ({
                                ...base,
                                borderRadius: 16,
                                padding: 16,
                                maxWidth: 360,
                            }),
                        }}
                    >
                        <Outlet />
                        <OnboardingOverlay />
                    </TourProvider>
                </OnboardingModeProvider>
            </div>
        </div>
    );
}
