import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import ApprovalScreen from "../pages/ApprovalScreen";

export const ApprovalLayout: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="bg-[#FDFAFF] flex w-full h-[100vh] overflow-x-hidden"
      style={{
        maxWidth: "100vw",
        touchAction: "pan-y",
        overscrollBehaviorX: "none",
      }}
    >
      <Sidebar onLogout={handleLogout} />

      <main
        className="flex-1 flex flex-col overflow-x-hidden overflow-y-hidden ml-60 min-w-0"
        style={{
          maxWidth: "calc(100vw - 15rem)",
          touchAction: "pan-y",
          overscrollBehaviorX: "none",
          height: "100vh",
        }}
      >
        <div
          className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-h-0 p-6"
          style={{
            touchAction: "pan-y",
            overscrollBehaviorY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <ApprovalScreen />
        </div>
      </main>
    </div>
  );
};
