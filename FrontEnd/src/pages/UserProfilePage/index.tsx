import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COLORS } from "../../constants/colors";
import { feedbackApi, type UserTicketSummary } from "../../api/feedbackApi";
import { userService, type UserProfileDto } from "../../services/userService";
import { useAuth } from "../../contexts/AuthContext";
import Header from "../../components/Header";

interface Ticket {
  id: string;
  title: string;
  type: string;
  status: string;
  submittedOn: string;
}

const NAME_MAX = 80;
const FIRST_NAME_REGEX = /^[A-Za-z ,.'-]{1,80}$/;
const LAST_NAME_REGEX = /^[A-Za-z ,.'-]{1,80}$/;

// Helper to get token from cookie
const getTokenFromCookie = (): string | null => {
  try {
    const match =
      typeof document !== "undefined"
        ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/)
        : null;
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

// Helper to decode JWT payload
const decodeJwtPayload = (token: string): any | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

// Helper to get user ID from JWT payload
const getUserIdFromPayload = (payload: any): string | null => {
  return payload?.user_id || payload?.sub || payload?.uid || null;
};

// Helper to get user ID from localStorage
const getUserIdFromStorage = (): string | null => {
  try {
    return typeof window !== "undefined"
      ? localStorage.getItem("user_id") || ""
      : "";
  } catch {
    return null;
  }
};

// Helper to save user ID to localStorage
const saveUserIdToStorage = (userId: string): void => {
  try {
    localStorage.setItem("user_id", userId);
  } catch {
    // Silently handle storage errors
  }
};

// Helper to resolve user ID
const resolveUserIdFromToken = async (): Promise<string | null> => {
  const token =
    getTokenFromCookie() ||
    (typeof window !== "undefined" ? localStorage.getItem("token") : null);
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  const candidate = getUserIdFromPayload(payload);
  if (candidate) {
    saveUserIdToStorage(candidate);
    return candidate;
  }
  return null;
};

// Helper to resolve user ID from profile
const resolveUserIdFromProfile = async (): Promise<string | null> => {
  try {
    const profile = await userService.getProfile();
    const profileUserId = profile.user_id;
    if (profileUserId) {
      saveUserIdToStorage(profileUserId);
      return profileUserId;
    }
  } catch {
    // Silently handle errors
  }
  return null;
};

// Helper to resolve user ID with fallbacks
const resolveUserId = async (currentUserId: string): Promise<string | null> => {
  if (currentUserId) return currentUserId;

  const storedId = getUserIdFromStorage();
  if (storedId) return storedId;

  const tokenId = await resolveUserIdFromToken();
  if (tokenId) return tokenId;

  return await resolveUserIdFromProfile();
};

// Helper to transform ticket
const transformTicket = (t: UserTicketSummary): Ticket => ({
  id: t.feedback_id,
  title: t.feedback,
  type: t.type,
  status: t.status,
  submittedOn: new Date(t.submitted_on)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "."),
});

// Helper to check if user is admin
const isAdmin = (role: string | undefined): boolean => {
  if (!role) return false;
  const roleLower = role.toLowerCase();
  return roleLower === "admin" || roleLower === "mygrape_admin";
};

// Helper to get status badge color
const getStatusBadgeColor = (status: string): string => {
  const statusMap: Record<string, string> = {
    Open: "bg-blue-100 text-blue-800",
    OPEN: "bg-blue-100 text-blue-800",
    "In Progress": "bg-yellow-100 text-yellow-800",
    Completed: "bg-green-100 text-green-800",
    CLOSED: "bg-green-100 text-green-800",
    Reopen: "bg-red-100 text-red-800",
  };
  return statusMap[status] || "bg-gray-100 text-gray-800";
};

// Helper to validate first name
const validateFirstName = (firstName: string): string | null => {
  const trimmed = firstName.trim();
  if (!trimmed) return "First name is required";
  if (trimmed.length > NAME_MAX)
    return `First name must be ≤ ${NAME_MAX} characters`;
  if (trimmed.length < 1) return "First name must be at least 1 character";
  if (!FIRST_NAME_REGEX.test(trimmed))
    return "Enter a valid first name (letters, spaces, , . ' - allowed)";
  return null;
};

// Helper to validate last name
const validateLastName = (lastName: string): string | null => {
  const trimmed = lastName.trim();
  if (!trimmed) return "Last name is required";
  if (trimmed.length > NAME_MAX)
    return `Last name must be ≤ ${NAME_MAX} characters`;
  if (trimmed.length < 1) return "Last name must be at least 1 character";
  if (!LAST_NAME_REGEX.test(trimmed))
    return "Enter a valid last name (letters, spaces, , . ' - allowed)";
  return null;
};

// Helper to create support navigation state
const createSupportState = (
  readonly: boolean,
  hideAttach: boolean,
  lockIdentity: boolean,
  fullName: string,
  workEmail: string,
  feedbackId?: string,
  ticket?: Ticket
) => {
  const state: any = {
    readonly,
    hideAttach,
    lockIdentity,
    prefill: {
      fullName,
      workEmail,
    },
  };

  if (feedbackId) {
    state.feedbackId = feedbackId;
  }

  if (ticket) {
    state.prefill = {
      ...state.prefill,
      feedbackType: ticket.type,
      subject: ticket.title,
      description: `Ticket ${
        ticket.id
      } reported on ${ticket.submittedOn.replace(/\./g, "-")}`,
      priority: "Medium",
      status: ticket.status,
    };
  }

  return state;
};

// Form Field Component
interface FormFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  disabled: boolean;
  placeholder: string;
  maxLength: number;
  validate: (value: string) => string | null;
  onErrorChange: (error: string | null) => void;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  error,
  disabled,
  placeholder,
  maxLength,
  validate,
  onErrorChange,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(e);
    if (error) onErrorChange(null);
    if (newValue.trim()) {
      const validationError = validate(newValue);
      if (validationError) onErrorChange(validationError);
    }
  };

  const getInputClassName = (): string => {
    if (disabled) {
      return "w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed";
    }
    if (error) {
      return "w-full px-3 py-2 border border-red-500 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500";
    }
    return "w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8b2a96]";
  };

  return (
    <div>
      <label className="block text-sm font-bold text-black mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        disabled={disabled}
        className={getInputClassName()}
        placeholder={placeholder}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

// Profile Actions Component
interface ProfileActionsProps {
  isEditingProfile: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const ProfileActions: React.FC<ProfileActionsProps> = ({
  isEditingProfile,
  isSaving,
  onEdit,
  onSave,
  onCancel,
}) => {
  if (!isEditingProfile) {
    return (
      <button
        onClick={onEdit}
        className="inline-flex items-center px-4 py-2 border border-[#6b1176] text-[#6b1176] rounded-lg hover:bg-[#6b1176]/10 transition-colors duration-200 bg-white"
      >
        <svg
          className="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        Edit Profile
      </button>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={onSave}
        disabled={isSaving}
        className="inline-flex items-center px-4 py-2 bg-[#6b1176] text-white rounded-lg hover:bg-[#8a2a95] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Saving...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Save
          </>
        )}
      </button>
      <button
        onClick={onCancel}
        className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 border border-gray-300"
      >
        Cancel
      </button>
    </div>
  );
};

// Ticket Row Component
interface TicketRowProps {
  ticket: Ticket;
  onNavigate: (ticket: Ticket) => void;
}

const TicketRow: React.FC<TicketRowProps> = ({ ticket, onNavigate }) => {
  return (
    <tr className="border-b border-[#eeeeee] hover:bg-white/50">
      <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
        <a
          href="#"
          className="font-medium hover:opacity-80"
          style={{ color: COLORS.primary.purpleDark }}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(ticket);
          }}
        >
          {ticket.id}
        </a>
      </td>
      <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
        <div className="truncate break-words max-w-[220px]">{ticket.title}</div>
      </td>
      <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
        {ticket.type}
      </td>
      <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
        <span
          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(
            ticket.status
          )}`}
        >
          {ticket.status}
        </span>
      </td>
      <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
        {ticket.submittedOn.replace(/\./g, "-")}
      </td>
    </tr>
  );
};

// Tickets Table Component
interface TicketsTableProps {
  tickets: Ticket[];
  loadingTickets: boolean;
  ticketsError: string | null;
  role: string | undefined;
  onNavigateToTicket: (ticket: Ticket) => void;
}

const TicketsTable: React.FC<TicketsTableProps> = ({
  tickets,
  loadingTickets,
  ticketsError,
  role,
  onNavigateToTicket,
}) => {
  const isAdminRole = isAdmin(role);
  const hasTickets = tickets.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 pl-2">
        <h3 className="text-lg font-medium text-gray-700">
          {isAdminRole ? "All Tickets & Feedback" : "My Tickets & Feedback"}
        </h3>
        {isAdminRole && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <svg
              className="w-3 h-3 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                clipRule="evenodd"
              />
            </svg>
            Admin View
          </span>
        )}
      </div>
      <div className="w-full bg-white rounded-[10px] overflow-hidden border border-[#E7E1E1]">
        <div
          className="max-h-[415px] overflow-y-auto"
          style={{
            scrollbarWidth: "thin",
          }}
        >
          <table className="w-full">
            <thead className="sticky top-0 bg-[#fdeeff] z-10">
              <tr className="border-b border-[#eeeeee]">
                <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                  Ticket ID
                </th>
                <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                  Title
                </th>
                <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                  Type
                </th>
                <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                  Status
                </th>
                <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                  Submitted On
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingTickets ? (
                <tr>
                  <td
                    colSpan={5}
                    className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center"
                  >
                    Loading tickets...
                  </td>
                </tr>
              ) : ticketsError ? (
                <tr>
                  <td
                    colSpan={5}
                    className="bg-white p-[15px] font-normal text-red-600 text-sm text-center"
                  >
                    {ticketsError}
                  </td>
                </tr>
              ) : !hasTickets ? (
                <tr>
                  <td
                    colSpan={5}
                    className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center"
                  >
                    No tickets found.
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    onNavigate={onNavigateToTicket}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Support Activity Section Component
interface SupportActivitySectionProps {
  role: string | undefined;
  firstName: string;
  lastName: string;
  workEmail: string;
  tickets: Ticket[];
  loadingTickets: boolean;
  ticketsError: string | null;
  onSubmitRequest: () => void;
  onNavigateToTicket: (ticket: Ticket) => void;
}

const SupportActivitySection: React.FC<SupportActivitySectionProps> = ({
  role,
  firstName,
  lastName,
  workEmail,
  tickets,
  loadingTickets,
  ticketsError,
  onSubmitRequest,
  onNavigateToTicket,
}) => {
  const isAdminRole = isAdmin(role);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">
          Support Activity
        </h2>
        {isAdminRole ? (
          <div className="text-sm text-gray-500 italic">
            Admin view - Viewing all system tickets
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onSubmitRequest}
              className="px-4 py-2 bg-[#6b1176] text-white rounded-lg hover:bg-[#8a2a95] transition-colors duration-200"
            >
              Submit New Request
            </button>
          </div>
        )}
      </div>
      <TicketsTable
        tickets={tickets}
        loadingTickets={loadingTickets}
        ticketsError={ticketsError}
        role={role}
        onNavigateToTicket={onNavigateToTicket}
      />
    </div>
  );
};

const UserProfilePage: React.FC = () => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState("");
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();
  const {
    logout,
    isEmailNotificationsEnabled,
    setIsEmailNotificationsEnabled,
    isAuthenticated,
    isLoading,
    token,
  } = useAuth();
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState<boolean>(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || !token) {
        navigate("/login", { replace: true });
      } else {
        setIsAuthChecked(true);
      }
    }
  }, [isLoading, isAuthenticated, token, navigate]);

  const loadProfile = async (isMounted: boolean): Promise<void> => {
    try {
      const profile: UserProfileDto = await userService.getProfile();
      if (!isMounted) {
        return;
      }
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setWorkEmail(profile.email || "");
      setRole(profile.role || "");
      setUserId(profile.user_id || "");
    } catch (error) {
      if (!isMounted) {
        return;
      }
      setFirstName("");
      setLastName("");
      setWorkEmail("");
      setRole("");
    }
  };

  useEffect(() => {
    if (isAuthChecked && isAuthenticated) {
      let isMounted = true;
      loadProfile(isMounted);
      return () => {
        isMounted = false;
      };
    }
  }, [isAuthChecked, isAuthenticated]);

  const loadTickets = async (
    isMounted: boolean,
    userRole: string,
    currentUserId: string
  ): Promise<void> => {
    const uid = await resolveUserId(currentUserId);
    if (!isMounted) {
      return;
    }
    if (!uid) {
      setTicketsError("Not logged in");
      return;
    }

    setTicketsError(null);
    setLoadingTickets(true);

    try {
      const isAdminRole = isAdmin(userRole);
      const ticketPromise = isAdminRole
        ? feedbackApi.getAllFeedbackTickets()
        : feedbackApi.getUserTickets(uid);

      const data: UserTicketSummary[] = await ticketPromise;
      const mapped: Ticket[] = data.map(transformTicket);

      if (!isMounted) {
        return;
      }
      setTickets(mapped);
    } catch (err) {
      if (!isMounted) {
        return;
      }
      setTicketsError(
        err instanceof Error ? err.message : "Failed to load tickets"
      );
    } finally {
      if (isMounted) {
        setLoadingTickets(false);
      }
    }
  };

  useEffect(() => {
    if (role) {
      let isMounted = true;
      loadTickets(isMounted, role, userId);
      return () => {
        isMounted = false;
      };
    }
  }, [role, userId]);

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    const firstNameErr = validateFirstName(firstName);
    const lastNameErr = validateLastName(lastName);

    if (firstNameErr) setFirstNameError(firstNameErr);
    if (lastNameErr) setLastNameError(lastNameErr);
    if (firstNameErr || lastNameErr) return;

    if (!userId) {
      setSaveError(
        "User ID not available. Please refresh the page and try again."
      );
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setFirstNameError(null);
    setLastNameError(null);

    try {
      await userService.updateProfile(userId, {
        first_name: firstName,
        last_name: lastName,
      });
      setIsEditingProfile(false);
    } catch (error: any) {
      setSaveError(
        error.message || "Failed to update profile. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    setIsEditingProfile(false);
    try {
      const profile: UserProfileDto = await userService.getProfile();
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setWorkEmail(profile.email || "");
    } catch (error) {
      // Keep current values if API fails
    }
    setFirstNameError(null);
    setLastNameError(null);
  };

  const handleSubmitRequest = () => {
    const fullName = `${firstName} ${lastName}`.trim();
    navigate("/support", {
      state: createSupportState(false, false, true, fullName, workEmail),
    });
  };

  const navigateToTicketPrefilled = (ticket: Ticket) => {
    const fullName = `${firstName} ${lastName}`.trim();
    navigate("/support", {
      state: createSupportState(
        true,
        true,
        false,
        fullName,
        workEmail,
        ticket.id,
        ticket
      ),
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleBackNavigation = () => {
    // Check if we came from within the app (same origin)
    const referrer = document.referrer;
    const currentOrigin = window.location.origin;
    const cameFromApp = referrer && referrer.startsWith(currentOrigin);
    
    if (cameFromApp && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  if (isLoading || !isAuthChecked || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const isAdminRole = isAdmin(role);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="User Profile"
        showBackButton={!isAdminRole}
        onBackClick={handleBackNavigation}
        rightContent={
          isAdminRole ? (
            <button
              onClick={handleLogout}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-md transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: COLORS.primary.purple }}
              title="Logout"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Logout
            </button>
          ) : undefined
        }
      />

      <div className="pt-[calc(63px+1rem)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">
                  Basic Information
                </h2>
                <ProfileActions
                  isEditingProfile={isEditingProfile}
                  isSaving={isSaving}
                  onEdit={handleEditProfile}
                  onSave={handleSaveProfile}
                  onCancel={handleCancelEdit}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  error={firstNameError}
                  disabled={!isEditingProfile}
                  placeholder="Enter your first name"
                  maxLength={NAME_MAX}
                  validate={validateFirstName}
                  onErrorChange={setFirstNameError}
                />
                <FormField
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  error={lastNameError}
                  disabled={!isEditingProfile}
                  placeholder="Enter your last name"
                  maxLength={NAME_MAX}
                  validate={validateLastName}
                  onErrorChange={setLastNameError}
                />
                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={workEmail}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Role
                  </label>
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700">
                    {role || "User"}
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-red-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-800">{saveError}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <SupportActivitySection
              role={role}
              firstName={firstName}
              lastName={lastName}
              workEmail={workEmail}
              tickets={tickets}
              loadingTickets={loadingTickets}
              ticketsError={ticketsError}
              onSubmitRequest={handleSubmitRequest}
              onNavigateToTicket={navigateToTicketPrefilled}
            />

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-8">
                Notifications
              </h2>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">
                      Email me when my ticket is updated
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Get notifications about ticket status changes
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setIsEmailNotificationsEnabled(
                        !isEmailNotificationsEnabled
                      )
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                      isEmailNotificationsEnabled
                        ? "bg-[#6b1176]"
                        : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                        isEmailNotificationsEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">
                      Include me in myGrape feature update emails
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Stay informed about new features and improvements
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Coming soon</p>
                  </div>
                  <button
                    disabled
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none bg-gray-200 cursor-not-allowed opacity-50"
                  >
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 translate-x-1" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;
