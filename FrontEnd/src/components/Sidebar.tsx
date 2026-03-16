import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/userService";
import MyGrapeLogo from "../assets/mGScale.svg";
import IsolationModeBanner from "../assets/Isolation_Mode.svg";

// Dashboard Icons
import DashboardIconWhite from "../assets/DashBoardIcons/DashboardWhite.svg";
import DatabaseIconWhite from "../assets/DashBoardIcons/DataBaseWhite.svg";
import DatabaseIconDark from "../assets/DashBoardIcons/DatabaseDark.svg";
import ControlTowerIconDark from "../assets/DashBoardIcons/ControlTowerDark.svg";
import ControlTowerIconWhite from "../assets/DashBoardIcons/ControlTowerWhite.svg";
import MyTasksIcon from "../assets/DashBoardIcons/My_Tasks.svg";
import CriticalAlertsIcon from "../assets/DashBoardIcons/Critical_Alerts.svg";
import LogoutIcon from "../assets/DashBoardIcons/Logout.svg";
import UserIcon from "../assets/DashBoardIcons/User.svg";
//import EmbryosIcon from "../assets/DashBoardIcons/Embryos.svg";
//import IncubatorQualityTrackingIcon from "../assets/DashBoardIcons/IncubatorQualityTracking.svg";

interface SidebarProps {
    onLogout: () => void;
}

type NavChild = { label: string; path: string };
type NavItem =
    | { icon: string; label: string; path: string }
    | {
          icon: string;
          label: string;
          dropdown: true;
          children: NavChild[];
      };

const isDropdownItem = (item: NavItem): item is NavItem & { dropdown: true; children: NavChild[] } =>
    "dropdown" in item && item.dropdown === true;

