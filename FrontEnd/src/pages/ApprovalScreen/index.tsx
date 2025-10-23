import React, { useEffect, useState } from "react";
import { useLocation, useSearchParams, Navigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../../contexts/AuthContext";
import { authUtils } from "../../utils/auth";
import MyGrapeLogo from "../../assets/logo.svg";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";

const ApprovalScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const registrationId = searchParams.get("registration_id");
  const { token: authToken, isAuthenticated, logout } = useAuth();
  const cookieToken = authUtils.getToken();

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [completed, setCompleted] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const location = useLocation();

  // Allow context time to mount, but don't show an auth error if a cookie token exists
  useEffect(() => {
    setFetching(false);
  }, [isAuthenticated]);


  // Approve / Reject Handler
  const handleAction = async (action: "approve" | "reject") => {
    const tokenToUse = authToken || cookieToken;
    if (!registrationId || !tokenToUse) {
      setStatus("Authentication required. Please login first.");
      return;
    }
    setLoading(true);

    try {
      const endpoint =
        action === "approve" ? "/api/user/approve" : "/api/user/reject";

      const response = await axios.post(
        `${API_BASE_URL}${endpoint}`,
        { registration_id: registrationId },
        { 
          headers: { 
            Authorization: `Bearer ${tokenToUse}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      setStatus(response.data.detail);
      setCompleted(true);
      // After successful approval or rejection, navigate to dashboard
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setStatus("Session expired. Please login again.");
        logout();
      } else if (err.response?.status === 403) {
        setStatus("Access denied: You don't have permission to perform this action.");
      } else {
        setStatus(err.response?.data?.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Loading...
      </div>
    );
  }

  if (!registrationId) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Invalid Request</h2>
          <p>No registration ID provided. Please access this page through a valid approval link.</p>
        </div>
      </div>
    );
  }

  // If there is no auth token at all, redirect to login
  if (!isAuthenticated && !cookieToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="w-full h-screen flex overflow-hidden bg-white font-['Work_Sans']">
{/* Left Section */}
<aside
                className="w-[36%] flex flex-col justify-between text-white relative overflow-hidden 
             bg-gradient-to-b from-[#9C3AA6] to-[#30024D] 
             rounded-tr-[40px] rounded-br-[40px]"
            >
                <div className="flex h-[15%] items-center space-x-2  p-12 pb-0 ">
                    <img src={MyGrapeLogo} alt="logo" className="w-[41.87px] h-[55px]" />
                    <h1 className="font-semibold text-[30px]">myGrape</h1>
                </div>
                <div className="flex items-center overflow-hidden">
                    <img
                        src={MyGrapeBanner}
                        alt="banner"
                        className="w-full h-[125%] object-fill"
                    />
                </div>
                <div className="flex flex-col h-[20%] justify-end pt-0 p-12 ">
                    <h2 className="text-2xl font-bold leading-snug mt-8">
                        Driving Health Forward <br />
                        One Smart Solution At a Time
                    </h2>
                    <p className="mt-4 text-sm opacity-80">
                        Because every patient is someone’s everything.
                    </p>
                </div>
            </aside>
      {/* Right Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-16 overflow-hidden">
        <div className="w-full max-w-[22rem]">
          {!completed && (
            <>
              <h2 className="text-[32px] font-black text-gray-700 mb-2 tracking-tighter">
                Approval Request
              </h2>
              <p className="text-gray-500 mb-6">
                Proceed to approve or reject.
              </p>
            </>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            {!completed && (
              <div className="flex gap-4 justify-center">
                <button
                  className="w-full py-3 bg-[#8b2a96]  text-white rounded-md font-medium transition disabled:opacity-50"
                  onClick={() => handleAction("approve")}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Approve"}
                </button>
                <button
                  className="w-full py-3 bg-[#F2E4FF] text-[#8b2a96] rounded-md font-medium transition disabled:opacity-50"
                  onClick={() => handleAction("reject")}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Reject"}
                </button>
              </div>
            )}

            {status && (
              <p className="mt-4 text-center text-gray-800 font-medium">{status}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ApprovalScreen;
