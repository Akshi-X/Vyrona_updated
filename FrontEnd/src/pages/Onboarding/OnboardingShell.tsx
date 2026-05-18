import React from "react";
import { Lock } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLayoutEffect } from "react";
import { Sidebar } from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { TourProvider, useTour } from "@reactour/tour";
import { OnboardingModeProvider } from "../../contexts/OnboardingModeContext";
import { disableOnboardingMocks, enableOnboardingMocks } from "../../onboarding/mockApi";
import OnboardingOverlay from "./OnboardingOverlay";
import { TourNavStoreProvider, useTourNavContext } from "../../contexts/TourNavContext";
import TourStepHeading from "./TourStepHeading";
import {
    GeniePreloaderProvider,
    useGeniePreloader,
} from "../../contexts/GeniePreloaderContext";
import { GeniePreloaderCard } from "../../components/GeniePreloaderCard";

// Holds back the onboarding viewport until the genie image cache is fully
// populated — guarantees the tour never shows a broken or half-loaded image.
function GeniePreloaderGate({ children }: { children: React.ReactNode }) {
    const { state } = useGeniePreloader();
    if (state.status === "ready") return <>{children}</>;
    return <GeniePreloaderCard />;
}

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
                {(nav?.content ?? content) as React.ReactNode}
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

// Pages that have their own full-width layout — sidebar should be hidden for these.
const NO_SIDEBAR_PATHS = ["/onboarding/user-profile", "/onboarding/support", "/onboarding/success"];

export default function OnboardingShell() {
    const navigate = useNavigate();
    const location = useLocation();
    const hideSidebar = NO_SIDEBAR_PATHS.some(
        (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
    );
    const { logout } = useAuth();

    useLayoutEffect(() => {
        const previousDepartment = localStorage.getItem("department");
        const previousRole = localStorage.getItem("user_role");
        const previousCompany = localStorage.getItem("company_name");

        localStorage.setItem("user_role", "Admin");
        localStorage.setItem("company_name", "Iris Fertility");
        // Manually dispatch a storage event so AuthContext (which listens to the
        // "storage" event but only fires cross-tab by default) re-syncs userRole
        // to "Admin" immediately for the current window.
        window.dispatchEvent(
            new StorageEvent("storage", {
                key: "user_role",
                newValue: "Admin",
                oldValue: previousRole,
                storageArea: localStorage,
            }),
        );
        enableOnboardingMocks(previousDepartment ?? "IVF");

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
            window.dispatchEvent(
                new StorageEvent("storage", {
                    key: "user_role",
                    newValue: previousRole ?? null,
                    oldValue: "Admin",
                    storageArea: localStorage,
                }),
            );
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

    // Providers are always at the same tree position so React never remounts them
    // when navigating between sidebar and no-sidebar pages — tour state is preserved.
    return (
        <OnboardingModeProvider value={true}>
            <GeniePreloaderProvider>
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
                        <GeniePreloaderGate>
                            {hideSidebar ? (
                                // Pages with their own full-width layout — no sidebar, no offset wrapper.
                                <>
                                    <Outlet />
                                    <OnboardingOverlay />
                                </>
                            ) : (
                                <div className="bg-[#FDFAFF] flex w-full min-h-screen overflow-x-hidden">
                                    <Sidebar onLogout={handleLogout} />
                                    <div className="flex-1 ml-0 md:ml-60 min-w-0">
                                        <Outlet />
                                        <OnboardingOverlay />
                                    </div>
                                </div>
                            )}
                        </GeniePreloaderGate>
                    </TourProvider>
                </TourNavStoreProvider>
            </GeniePreloaderProvider>
        </OnboardingModeProvider>
    );
}
