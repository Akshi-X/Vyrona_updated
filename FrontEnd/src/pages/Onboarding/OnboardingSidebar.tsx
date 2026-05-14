import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronRight, Download } from "lucide-react";
import { useSidebar } from "../../contexts/SidebarContext";
import { useAuth } from "../../contexts/AuthContext";
import { userService } from "../../services/userService";
import { useEffect } from "react";

import MyGrapeLogo from "../../assets/mGScale.svg";
import IsolationModeBanner from "../../assets/Isolation_Mode.svg";
import DashboardIconWhite from "../../assets/DashBoardIcons/DashboardWhite.svg";
import ControlTowerIconWhite from "../../assets/DashBoardIcons/ControlTowerWhite.svg";
import ControlTowerIconDark from "../../assets/DashBoardIcons/ControlTowerDark.svg";
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";
import ContainersIcon from "../../assets/DashBoardIcons/Containers.svg";
import LogoutIcon from "../../assets/DashBoardIcons/Logout.svg";
import UserIcon from "../../assets/DashBoardIcons/User.svg";

// All paths are already prefixed with /onboarding — no context magic needed
const NAV_ITEMS = [
    {
        icon: DashboardIconWhite,
        label: "Dashboard",
        dropdown: true,
        children: [
            { label: "Overview",                  path: "/onboarding/dashboard"           },
            { label: "Cryocan Quality Tracking",  path: "/onboarding/ivf-track-shipment"  },
            { label: "Incubator Tracking",         path: "/onboarding/incubator-tracking"  },
            { label: "Embryo Grading",             path: "/onboarding/embryo-grading"      },
        ],
    },
    { icon: ControlTowerIconWhite, label: "Control Tower",      path: "/onboarding/control-tower"  },
    { icon: CriticalAlertsIcon,    label: "Alert Configuration", path: "/onboarding/alert-setting"  },
    { icon: "",  lucideIcon: Download, label: "Reports",         path: "/onboarding/reports"        },
    { icon: ContainersIcon,        label: "Refill log",          path: "/onboarding/refill-log"     },
] as const;

const DASHBOARD_CHILD_PATHS = [
    "/onboarding/dashboard",
    "/onboarding/ivf-track-shipment",
    "/onboarding/incubator-tracking",
    "/onboarding/embryo-grading",
];

interface OnboardingSidebarProps {
    onLogout: () => void;
}

