import React, { useEffect, useState } from "react";
import { useLocation, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authUtils } from "../../utils/auth";
import { BaseApiService } from "../../services/baseApiService";
import { userService } from "../../services/userService";
import type { UserProfileDto } from "../../services/userService";
import MyGrapeLogo from "../../assets/logo.svg";
import MyGrapeBanner from "../../assets/Isolation_Mode.svg";

const ApprovalScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const registrationId = searchParams.get("registration_id");
  const { token: authToken, isAuthenticated, logout } = useAuth();
  const cookieToken = authUtils.getToken();

  const [status, setStatus] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [lastAction, setLastAction] = useState<"approve" | "reject" | null>(null);
  const [fetching, setFetching] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [userInfo, setUserInfo] = useState<UserProfileDto | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);

  const apiService = new BaseApiService();
  const location = useLocation();

  // Allow context time to mount, but don't show an auth error if a cookie token exists
  useEffect(() => {
    setFetching(false);
  }, [isAuthenticated]);

  // Fetch user information
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        // Get user ID from URL registration_id parameter
        if (!registrationId) {
          setStatus("Registration ID not found in URL");
          setUserLoading(false);
          return;
        }

        // Fetch user details from API
        const userData = await userService.getUserById(registrationId);
        setUserInfo(userData);
      } catch (error: any) {
        setStatus("Failed to fetch user information");
      } finally {
        setUserLoading(false);
      }
    };

    if (!fetching) {
      fetchUserInfo();
    }
  }, [fetching, registrationId]);


  // Show confirmation modal
  const handleButtonClick = (action: "approve" | "reject") => {
    setPendingAction(action);
    setShowConfirmModal(true);
  };

  // Close confirmation modal
  const handleCancel = () => {
    setShowConfirmModal(false);
    setPendingAction(null);
  };


  // Approve / Reject Handler - executed after confirmation
  const handleAction = async (action: "approve" | "reject") => {
    const tokenToUse = authToken || cookieToken;
    if (!registrationId || !tokenToUse) {
      setStatus("Authentication required. Please login first.");
      setShowConfirmModal(false);
      return;
    }
    setShowConfirmModal(false);

    setLoadingAction(action);

    try {
      const endpoint =
        action === "approve" ? "/api/user/approve" : "/api/user/reject";

      await apiService.post<{ detail?: string; message?: string }>(
        endpoint,
        { registration_id: registrationId }
      );

      // Format status message based on action
      const userEmail = userInfo?.email || "user";
      const statusMessage = action === "approve"
        ? `User registration request approved for ${userEmail}`
        : `User registration request rejected for ${userEmail}`;

      setStatus(statusMessage);
      setLastAction(action);
      setCompleted(true);

      // Refresh user info to get updated status
      try {
        const updatedUserData = await userService.getUserById(registrationId);
        setUserInfo(updatedUserData);
      } catch (error) {
        // Ignore error, user info will be stale but that's okay
      }

      // Navigate to dashboard after 3 seconds
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        setStatus("Session expired. Please login again.");
        logout();
      } else if (err.message?.includes('403')) {
        setStatus("Access denied: You don't have permission to perform this action.");
      } else {
        setStatus(err.message || "An error occurred");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  if (fetching || userLoading) {
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
    <>
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-transparent backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Confirm {pendingAction === "approve" ? "Approval" : "Rejection"}
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to {pendingAction === "approve" ? "approve" : "reject"} the registration request for{" "}
              <span className="font-medium text-gray-800">
                {userInfo?.first_name} {userInfo?.last_name}
              </span>
              {userInfo?.email && (
                <span className="text-gray-600"> ({userInfo.email})</span>
              )}
              ?
            </p>
            <div className="flex gap-4 justify-end">
              <button
                className="px-6 py-2 bg-[#F2E4FF] text-[#8b2a96] rounded-md font-medium transition hover:bg-[#E8D4F0]"
                onClick={handleCancel}
                disabled={loadingAction !== null}
              >
                Cancel
              </button>
              <button
                className={`px-6 py-2 rounded-md font-medium transition disabled:opacity-50 ${
                  pendingAction === "approve"
                    ? "bg-[#8b2a96] text-white hover:bg-[#7a247e]"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
                onClick={() => pendingAction && handleAction(pendingAction)}
                disabled={loadingAction !== null}
              >
                Confirm {pendingAction === "approve" ? "Approval" : "Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <p className="mt-4 opacity-80 font-[12px]">
                        Because every patient is someone’s everything.
                    </p>
                </div>
            </aside>
      {/* Right Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 overflow-hidden">
        <div className="w-full max-w-[28rem]">
          {!completed && (
            <>
              <h2 className="text-[32px] font-black text-gray-700 mb-2 tracking-tighter">
                Approval Request
              </h2>
              <p className="text-gray-500 mb-6">
                Review user details and proceed to approve or reject.
              </p>
            </>
          )}

          {/* User Information Card */}
          {userInfo && !completed && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">User Information</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Name:</span>
                  <span className="text-gray-800">{userInfo.first_name} {userInfo.last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Email:</span>
                  <span className="text-gray-800">{userInfo.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Role:</span>
                  <span className="text-gray-800">{userInfo.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Company:</span>
                  <span className="text-gray-800">{userInfo.company_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    userInfo.approved_status === 'pending' 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : userInfo.approved_status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {userInfo.approved_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Account Status:</span>
                  <span className={`font-medium ${
                    userInfo.status ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {userInfo.status ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons or Success Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            {!completed && (
              <div className="flex gap-4 justify-center">
                <button
                  className="w-full py-3 bg-[#8b2a96] text-white rounded-md font-medium transition disabled:opacity-50"
                  onClick={() => handleButtonClick("approve")}
                  disabled={loadingAction !== null}
                >
                  Approve
                </button>
                <button
                  className="w-full py-3 bg-[#F2E4FF] text-[#8b2a96] rounded-md font-medium transition disabled:opacity-50"
                  onClick={() => handleButtonClick("reject")}
                  disabled={loadingAction !== null}
                >
                  Reject
                </button>
              </div>
            )}
            {completed && (
              <div className="flex flex-col items-center">
                <div className="flex justify-center mb-4">
                  <div className={`w-8 h-8 ${lastAction === 'reject' ? 'bg-red-500' : 'bg-green-500'} rounded-lg flex items-center justify-center`}>
                    {lastAction === 'reject' ? (
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                {status && (
                  <p className="text-center text-gray-800 font-medium mb-4">{status}</p>
                )}
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
    </>
  );
};

export default ApprovalScreen;

