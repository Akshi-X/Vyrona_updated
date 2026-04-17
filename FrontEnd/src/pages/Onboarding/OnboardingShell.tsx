import { Lock } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";
import { useLayoutEffect } from "react";
import { Sidebar } from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { TourProvider, useTour } from "@reactour/tour";
import { OnboardingModeProvider } from "../../contexts/OnboardingModeContext";
import { disableOnboardingMocks, enableOnboardingMocks } from "../../onboarding/mockApi";
import OnboardingOverlay from "./OnboardingOverlay";
import { TourNavStoreProvider, useTourNavContext } from "../../contexts/TourNavContext";
import TourStepHeading from "./TourStepHeading";

// ── Custom tour content – title row with X dismiss + description ──────────────
function TourContent({ content }: { content: unknown }) {
    const ctx = useTourNavContext();
    const nav = ctx?.nav;
    const { setIsOpen } = useTour();

    return (
        <div className="space-y-2">
            <TourStepHeading
                title={nav?.title ?? ""}
                icon={nav?.icon}
                onClose={() => { setIsOpen(false); ctx?.setIsTourActive(false); ctx?.openOverlay?.(); }}
            />
            {nav?.genieImage && (
                <img
                    src={nav.genieImage}
                    alt=""
                    className="w-full h-72 object-contain object-center"
                />
            )}
            <p className="text-sm leading-relaxed text-slate-700">
                {nav?.content ?? content}
            </p>
        </div>
    );
}

// ── Custom tour navigation – prev/next with proper disabled states ─────────────
function TourNavigation(_props: Record<string, unknown>) {
    const ctx = useTourNavContext();
    const nav = ctx?.nav;
    if (!nav) return null;

    return (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {nav.requiresClick && (
                <p className="text-[11px] font-medium text-amber-600">
                    Click the highlighted area to continue
                </p>
            )}
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                    {nav.stepIndex + 1} / {nav.totalSteps}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={nav.goPrev}
                        disabled={!nav.canPrev}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-300 disabled:pointer-events-none disabled:opacity-30 flex items-center gap-1"
                    >
                        {nav.prevLocked
                            ? <><Lock size={10} strokeWidth={2.5} /> Prev</>
                            : <>← Prev</>
                        }
                    </button>
                    <button
                        type="button"
                        onClick={nav.goNext}
                        disabled={!nav.canNext}
                        className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-slate-700 disabled:pointer-events-none disabled:opacity-40"
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>
    );
}

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
            <OnboardingModeProvider value={true}>
            <Sidebar onLogout={handleLogout} />
            <div className="flex-1 ml-0 md:ml-60 min-w-0">
                    <TourNavStoreProvider>
                        <TourProvider
                            steps={[]}
                            disableInteraction={false}
                            disableDotsNavigation={true}
                            disableKeyboardNavigation={true}
                            onClickMask={() => {}}
                            onClickClose={() => {}}
                            components={{
                                Content: TourContent,
                                Navigation: TourNavigation,
                                Close: () => null,
                            }}
                            styles={{
                                popover: (base) => ({
                                    ...base,
                                    borderRadius: 16,
                                    padding: 20,
                                    maxWidth: 360,
                                }),
                            }}
                        >
                            <Outlet />
                            <OnboardingOverlay />
                        </TourProvider>
                    </TourNavStoreProvider>
            </div>
            </OnboardingModeProvider>
        </div>
    );
}
