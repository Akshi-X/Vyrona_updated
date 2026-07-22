import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronRight, Download, Users } from "lucide-react";

import { useSidebar } from "../contexts/SidebarContext";
import { useOnboardingMode } from "../contexts/OnboardingModeContext";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/userService";

import MyGrapeLogo from "../assets/mGScale.svg";
import IsolationModeBanner from "../assets/Isolation_Mode.svg";
import DashboardIconWhite from "../assets/DashBoardIcons/DashboardWhite.svg";
import DatabaseIconWhite from "../assets/DashBoardIcons/DataBaseWhite.svg";
import DatabaseIconDark from "../assets/DashBoardIcons/DatabaseDark.svg";
import ControlTowerIconWhite from "../assets/DashBoardIcons/ControlTowerWhite.svg";
import ControlTowerIconDark from "../assets/DashBoardIcons/ControlTowerDark.svg";
import CriticalAlertsIcon from "../assets/DashBoardIcons/Critical_Alerts.svg";
import ContainersIcon from "../assets/DashBoardIcons/Containers.svg";
import LogoutIcon from "../assets/DashBoardIcons/Logout.svg";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
    onLogout: () => void;
}

type NavChild = { label: string; path: string };

type NavLeaf = {
    icon: string;
    lucideIcon?: React.ElementType;
    label: string;
    path: string;
};

type NavGroup = {
    icon: string;
    label: string;
    dropdown: true;
    children: NavChild[];
};

type NavItem = NavLeaf | NavGroup;

const isDropdown = (item: NavItem): item is NavGroup =>
    "dropdown" in item && item.dropdown === true;

// ── Dashboard active-route detection ──────────────────────────────────────────

const DASHBOARD_CHILD_PATHS = [
    "/dashboard",
    "/ivf-track-shipment",
    "/incubator-tracking",
    "/refrigerator-tracking",
    // "/embryo-console",
];

const isDashboardRoute = (pathname: string) =>
    DASHBOARD_CHILD_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
    );

const isAlertConfigRoute = (pathname: string) =>
    pathname === "/alert-setting" || pathname.startsWith("/alert-setting/");

// ── Nav item definitions ───────────────────────────────────────────────────────

