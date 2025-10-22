import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import MyGrapeLogo from "../assets/logo.svg";

// Dashboard Icons
import DashboardIcon from "../assets/DashBoardIcons/DashBoard.svg";
import DatabaseIcon from "../assets/DashBoardIcons/DataBase.svg";
import ControlTowerIcon from "../assets/DashBoardIcons/Control_Towers.svg";
import SupportIcon from "../assets/DashBoardIcons/Support.svg";
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
    { icon: DashboardIcon, label: "Dashboard", path: "/dashboard" },
    { icon: DatabaseIcon, label: "Database", path: "/database" },
    { icon: ControlTowerIcon, label: "Control Tower", path: "/control-tower" },
    { icon: SupportIcon, label: "Support", path: "/support" },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <aside
      className="fixed left-0 top-0 w-60 bg-gradient-to-b from-[#9C3AA6] to-[#30024D] flex flex-col z-10 overflow-hidden"
      style={{ height: `${sidebarHeight}px` }}
    >
      {/* Header */}
      <header className="flex items-center gap-[7px] px-6 py-4 flex-shrink-0">
        <img
          className="w-[22px] h-[31px]"
          alt="myGrape logo icon"
          src={MyGrapeLogo}
        />
        <h1 className="font-semibold text-[30px] text-white">myGrape</h1>
      </header>

      {/* Nav Buttons */}
      <nav className="flex flex-col gap-[18px] mt-8 px-6 flex-shrink-0">
        {navigationItems.map((item, index) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={index}
              onClick={() => handleNavigation(item.path)}
              className={`h-auto w-full justify-start gap-4 px-3 py-[7px] rounded-[10px] flex items-center ${
                isActive ? "bg-white" : "bg-transparent hover:bg-white/10"
              }`}
            >
              <img className="w-5 h-5" alt={`${item.label} icon`} src={item.icon} />
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
      <div className="flex-1" />

      {/* Logout Button */}
      <button
        onClick={onLogout}
        className="h-auto flex items-center gap-4 px-9 py-4 hover:bg-white/10 flex-shrink-0"
      >
        <img className="w-5 h-5" alt="Log out icon" src={LogoutIcon} />
        <span className="font-bold text-white text-sm">Log Out</span>
      </button>
    </aside>
  );
};