export const Sidebar = ({ onLogout }: SidebarProps) => {
    const [sidebarHeight, setSidebarHeight] = useState(window.innerHeight);
    const [dashboardOpen, setDashboardOpen] = useState(() => {
        const p = window.location.pathname;
        return p === "/dashboard" || p === "/ivf-track-shipment" || p.startsWith("/ivf-track-shipment/") || p === "/incubator-tracking" || p.startsWith("/incubator-tracking/");
    });
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, userRole } = useAuth();

    // User department (CGT or IVF) - initialize from localStorage
    const [userDepartment, setUserDepartment] = useState<string | null>(() => {
        try {
            const dept = localStorage.getItem("department");
            return dept ? dept.toUpperCase() : null;
        } catch {
            return null;
        }
    });
    // Profile display for sidebar (name + email)
    const [profileName, setProfileName] = useState<string>("");
    const [profileEmail, setProfileEmail] = useState<string>("");

    useEffect(() => {
        const handleResize = () => setSidebarHeight(window.innerHeight);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Fetch user profile to get department
    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const profile = await userService.getProfile();

                // Get department (CGT or IVF) - check localStorage first, then API
                let department: string | null = null;
                const storedDept = localStorage.getItem("department");
                if (storedDept) {
                    department = storedDept.toUpperCase();
                }

                // Fall back to API if not in localStorage
                if (!department) {
                    department = profile.department?.toUpperCase() || null;
                }

                setUserDepartment(department);
                const first = profile.first_name?.trim?.() || "";
                const last = profile.last_name?.trim?.() || "";
                setProfileName([first, last].filter(Boolean).join(" ") || "User");
                setProfileEmail(profile.email?.trim?.() || "");
            } catch {
                // Try to get department from localStorage even if API fails
                const storedDept = localStorage.getItem("department");
                if (storedDept) {
                    const department = storedDept.toUpperCase();
                    setUserDepartment(department);
                }
            }
        };
        if (isAuthenticated) {
            fetchUserProfile();
        }
    }, [isAuthenticated]);

    // Keep dropdown open when on a dashboard sub-route
    useEffect(() => {
        const p = location.pathname;
        if (p === "/dashboard" || p === "/ivf-track-shipment" || p.startsWith("/ivf-track-shipment/") || p === "/incubator-tracking" || p.startsWith("/incubator-tracking/") || p === "/embryo-grading") {
            setDashboardOpen(true);
        }
    }, [location.pathname]);

    // Base navigation items (Dashboard dropdown: Overview + Incubator quality tracking; then Database, Control Tower, etc.)
    const allNavigationItems: NavItem[] = [
        {
            icon: DashboardIconWhite,
            label: "Dashboard",
            dropdown: true,
            children: [
                { label: "Overview", path: "/dashboard" },
                { label: "Container Quality Tracking", path: "/ivf-track-shipment" },
                { label: "Incubator Quality Tracking", path: "/incubator-tracking" },
                { label: "Embryo Grading", path: "/embryo-grading" },
            ],
        },
        { icon: DatabaseIconWhite, label: "Database", path: "/database" },
        {
            icon: ControlTowerIconWhite,
            label: "Control Tower",
            path: "/control-tower",
        },
        { icon: MyTasksIcon, label: "Pending approvals", path: "/approval" },
        {
            icon: CriticalAlertsIcon,
            label: "Alert Configuration",
            path: "/alert-setting",
        },
        //{ icon: EmbryosIcon, label: "Embryo Grading", path: "/embryo-grading" },
        //{ icon: IncubatorQualityTrackingIcon, label: "Incubator Tracking", path: "/incubator-tracking" }
    ];

    // Filter nav by role/department: Database hidden for IVF; Control Tower hidden for IVF User; Pending approvals only for Admin/Pharma_admin; Alert Setting only for IVF Manager/Admin
    const navigationItems = allNavigationItems.filter((item) => {
        const isIVF = (userDepartment || "").toUpperCase() === "IVF";
        if (item.label === "Pending approvals" && "path" in item) {
            const isApprover =
                userRole === "Admin" || userRole === "Pharma_admin";
            return isApprover;
        }
        if (item.label === "Alert Configuration") {
            return isIVF && (userRole === "Manager" || userRole === "Admin");
        }
        if (isIVF && item.label === "Database") {
            return false;
        }
        // IVF User (H.User) has no Control Tower access – hide from sidebar
        if (isIVF && item.label === "Control Tower" && userRole === "User") {
            return false;
        }
        return true;
    });

    const handleNavigation = (path: string) => {
        navigate(path);
    };

    return (
        <aside
            className="fixed left-0 top-0 w-60 bg-gradient-to-b from-[#9C3AA6] to-[#30024D] flex flex-col z-10 overflow-hidden"
            style={{ height: `${sidebarHeight}px` }}
        >
            {/* Decorative DNA/Wave Pattern Background */}
            <div className="absolute left-0 w-full pointer-events-none bottom-[8%] h-[50%] overflow-hidden">
                <img
                    src={IsolationModeBanner}
                    alt="Decorative wave pattern"
                    className="w-full h-full object-cover object-bottom opacity-60 mix-blend-screen scale-[1.2] translate-y-[10%]"
                />
            </div>

            {/* Header */}
            <header className="flex items-center gap-[7px] px-6 pt-0 pb-6 flex-shrink-0 relative z-10">
                <img
                    className="w-[150px] h-[100px]"
                    alt="myGrape logo icon"
                    src={MyGrapeLogo}
                />
                {/* <h1 className="font-semibold text-[30px] text-white">myGrape</h1> */}
            </header>

            {/* Nav Buttons */}
            <nav className="flex flex-col gap-[18px] px-6 flex-shrink-0 relative z-10">
                {navigationItems.map((item, index) => {
                    if (isDropdownItem(item)) {
                        return (
                            <div key={index} className="flex flex-col gap-0.5">
                                <button
                                    onClick={() =>
                                        setDashboardOpen((open) => !open)
                                    }
                                    className={`h-auto w-full justify-between gap-4 px-3 py-[7px] rounded-[10px] flex items-center transition-colors ${
                                        dashboardOpen
                                            ? "bg-white/10"
                                            : "bg-transparent hover:bg-white/10"
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <img
                                            className="w-5 h-5"
                                            alt={`${item.label} icon`}
                                            src={DashboardIconWhite}
                                        />
                                        <span className="font-semibold text-sm text-white">
                                            {item.label}
                                        </span>
                                    </div>
                                    <svg
                                        className={`w-4 h-4 flex-shrink-0 transition-transform text-white/90 ${dashboardOpen ? "rotate-180" : ""}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 9l-7 7-7-7"
                                        />
                                    </svg>
                                </button>
                                {dashboardOpen && (
                                    <div className="flex flex-col gap-[18px] border-l-2 border-white/20 ml-4 pl-3 my-1.5">
                                        {item.children.map((child, childIndex) => {
                                            const isChildActive =
                                                child.path === "/dashboard"
                                                    ? location.pathname === "/dashboard"
                                                                                                        : child.path === "/ivf-track-shipment"
                                                                                                            ? location.pathname === "/ivf-track-shipment" ||
                                                                                                                location.pathname.startsWith("/ivf-track-shipment/")
                                                    : child.path === "/incubator-tracking"
                                                      ? location.pathname === "/incubator-tracking" ||
                                                        location.pathname.startsWith("/incubator-tracking/")
                                                      : child.path === "/embryo-grading"
                                                        ? location.pathname === "/embryo-grading"
                                                        : false;
                                            return (
                                                <button
                                                    key={childIndex}
                                                    onClick={() => {
                                                        // Incubator Quality Tracking & Embryo Grading: navigation disabled for now
                                                        // if (child.path !== "/incubator-tracking" && child.path !== "/embryo-grading") {
                                                        // TODO
                                                            handleNavigation(child.path);
                                                        // }
                                                    }}
                                                    className={`h-auto w-full justify-start pr-3 py-2 rounded-[10px] flex items-center text-left transition-colors pl-5 ${childIndex === 0 ? "mt-2" : ""} ${
                                                        isChildActive
                                                            ? "bg-white text-[#6b1176]"
                                                            : "text-white/85 hover:bg-white/10 hover:text-white"
                                                    }`}
                                                >
                                                    <span className="font-medium text-sm text-left">
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
                    const path = (item as { path: string }).path;
                    const isActive =
                        path === "/approval"
                            ? location.pathname === "/approval" ||
                              location.pathname === "/approval-screen"
                            : path === "/alert-setting"
                              ? location.pathname === "/alert-setting"
                              : location.pathname === path;
                    const iconSrc = (() => {
                        if (item.label === "Database") {
                            return isActive
                                ? DatabaseIconDark
                                : DatabaseIconWhite;
                        }
                        if (item.label === "Control Tower") {
                            return isActive
                                ? ControlTowerIconDark
                                : ControlTowerIconWhite;
                        }
                        return item.icon;
                    })();
                    const iconStyle =
                        (item.label === "Pending approvals" ||
                            item.label === "Alert Configuration") &&
                        !isActive
                            ? {
                                  filter: "brightness(0) saturate(100%) invert(100%)",
                              }
                            : undefined;
                    return (
                        <button
                            key={index}
                            onClick={() => handleNavigation(path)}
                            className={`h-auto w-full justify-start gap-4 px-3 py-[7px] rounded-[10px] flex items-center ${
                                isActive
                                    ? "bg-white"
                                    : "bg-transparent hover:bg-white/10"
                            }`}
                        >
                            <img
                                className="w-5 h-5"
                                alt={`${item.label} icon`}
                                src={iconSrc}
                                style={iconStyle}
                            />
                            <span
                                className={`font-semibold text-sm ${
                                    isActive ? "text-[#6b1176]" : "text-white"
                                }`}
                            >
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* Spacer to push profile + logout to bottom */}
            <div className="flex-1 relative z-10" />

            {/* Profile (above Log Out) - alignment and spacing match Log Out */}
            <button
                type="button"
                onClick={() => navigate("/user-profile")}
                className="group w-full flex items-center gap-4 px-9 py-4 flex-shrink-0 relative z-10 text-white hover:bg-white/10 transition-colors text-left"
            >
                <img className="w-5 h-5 flex-shrink-0" alt="Profile" src={UserIcon} />
                <div className="flex-1 min-w-0 flex flex-col items-start ">
                    <span className="font-semibold text-sm text-white truncate w-full text-left">
                        {profileName || "\u00A0"}
                    </span>
                    <span className="text-xs text-white/80 truncate w-full text-left">
                        {profileEmail || "\u00A0"}
                    </span>
                </div>
                <ChevronRight
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    strokeWidth={2}
                />
            </button>

            {/* Logout Button */}
            <button
                onClick={onLogout}
                className="h-auto flex items-center gap-4 px-9 py-4 hover:bg-white/10 flex-shrink-0 relative z-10"
            >
                <img className="w-5 h-5" alt="Log out icon" src={LogoutIcon} />
                <span className="font-bold text-white text-sm">Log Out</span>
            </button>
        </aside>
    );
};