export default function OnboardingSidebar({ onLogout }: OnboardingSidebarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isMobileOpen, closeMobile } = useSidebar();
    const { isAuthenticated } = useAuth();

    const isDashboardActive = DASHBOARD_CHILD_PATHS.some(
        (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
    );

    const [dashboardOpen, setDashboardOpen] = useState(() => isDashboardActive);
    const [profileName, setProfileName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");

    useEffect(() => {
        if (!isAuthenticated) return;
        userService.getProfile().then((profile) => {
            const first = profile.first_name?.trim() ?? "";
            const last  = profile.last_name?.trim()  ?? "";
            setProfileName([first, last].filter(Boolean).join(" ") || "User");
            setProfileEmail(profile.email?.trim() ?? "");
        }).catch(() => {});
    }, [isAuthenticated]);

    const go = (path: string) => { navigate(path); closeMobile(); };

    return (
        <>
            {/* Mobile backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
                    isMobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
                onClick={closeMobile}
            />

            <aside className={`fixed left-0 top-0 w-60 bg-gradient-to-b from-[#7b2f83] to-[#29053f] flex flex-col z-50 overflow-hidden transition-transform duration-300 ease-in-out h-screen ${
                isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            }`}>
                {/* Decorative background */}
                <div className="absolute left-0 w-full pointer-events-none bottom-[8%] h-[50%] overflow-hidden opacity-30">
                    <img src={IsolationModeBanner} alt="" className="w-full h-full object-cover object-bottom opacity-60 mix-blend-screen scale-[1.2] translate-y-[10%]" />
                </div>

                {/* Logo */}
                <header className="flex items-center gap-[7px] px-6 pt-0 pb-2 md:pb-6 flex-shrink-0 relative z-10">
                    <img src={MyGrapeLogo} alt="myGrape logo" className="w-[110px] h-[75px] md:w-[150px] md:h-[100px]" />
                </header>

                {/* Nav */}
                <nav className="flex flex-col gap-[18px] px-6 pb-2 flex-1 overflow-y-auto relative z-10 scrollbar-none">
                    {NAV_ITEMS.map((item, idx) => {
                        if ("dropdown" in item && item.dropdown) {
                            return (
                                <div key={idx} className="flex flex-col gap-0.5">
                                    <button
                                        onClick={() => setDashboardOpen((o) => !o)}
                                        className={`h-auto w-full justify-between gap-4 px-3 py-[7px] rounded-[10px] flex items-center transition-colors ${
                                            isDashboardActive ? "bg-white/20" : dashboardOpen ? "bg-white/10" : "bg-transparent hover:bg-white/10"
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <img className="w-5 h-5" src={DashboardIconWhite} alt="" />
                                            <span className="font-semibold text-xs md:text-sm text-white">{item.label}</span>
                                        </div>
                                        <svg className={`w-4 h-4 flex-shrink-0 transition-transform text-white/90 ${dashboardOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {dashboardOpen && (
                                        <div className="flex flex-col gap-[18px] border-l-2 border-white/20 ml-4 pl-3 my-1.5">
                                            {item.children.map((child, ci) => {
                                                const isActive = location.pathname === child.path || location.pathname.startsWith(child.path + "/");
                                                return (
                                                    <button
                                                        key={ci}
                                                        onClick={() => { setDashboardOpen(true); go(child.path); }}
                                                        className={`h-auto w-full justify-start pr-3 py-2 rounded-[10px] flex items-center text-left transition-colors pl-5 ${ci === 0 ? "mt-2" : ""} ${
                                                            isActive ? "bg-white text-[#6b1176]" : "text-white/85 hover:bg-white/10 hover:text-white"
                                                        }`}
                                                    >
                                                        <span className="font-medium text-xs md:text-sm">{child.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        const path = (item as { path: string }).path;
                        const isActive = location.pathname === path || location.pathname.startsWith(path + "/");
                        const iconSrc = item.label === "Control Tower"
                            ? (isActive ? ControlTowerIconDark : ControlTowerIconWhite)
                            : item.icon;
                        const needsInvert = ["Alert Configuration", "Refill log"].includes(item.label) && !isActive;

                        return (
                            <button
                                key={idx}
                                id={path === "/onboarding/alert-setting" ? "onboarding-sidebar-alert-setting" : undefined}
                                onClick={() => go(path)}
                                className={`h-auto w-full justify-start gap-4 px-3 py-[7px] rounded-[10px] flex items-center ${
                                    isActive ? "bg-white" : "bg-transparent hover:bg-white/10"
                                }`}
                            >
                                {"lucideIcon" in item && item.lucideIcon ? (
                                    <item.lucideIcon className="w-5 h-5" color={isActive ? "#6b1176" : "#ffffff"} />
                                ) : (
                                    <img className="w-5 h-5" src={iconSrc} alt="" style={needsInvert ? { filter: "brightness(0) saturate(100%) invert(100%)" } : undefined} />
                                )}
                                <span className={`font-semibold text-xs md:text-sm ${isActive ? "text-[#6b1176]" : "text-white"}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* Profile */}
                <button
                    type="button"
                    onClick={() => navigate("/onboarding/user-profile")}
                    className="group w-full flex items-center gap-3 px-6 py-2 md:gap-4 md:px-9 md:py-4 flex-shrink-0 relative z-10 text-white hover:bg-white/10 transition-colors text-left"
                >
                    <img src={UserIcon} alt="" className="w-5 h-5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 flex flex-col items-start">
                        <span className="font-semibold text-xs md:text-sm text-white truncate w-full">{profileName || "\u00A0"}</span>
                        <span className="text-[10px] md:text-xs text-white/80 truncate w-full">{profileEmail || "\u00A0"}</span>
                    </div>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100" strokeWidth={2} />
                </button>

                {/* Logout */}
                <button
                    onClick={onLogout}
                    className="h-auto flex items-center gap-3 px-6 py-2 md:gap-4 md:px-9 md:py-4 hover:bg-white/10 flex-shrink-0 relative z-10"
                >
                    <img src={LogoutIcon} alt="" className="w-5 h-5" />
                    <span className="font-bold text-white text-xs md:text-sm">Log Out</span>
                </button>
            </aside>
        </>
    );
}
