import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import MyGrapeLogo from "../assets/logo.svg";
import IsolationModeBanner from "../assets/Isolation_Mode.svg";

// Dashboard Icons
import DashboardIconWhite from "../assets/DashBoardIcons/DashBoardWhite.svg";
import DashboardIconDark from "../assets/DashBoardIcons/DashBoardDark.svg";
import DatabaseIconWhite from "../assets/DashBoardIcons/DataBaseWhite.svg";
import DatabaseIconDark from "../assets/DashBoardIcons/DatabaseDark.svg";
import ControlTowerIconDark from "../assets/DashBoardIcons/ControlTowerDark.svg";
import ControlTowerIconWhite from "../assets/DashBoardIcons/ControlTowerWhite.svg";
import LogoutIcon from "../assets/DashBoardIcons/Logout.svg";

interface SidebarProps {
  onLogout: () => void;
}

export const Sidebar = ({ onLogout }: SidebarProps) => {
  const [sidebarHeight, setSidebarHeight] = useState(window.innerHeight);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleResize = () => setSidebarHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navigationItems = [
    { icon: DashboardIconWhite, label: "Dashboard", path: "/dashboard" },
    { icon: DatabaseIconWhite, label: "Database", path: "/database" },
    { icon: ControlTowerIconWhite, label: "Control Tower", path: "/control-tower" }
  ];

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
      <header className="flex items-center gap-[7px] px-6 py-4 flex-shrink-0 relative z-10">
        <img
          className="w-[22px] h-[31px]"
          alt="myGrape logo icon"
          src={MyGrapeLogo}
        />
        <h1 className="font-semibold text-[30px] text-white">myGrape</h1>
      </header>

      {/* Nav Buttons */}
      <nav className="flex flex-col gap-[18px] mt-8 px-6 flex-shrink-0 relative z-10">
        {navigationItems.map((item, index) => {
          const isActive = location.pathname === item.path;
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
          return (
            <button
              key={index}
              onClick={() => handleNavigation(item.path)}
              className={`h-auto w-full justify-start gap-4 px-3 py-[7px] rounded-[10px] flex items-center ${
                isActive ? "bg-white" : "bg-transparent hover:bg-white/10"
              }`}
            >
              <img className="w-5 h-5" alt={`${item.label} icon`} src={iconSrc} />
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