const ALL_NAV_ITEMS: NavItem[] = [
    {
        icon: DashboardIconWhite,
        label: "Dashboard",
        dropdown: true,
        children: [
            { label: "Overview",                  path: "/dashboard"          },
            { label: "Cryocan Quality Tracking",  path: "/ivf-track-shipment" },
            { label: "Incubator Tracking",      path: "/incubator-tracking"    },
            { label: "Refrigerator Tracking",     path: "/refrigerator-tracking" },
            // { label: "Embryo Console",          path: "/embryo-console"        },
        ],
    },
    { icon: DatabaseIconWhite,    label: "Database",            path: "/database"      },
    { icon: ControlTowerIconWhite, label: "Control Tower",      path: "/control-tower" },
    { icon: "", lucideIcon: Users,    label: "Users",            path: "/users"         },
    {
        icon: CriticalAlertsIcon,
        label: "Alert Config",
        dropdown: true,
        children: [
            { label: "Cryotanks",  path: "/alert-setting" },
            { label: "Incubators",    path: "/alert-setting?direction=incubators"    },
            { label: "Refrigerators", path: "/alert-setting?direction=refrigerators" },
        ],
    },
    { icon: "", lucideIcon: Download, label: "Reports",         path: "/reports"       },
    { icon: ContainersIcon,       label: "Refill log",          path: "/refill-log"    },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const Sidebar = ({ onLogout }: SidebarProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, userRole } = useAuth();
    const { isMobileOpen, closeMobile } = useSidebar();
    const isOnboardingCtx = useOnboardingMode();
    const isOnboarding = isOnboardingCtx || location.pathname.startsWith("/onboarding");

    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [dashboardOpen, setDashboardOpen] = useState(false);
    const [alertConfigOpen, setAlertConfigOpen] = useState(false);
    const [userDepartment, setUserDepartment] = useState<string | null>(() => {
        const dept = localStorage.getItem("department");
        return dept ? dept.toUpperCase() : null;
    });
    const [profileName, setProfileName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");

    // Prefix path with /onboarding when in onboarding mode
    const resolvePath = (path: string) =>
        isOnboarding ? `/onboarding${path}` : path;

    useEffect(() => {
        if (!isAuthenticated) return;
        userService.getProfile().then((profile) => {
            const storedDept = localStorage.getItem("department");
            const dept = storedDept
                ? storedDept.toUpperCase()
                : profile.department?.toUpperCase() ?? null;
            setUserDepartment(dept);

            const first = profile.first_name?.trim() ?? "";
            const last  = profile.last_name?.trim()  ?? "";
            setProfileName([first, last].filter(Boolean).join(" ") || "User");
            setProfileEmail(profile.email?.trim() ?? "");
        }).catch(() => {
            const storedDept = localStorage.getItem("department");
            if (storedDept) setUserDepartment(storedDept.toUpperCase());
        });
    }, [isAuthenticated]);

    // ── Filter nav items by role / department ──────────────────────────────────

    const isIVF = (userDepartment ?? "").toUpperCase() === "IVF";
    const isCGT = (userDepartment ?? "").toUpperCase() === "CGT";

    const navigationItems = ALL_NAV_ITEMS.filter((item) => {
        if (item.label === "Pending approvals")
            return userRole === "Admin" || userRole === "Pharma_admin";
        if (item.label === "Users")
            return !isCGT && (isOnboarding || userRole === "Admin" || userRole === "Manager");
        if (item.label === "Refill log")
            return !isCGT;
        if (item.label === "Alert Config")
            return isIVF;
        if (item.label === "Reports")
            return isIVF;
        if (item.label === "Database")
            return !isIVF;
        if (item.label === "Control Tower" && userRole === "User" && !isOnboarding)
            return !isIVF;
        return true;
    }).map((item) => {
        // Filter dropdown children by department
        if (isDropdown(item)) {
            const filtered = item.children.filter((child) => {
                if (child.path === "/ivf-track-shipment") return isIVF;
                if (child.path === "/refrigerator-tracking") return isIVF;
                return true;
            });
            return { ...item, children: filtered };
        }
        return item;
    });

    // ── Helpers ────────────────────────────────────────────────────────────────

    const handleNavigation = (path: string) => {
        navigate(resolvePath(path));
        closeMobile();
    };

    const resolvedPathname = isOnboarding
        ? location.pathname.replace("/onboarding", "")
        : location.pathname;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            {/* Mobile backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
                    isMobileOpen
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                }`}
                onClick={closeMobile}
            />

            <aside
                className={`fixed md:static left-0 top-0 w-60 h-dvh shrink-0 bg-gradient-to-b from-[#7b2f83] to-[#29053f] flex flex-col z-50 overflow-hidden transition-transform duration-300 ease-in-out ${
                    isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                }`}
            >
                {/* Decorative background */}
                <div className="absolute left-0 w-full pointer-events-none bottom-[8%] h-[50%] overflow-hidden opacity-30">
                    <img
                        src={IsolationModeBanner}
                        alt=""
                        className="w-full h-full object-cover object-bottom opacity-60 mix-blend-screen scale-[1.2] translate-y-[10%]"
                    />
                </div>

                {/* Logo */}
                <header className="flex items-center gap-[7px] px-6 pt-0 pb-2 md:pb-6 flex-shrink-0 relative z-10">
                    <img
                        src={MyGrapeLogo}
                        alt="myGrape logo"
                        className="w-[110px] h-[75px] md:w-[135px] md:h-[90px]"
                    />
                </header>

                {/* Navigation */}
                <nav className="flex flex-col gap-[18px] px-6 pb-2 flex-1 overflow-y-auto relative z-10 scrollbar-none">
                    {navigationItems.map((item, index) => {
                        if (isDropdown(item)) {
                            const isDashboard = item.label === "Dashboard";
                            const isAlertConfig = item.label === "Alert Config";
                            const active = isDashboard
                                ? isDashboardRoute(resolvedPathname)
                                : isAlertConfig
                                  ? isAlertConfigRoute(resolvedPathname)
                                  : false;
                            const isOpen = isDashboard ? dashboardOpen : isAlertConfig ? alertConfigOpen : false;
                            const setOpen = isDashboard ? setDashboardOpen : isAlertConfig ? setAlertConfigOpen : () => {};

                            const getChildActive = (child: NavChild) => {
                                if (child.path.includes("?")) {
                                    const [p, q] = child.path.split("?");
                                    return location.pathname === resolvePath(p) && location.search === `?${q}`;
                                }
                                const resolved = resolvePath(child.path);
                                const siblingQueryActive = item.children
                                    .filter((s) => s.path !== child.path && s.path.includes("?"))
                                    .some((s) => location.search === `?${s.path.split("?")[1]}`);
                                return (
                                    (location.pathname === resolved || location.pathname.startsWith(resolved + "/")) &&
                                    !siblingQueryActive
                                );
                            };

                            return (
                                <div key={index} className="flex flex-col gap-0.5">
                                    <button
                                        id={isAlertConfig ? "onboarding-sidebar-alert-setting" : undefined}
                                        onClick={() => setOpen((o: boolean) => !o)}
                                        className={`h-auto w-full justify-between gap-4 px-3 py-[7px] rounded-[10px] flex items-center transition-colors ${
                                            active
                                                ? "bg-white/20"
                                                : isOpen
                                                  ? "bg-white/10"
                                                  : "bg-transparent hover:bg-white/10"
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <img
                                                src={item.icon}
                                                alt=""
                                                className="w-5 h-5"
                                                style={isAlertConfig ? { filter: "brightness(0) saturate(100%) invert(100%)" } : undefined}
                                            />
                                            <span className="font-semibold text-xs md:text-sm text-white">
                                                {item.label}
                                            </span>
                                        </div>
                                        <svg
                                            className={`w-4 h-4 flex-shrink-0 transition-transform text-white/90 ${isOpen ? "rotate-180" : ""}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {isOpen && (
                                        <div className="flex flex-col gap-[18px] border-l-2 border-white/20 ml-4 pl-3 my-1.5">
                                            {item.children.map((child, ci) => {
                                                const childActive = getChildActive(child);
                                                return (
                                                    <button
                                                        key={ci}
                                                        onClick={() => {
                                                            setOpen(true);
                                                            handleNavigation(child.path);
                                                        }}
                                                        className={`h-auto w-full justify-start pr-3 py-2 rounded-[10px] flex items-center text-left transition-colors pl-5 ${ci === 0 ? "mt-2" : ""} ${
                                                            childActive
                                                                ? "bg-white text-primary"
                                                                : "text-white/85 hover:bg-white/10 hover:text-white"
                                                        }`}
                                                    >
                                                        <span className="font-medium text-xs md:text-sm">
                                                            {child.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // Leaf nav item
                        const { path, label, icon, lucideIcon: LucideIcon } = item as NavLeaf;
                        const resolvedPath = resolvePath(path);
                        const isActive =
                            path === "/approval"
                                ? location.pathname === resolvePath("/approval") ||
                                  location.pathname === resolvePath("/approval-screen")
                                : location.pathname === resolvedPath ||
                                  location.pathname.startsWith(resolvedPath + "/");

                        const iconSrc =
                            label === "Database"      ? (isActive ? DatabaseIconDark     : DatabaseIconWhite)
                          : label === "Control Tower" ? (isActive ? ControlTowerIconDark : ControlTowerIconWhite)
                          : icon;

                        const needsInvert =
                            (label === "Pending approvals" ||
                             label === "Alert Config" ||
                             label === "Refill log") && !isActive;

                        return (
                            <button
                                key={index}
                                id={label === "Control Tower" ? "onboarding-sidebar-control-tower" : label === "Refill log" ? "onboarding-sidebar-refill-log" : label === "Reports" ? "onboarding-sidebar-reports" : label === "Users" ? "onboarding-sidebar-users" : undefined}
                                onClick={() => handleNavigation(path)}
                                className={`h-auto w-full justify-start gap-4 px-3 py-[7px] rounded-[10px] flex items-center ${
                                    isActive ? "bg-white" : "bg-transparent hover:bg-white/10"
                                }`}
                            >
                                {LucideIcon ? (
                                    <LucideIcon className="w-5 h-5" color={isActive ? "var(--color-primary)" : "#ffffff"} />
                                ) : (
                                    <img
                                        src={iconSrc}
                                        alt=""
                                        className="w-5 h-5"
                                        style={needsInvert ? { filter: "brightness(0) saturate(100%) invert(100%)" } : undefined}
                                    />
                                )}
                                <span className={`font-semibold text-xs md:text-sm ${isActive ? "text-primary" : "text-white"}`}>
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* Profile */}
                <button
                    id="onboarding-sidebar-profile"
                    type="button"
                    onClick={() => { navigate(resolvePath("/user-profile")); closeMobile(); }}
                    className="group w-full flex items-center gap-3 px-6 py-2 md:gap-4 md:px-9 md:py-4 flex-shrink-0 relative z-10 text-white hover:bg-white/10 transition-colors text-left"
                >
                    <span className="w-6 h-6 flex-shrink-0 rounded-full bg-white/20 text-white text-[10px] font-bold flex items-center justify-center uppercase">
                        {(profileName || "User")
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((s) => s[0])
                            .join("") || "U"}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col items-start">
                        <span className="font-semibold text-xs md:text-sm text-white truncate w-full">
                            {profileName || "\u00A0"}
                        </span>
                        <span className="text-[10px] md:text-xs text-white/80 truncate w-full">
                            {profileEmail || "\u00A0"}
                        </span>
                    </div>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100" strokeWidth={2} />
                </button>

                {/* Logout */}
                <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="h-auto flex items-center gap-3 px-6 py-2 md:gap-4 md:px-9 md:py-4 hover:bg-white/10 flex-shrink-0 relative z-10"
                >
                    <img src={LogoutIcon} alt="" className="w-5 h-5" />
                    <span className="font-bold text-white text-xs md:text-sm">Log Out</span>
                </button>
            </aside>

            {/* Logout confirmation dialog */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
                        <h2 className="text-base font-semibold text-gray-800 mb-2">Confirm Logout</h2>
                        <p className="text-sm text-gray-500 mb-6">Are you sure you want to log out?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { setShowLogoutConfirm(false); onLogout(); }}
                                className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-[#8a2a95] transition-colors"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
