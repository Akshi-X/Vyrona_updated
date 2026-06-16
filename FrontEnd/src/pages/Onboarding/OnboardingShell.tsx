import React, { useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLayoutEffect } from "react";
import { Sidebar } from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { TourProvider, useTour } from "@reactour/tour";
import { OnboardingModeProvider } from "../../contexts/OnboardingModeContext";
import { disableOnboardingMocks, enableOnboardingMocks } from "../../onboarding/mockApi";
import OnboardingOverlay from "./OnboardingOverlay";
import { TourNavStoreProvider, useTourNavContext, type TourNavState } from "../../contexts/TourNavContext";
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

// ── Shared nav buttons used by both default and wide layouts ──────────────────
function TourNavButtons({ nav }: { nav: TourNavState }) {
    return (
        <div className="space-y-2 border-t border-slate-100 pt-3 mt-3">
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

// ── Custom tour content – title row with X dismiss + description ──────────────
function TourContent({ content }: { content: unknown }) {
    const ctx = useTourNavContext();
    const nav = ctx?.nav;
    const { setIsOpen } = useTour();

    const handleClose = () => { setIsOpen(false); ctx?.setIsTourActive(false); ctx?.openOverlay?.(); };

    if (nav?.is_wide) {
        const mediaSrc = nav.gif ?? nav.genieImage;
        return (
            <div className="flex items-stretch">
                {/* Left: gif/image panel — fixed width, stretches to content height */}
                <div className="w-52 shrink-0 bg-slate-100 rounded-l-2xl overflow-hidden flex items-center justify-center min-h-[180px]">
                    {mediaSrc && (
                        <img src={mediaSrc} alt="" className="w-full h-full object-cover" />
                    )}
                </div>
                {/* Right: content + nav */}
                <div className="flex flex-col flex-1 p-5 gap-2 min-w-0">
                    <TourStepHeading
                        title={nav.title}
                        icon={nav.icon}
                        onClose={handleClose}
                    />
                    <p className="text-sm leading-relaxed text-slate-700 flex-1">
                        {nav.content as React.ReactNode}
                    </p>
                    <TourNavButtons nav={nav} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <TourStepHeading
                title={nav?.title ?? ""}
                icon={nav?.icon}
                onClose={handleClose}
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
function TourNavigation() {
    const ctx = useTourNavContext();
    const nav = ctx?.nav;
    // Wide layout renders its own nav inline inside TourContent
    if (!nav || nav.is_wide) return null;

    return <TourNavButtons nav={nav} />;
}

// ── TourProvider with per-step dynamic popover width ──────────────────────────
function TourProviderWithDynamicStyles({ children }: { children: React.ReactNode }) {
    const ctx = useTourNavContext();
    const isWide = !!ctx?.nav?.is_wide;

    // Dispatch resize AFTER this component has committed the new maxWidth to DOM.
    // This is the only place where the timing is guaranteed correct — the effect fires
    // after React has painted the new popover width, so reactour measures accurately.
    const prevIsWideRef = useRef<boolean>(false);
    useEffect(() => {
        if (isWide === prevIsWideRef.current) return;
        prevIsWideRef.current = isWide;
        const raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
        return () => cancelAnimationFrame(raf);
    }, [isWide]);

    return (
        <TourProvider
            steps={[]}
            disableInteraction={false}
            disableDotsNavigation={true}
            disableKeyboardNavigation={true}
            onClickMask={() => { }}
            onClickClose={() => { }}
            components={{
                Content: TourContent,
                Navigation: TourNavigation,
                Close: () => null,
                Badge: () => null,
            }}
            styles={{
                popover: (base) => ({
                    ...base,
                    borderRadius: 16,
                    padding: isWide ? 0 : 20,
                    maxWidth: isWide ? 640 : 320,
                    maxHeight: "calc(100vh - 32px)",
                    overflow: "auto",
                }),
            }}
        >
            {children}
        </TourProvider>
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
                    <TourProviderWithDynamicStyles>
                        <GeniePreloaderGate>
                            {hideSidebar ? (
                                // Pages with their own full-width layout — no sidebar, no offset wrapper.
                                <Outlet />
                            ) : (
                                <div className="bg-surface flex w-full min-h-screen overflow-x-hidden">
                                    <Sidebar onLogout={handleLogout} />
                                    <div className="flex-1 ml-0 md:ml-60 min-w-0">
                                        <Outlet />
                                    </div>
                                </div>
                            )}
                            {/* Kept outside the hideSidebar conditional so React never remounts it on
                            layout changes — preserves isOpen state when navigating to no-sidebar routes. */}
                            <OnboardingOverlay />
                        </GeniePreloaderGate>
                    </TourProviderWithDynamicStyles>
                </TourNavStoreProvider>
            </GeniePreloaderProvider>
        </OnboardingModeProvider>
    );
}
