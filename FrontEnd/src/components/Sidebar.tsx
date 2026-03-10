import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/userService";
import MyGrapeLogo from "../assets/mGScale.svg";
import IsolationModeBanner from "../assets/Isolation_Mode.svg";

// Dashboard Icons
import DashboardIconWhite from "../assets/DashBoardIcons/DashboardWhite.svg";
import DashboardIconDark from "../assets/DashBoardIcons/DashBoardDark.svg";
import DatabaseIconWhite from "../assets/DashBoardIcons/DataBaseWhite.svg";
import DatabaseIconDark from "../assets/DashBoardIcons/DatabaseDark.svg";
import ControlTowerIconDark from "../assets/DashBoardIcons/ControlTowerDark.svg";
import ControlTowerIconWhite from "../assets/DashBoardIcons/ControlTowerWhite.svg";
import MyTasksIcon from "../assets/DashBoardIcons/My_Tasks.svg";
import CriticalAlertsIcon from "../assets/DashBoardIcons/Critical_Alerts.svg";
import LogoutIcon from "../assets/DashBoardIcons/Logout.svg";
import EmbryosIcon from "../assets/DashBoardIcons/Embryos.svg";
import IncubatorQualityTrackingIcon from "../assets/DashBoardIcons/IncubatorQualityTracking.svg";

interface SidebarProps {
  onLogout: () => void;
}

export const Sidebar = ({ onLogout }: SidebarProps) => {
  const [sidebarHeight, setSidebarHeight] = useState(window.innerHeight);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, userRole } = useAuth();
  
  // User department (CGT or IVF) - initialize from localStorage
  const [userDepartment, setUserDepartment] = useState<string | null>(() => {
    try {
      const dept = localStorage.getItem('department');
      return dept ? dept.toUpperCase() : null;
    } catch {
      return null;
    }
  });

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
        const storedDept = localStorage.getItem('department');
        if (storedDept) {
          department = storedDept.toUpperCase();
        }
        
        // Fall back to API if not in localStorage
        if (!department) {
          department = profile.department?.toUpperCase() || null;
        }
        
        setUserDepartment(department);
      } catch {
        // Try to get department from localStorage even if API fails
        const storedDept = localStorage.getItem('department');
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

  // Base navigation items (Dashboard, Database, Control Tower, Pending approvals, Alert Configuration, Embryo Grading, Incubator Tracking)
  const allNavigationItems = [
    { icon: DashboardIconWhite, label: "Dashboard", path: "/dashboard" },
    { icon: DatabaseIconWhite, label: "Database", path: "/database" },
    { icon: ControlTowerIconWhite, label: "Control Tower", path: "/control-tower" },
    { icon: MyTasksIcon, label: "Pending approvals", path: "/approval" },
    { icon: CriticalAlertsIcon, label: "Alert Configuration", path: "/alert-setting" },
    // { icon: EmbryosIcon, label: "Embryo Grading", path: "/embryo-grading" },
    // { icon: IncubatorQualityTrackingIcon, label: "Incubator Tracking", path: "/incubator-tracking" }
  ];

  // Filter nav by role/department: Database hidden for IVF; Control Tower hidden for IVF User; Pending approvals only for Admin/Pharma_admin; Alert Setting only for IVF Manager/Admin
  const navigationItems = allNavigationItems.filter(item => {
    const isIVF = (userDepartment || '').toUpperCase() === 'IVF';
    if (item.label === "Pending approvals") {
      const isApprover = userRole === "Admin" || userRole === "Pharma_admin";
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
    // Embryo Grading and Incubator Tracking: show for IVF department only
    if (item.label === "Embryo Grading" || item.label === "Incubator Tracking") {
      return isIVF;
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
      <div 
        className="absolute left-0 w-full pointer-events-none bottom-[8%] h-[50%] overflow-hidden"
      >
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
          const isActive = item.path === "/approval"
            ? (location.pathname === "/approval" || location.pathname === "/approval-screen")
            : item.path === "/alert-setting"
            ? location.pathname === "/alert-setting"
            : item.path === "/incubator-tracking"
            ? location.pathname === "/incubator-tracking" || location.pathname.startsWith("/incubator-tracking/")
            : location.pathname === item.path;
          const iconSrc = (() => {
            if (item.label === "Dashboard") {
              return isActive ? DashboardIconDark : DashboardIconWhite;
            }
            if (item.label === "Database") {
              return isActive ? DatabaseIconDark : DatabaseIconWhite;
            }
            if (item.label === "Control Tower") {
              return isActive ? ControlTowerIconDark : ControlTowerIconWhite;
            }
            return item.icon;
          })();
          const iconStyle =
            (item.label === "Pending approvals" || item.label === "Alert Configuration" || item.label === "Embryo Grading" || item.label === "Incubator Tracking") && !isActive
              ? { filter: "brightness(0) saturate(100%) invert(100%)" }
              : undefined;
          return (
            <button
              key={index}
              onClick={() => handleNavigation(item.path)}
              className={`h-auto w-full justify-start gap-4 px-3 py-[7px] rounded-[10px] flex items-center ${
                isActive ? "bg-white" : "bg-transparent hover:bg-white/10"
              }`}
            >
              <img className="w-5 h-5" alt={`${item.label} icon`} src={iconSrc} style={iconStyle} />
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

      {/* Spacer to push logout to bottom */}
      <div className="flex-1 relative z-10" />

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
