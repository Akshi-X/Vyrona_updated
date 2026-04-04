import React, { useEffect, useState } from "react";
import { useLocation, useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { authUtils } from "../../utils/auth";
import { BaseApiService } from "../../services/baseApiService";
import { userService } from "../../services/userService";
import type { UserProfileDto, UserListItem } from "../../services/userService";
import MyTasksIcon from "../../assets/DashBoardIcons/My_Tasks.svg";

const ApprovalScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const registrationId = searchParams.get("registration_id");
  const navigate = useNavigate();
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

  // When no registration_id: list of pending approvals (for approvers)
  const [pendingList, setPendingList] = useState<UserListItem[]>([]);
  const [pendingListLoading, setPendingListLoading] = useState(false);
  const [pendingListError, setPendingListError] = useState<string | null>(null);

  const apiService = new BaseApiService();
  const location = useLocation();

  // Allow context time to mount, but don't show an auth error if a cookie token exists
  useEffect(() => {
    setFetching(false);
  }, [isAuthenticated]);

  // Fetch user information when registration_id is present
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        if (!registrationId) {
          setUserLoading(false);
          return;
        }
        const userData = await userService.getUserById(registrationId);
        setUserInfo(userData);
      } catch (error: any) {
        setStatus("Failed to fetch user information");
      } finally {
        setUserLoading(false);
      }
    };

    if (!fetching && registrationId) {
      fetchUserInfo();
    } else if (!fetching && !registrationId) {
      setUserLoading(false);
    }
  }, [fetching, registrationId]);

  // When no registration_id: fetch pending approvals list (for approvers)
  useEffect(() => {
    if (registrationId) return;
    if (!isAuthenticated && !cookieToken) return;
    let cancelled = false;
    const load = async () => {
      setPendingListLoading(true);
      setPendingListError(null);
      try {
        const res = await userService.getPendingApprovals();
        if (!cancelled) setPendingList(res?.users ?? []);
      } catch (e: any) {
        if (!cancelled) {
          setPendingList([]);
          setPendingListError(e?.message || "Failed to load pending approvals");
        }
      } finally {
        if (!cancelled) setPendingListLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [registrationId, isAuthenticated, cookieToken]);


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

      // Stay on the success page - no navigation to dashboard
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

  if (fetching || (registrationId && userLoading)) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Loading...
      </div>
    );
  }

  // No registration_id: show pending approvals list (or redirect to login)
  if (!registrationId) {
    if (!isAuthenticated && !cookieToken) {
      const approvalPath = `${location.pathname}${location.search}${location.hash || ""}`;
      try {
        sessionStorage.setItem("approval_redirect_path", approvalPath);
      } catch {}
      return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash }, fromPath: approvalPath }} />;
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 overflow-hidden">
        <div className="w-full max-w-[28rem]">
          <div className="flex items-center gap-3 mb-2">
            <img src={MyTasksIcon} alt="Pending approvals" className="w-8 h-8" />
            <h2 className="text-[28px] sm:text-[32px] font-black text-gray-700 tracking-tighter">Pending approvals</h2>
          </div>
          <p className="text-gray-500 mb-6 text-sm sm:text-base">Select a user to review and approve or reject their registration.</p>
          {pendingListLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : pendingListError ? (
            <p className="text-red-600">{pendingListError}</p>
          ) : pendingList.length === 0 ? (
            <p className="text-gray-500">No pending approvals.</p>
          ) : (
            <ul className="space-y-2">
              {pendingList.map((u) => (
                <li key={u.user_id} className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex flex-col min-w-0">
                    <span className="text-gray-800 font-medium truncate">{u.first_name} {u.last_name}</span>
                    {u.email && <span className="text-gray-500 text-sm truncate">{u.email}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/approval?registration_id=${encodeURIComponent(u.user_id)}`)}
                    className="shrink-0 py-2 px-4 bg-[#8b2a96] text-white rounded-md font-medium hover:bg-[#7a247e] transition"
                  >
                    Review
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // If there is no auth token at all, redirect to login with approval URL preserved
  if (!isAuthenticated && !cookieToken) {
    // Preserve the full approval URL (pathname + search params) for redirect after login
    // Construct the full path as a string to ensure it's preserved correctly
    const approvalPath = `${location.pathname}${location.search}${location.hash || ""}`;

    // Store in sessionStorage as backup in case state doesn't persist
    try {
      sessionStorage.setItem('approval_redirect_path', approvalPath);
    } catch (e) {
      // Silently handle sessionStorage errors
    }

    return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash }, fromPath: approvalPath }} />;
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
                className={`px-6 py-2 rounded-md font-medium transition disabled:opacity-50 ${pendingAction === "approve"
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

      <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-hidden">
          <div className="w-full max-w-[28rem]">
            {(() => {
              const isAlreadyProcessed = userInfo &&
                (userInfo.approved_status === 'approved' || userInfo.approved_status === 'rejected' || userInfo.approved_status === 'reject');

              if (!completed) {
                return (
                  <>
                    <h2 className="text-[32px] font-black text-gray-700 mb-2 tracking-tighter">
                      Approval Request
                    </h2>
                    <p className="text-gray-500 mb-6">
                      {isAlreadyProcessed
                        ? "This user request has already been processed."
                        : "Review user details and proceed to approve or reject."}
                    </p>
                  </>
                );
              }
              return null;
            })()}

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
                    <span className="text-gray-600 font-medium">Organization:</span>
                    <span className="text-gray-800">{userInfo.company_name || '-'}</span>
                  </div>
                  {/* Show Department only for IVF/hospital users (not CGT/pharma) */}
                  {userInfo.department && userInfo.department.toUpperCase() !== 'CGT' && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">Department:</span>
                      <span className="text-gray-800">{userInfo.department}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 font-medium">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${userInfo.approved_status === 'pending'
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
                    <span className={`font-medium ${userInfo.status ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {userInfo.status ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons or Success Card */}
            <div className="bg-white rounded-lg">
              {(() => {
                // Check if user is already approved or rejected
                const isAlreadyProcessed = userInfo &&
                  (userInfo.approved_status === 'approved' || userInfo.approved_status === 'rejected' || userInfo.approved_status === 'reject');

                if (isAlreadyProcessed && !completed) {
                  return (
                    <div className="flex flex-col items-center">
                      <p className="text-center text-gray-600 font-medium">
                        This user request has already been processed. No further action is required.
                      </p>
                    </div>
                  );
                }

                if (!completed) {
                  return (
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
                  );
                }

                if (completed) {
                  return (
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
                      <button
                        type="button"
                        onClick={() => navigate("/approval")}
                        className="py-2 px-4 bg-[#F2E4FF] text-[#8b2a96] rounded-md font-medium hover:bg-[#E8D4F0] transition"
                      >
                        Go back to list
                      </button>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </div>
      </div>
    </>
  );
};

export default ApprovalScreen;

