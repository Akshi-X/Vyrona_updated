import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../../constants/colors';
import { feedbackApi, type UserTicketSummary } from '../../api/feedbackApi';
import { userService, type UserProfileDto } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Header';
import FilterPanel, { FilterSelect } from '../../components/FilterPanel';
 
 
interface Ticket {
  id: string;
  title: string;
  type: string;
  status: string; // Allow any status value from API
  submittedOn: string;
  submittedByName?: string;
  hospitalName?: string;
  branchName?: string;
}
 
const NAME_MAX = 80;
const FIRST_NAME_REGEX = /^[A-Za-z ,.'-]{1,80}$/; // allows letters, spaces, common punctuation for first name
const LAST_NAME_REGEX = /^[A-Za-z ,.'-]{1,80}$/; // allows letters, spaces, common punctuation for last name
const PHONE_REGEX = /^[+]?[\d\s\-().]{7,20}$/;
 
const UserProfilePage: React.FC = () => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberError, setPhoneNumberError] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState("");
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { logout, isEmailNotificationsEnabled, setIsEmailNotificationsEnabled, isAuthenticated, isLoading, token } = useAuth();
  const [isAuthChecked, setIsAuthChecked] = useState(false);
 
 
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState<boolean>(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedHospital, setSelectedHospital] = useState('All');
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [selectedSubmitter, setSelectedSubmitter] = useState('All');
 
  // Initialize name fields - removed hardcoded values, will be set by API call
 
  const getTokenFromCookie = (): string | null => {
    try {
      const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )auth_token=([^;]+)/) : null;
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  };
 
  const decodeJwtPayload = (token: string): any | null => {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch {
      return null;
    }
  };
 
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const resolveUserId = async (): Promise<string | null> => {
    // Prefer state first
    if (userId) return userId;
    // 1) localStorage
    try {
      const ls = typeof window !== 'undefined' ? (localStorage.getItem('user_id') || '') : '';
      if (ls) return ls;
    } catch {}
    // 2) decode JWT from cookie/localStorage
    const token = getTokenFromCookie() || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (token) {
      const payload = decodeJwtPayload(token);
      const candidate = payload?.user_id || payload?.sub || payload?.uid || null;
      if (candidate) {
        try { localStorage.setItem('user_id', candidate); } catch {}
        return candidate;
      }
    }
    // 3) fallback: attempt profile only if needed
    try {
      const profile = await userService.getProfile();
      const profileUserId = profile.user_id;
      if (profileUserId) {
        try { localStorage.setItem('user_id', profileUserId); } catch {}
        return profileUserId;
      }
    } catch {}
    return null;
  };
  /* eslint-enable @typescript-eslint/no-unused-vars */
 
  // Check authentication before rendering
  useEffect(() => {
    // Wait for auth context to finish loading
    if (isLoading) {
      return;
    }
 
    // If not authenticated, redirect immediately without showing content
    if (!isAuthenticated || !token) {
      navigate('/login', { replace: true });
      return;
    }
 
    // Mark auth as checked and allow rendering
    setIsAuthChecked(true);
  }, [isLoading, isAuthenticated, token, navigate]);
 
  // Load profile once on mount (only if authenticated)
  useEffect(() => {
    // Don't load profile if auth check hasn't passed
    if (!isAuthChecked || !isAuthenticated) {
      return;
    }
 
    let isMounted = true;
    (async () => {
      try {
        const profile: UserProfileDto = await userService.getProfile();
        if (!isMounted) return;
        setFirstName(profile.first_name || '');
        setLastName(profile.last_name || '');
        setWorkEmail(profile.email || '');
        setRole(profile.role || '');
        setUserId(profile.user_id || '');
        setPhoneNumber(profile.phone_number || '');
      } catch (error) {
        if (!isMounted) return;
        setFirstName('');
        setLastName('');
        setWorkEmail('');
        setRole('');
      }
    })();
    return () => { isMounted = false; };
  }, [isAuthChecked, isAuthenticated]);
 
  const isMygrapeAdmin = role?.toLowerCase() === 'mygrape_admin';

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(tickets.map((t) => t.status).filter(Boolean)));
    return ['All', ...values.sort()];
  }, [tickets]);

  const typeOptions = useMemo(() => {
    const values = Array.from(new Set(tickets.map((t) => t.type).filter(Boolean)));
    return ['All', ...values.sort()];
  }, [tickets]);

  const hospitalOptions = useMemo(() => {
    const values = Array.from(new Set(tickets.map((t) => t.hospitalName).filter(Boolean))) as string[];
    return ['All', ...values.sort()];
  }, [tickets]);

  const branchOptions = useMemo(() => {
    const values = Array.from(new Set(tickets.map((t) => t.branchName).filter(Boolean))) as string[];
    return ['All', ...values.sort()];
  }, [tickets]);

  const submitterOptions = useMemo(() => {
    const values = Array.from(new Set(tickets.map((t) => t.submittedByName).filter(Boolean))) as string[];
    return ['All', ...values.sort()];
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return tickets.filter((ticket) => {
      if (normalizedQuery) {
        const haystack = [
          ticket.id,
          ticket.title,
          ticket.type,
          ticket.status,
          ticket.submittedByName,
          ticket.hospitalName,
          ticket.branchName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }

      if (selectedStatus !== 'All' && ticket.status !== selectedStatus) return false;
      if (selectedType !== 'All' && ticket.type !== selectedType) return false;
      if (isMygrapeAdmin) {
        if (selectedHospital !== 'All' && ticket.hospitalName !== selectedHospital) return false;
        if (selectedBranch !== 'All' && ticket.branchName !== selectedBranch) return false;
        if (selectedSubmitter !== 'All' && ticket.submittedByName !== selectedSubmitter) return false;
      }

      return true;
    });
  }, [
    tickets,
    searchQuery,
    selectedStatus,
    selectedType,
    selectedHospital,
    selectedBranch,
    selectedSubmitter,
    isMygrapeAdmin,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (selectedStatus !== 'All') count += 1;
    if (selectedType !== 'All') count += 1;
    if (isMygrapeAdmin) {
      if (selectedHospital !== 'All') count += 1;
      if (selectedBranch !== 'All') count += 1;
      if (selectedSubmitter !== 'All') count += 1;
    }
    return count;
  }, [
    searchQuery,
    selectedStatus,
    selectedType,
    selectedHospital,
    selectedBranch,
    selectedSubmitter,
    isMygrapeAdmin,
  ]);

  // Load tickets when role is known
  useEffect(() => {
    if (!role) return; // wait until role is resolved
    let isMounted = true;
    (async () => {
      const uid = await resolveUserId();
      if (!isMounted) return;
      if (!uid) {
        setTicketsError('Not logged in');
        return;
      }
      setTicketsError(null);
      setLoadingTickets(true);
 
      const ticketPromise = isMygrapeAdmin
        ? feedbackApi.getAllFeedbackTickets()
        : feedbackApi.getUserTickets(uid);
 
      ticketPromise
        .then((data: UserTicketSummary[]) => {
          const mapped: Ticket[] = data.map((t) => ({
            id: t.feedback_id,
            title: t.feedback,
            type: t.type,
            status: t.status,
            submittedOn: new Date(t.submitted_on).toISOString().slice(0,10).replace(/-/g, '.'),
            submittedByName: t.submitted_by_name || undefined,
            hospitalName: t.hospital_name || undefined,
            branchName: t.branch_name || undefined,
          }));
          if (!isMounted) return;
          setTickets(mapped);
        })
        .catch((err) => {
          if (!isMounted) return;
          setTicketsError(err instanceof Error ? err.message : 'Failed to load tickets');
        })
        .finally(() => {
          if (!isMounted) return;
          setLoadingTickets(false);
        });
    })();
    return () => { isMounted = false; };
  }, [role, isMygrapeAdmin]);
 
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-100 text-blue-800';
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'Reopen':
        return 'bg-red-100 text-red-800';
      case 'CLOSED':
        return 'bg-green-100 text-green-800';
      case 'OPEN':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
 
  const validateFirstName = (firstName: string) => {
    const trimmed = firstName.trim();
    if (!trimmed) return 'First name is required';
    if (trimmed.length > NAME_MAX) return `First name must be ≤ ${NAME_MAX} characters`;
    if (trimmed.length < 1) return 'First name must be at least 1 character';
    if (!FIRST_NAME_REGEX.test(trimmed)) return 'Enter a valid first name (letters, spaces, , . \' - allowed)';
    return null;
  };
 
  const validateLastName = (lastName: string) => {
    const trimmed = lastName.trim();
    if (!trimmed) return 'Last name is required';
    if (trimmed.length > NAME_MAX) return `Last name must be ≤ ${NAME_MAX} characters`;
    if (trimmed.length < 1) return 'Last name must be at least 1 character';
    if (!LAST_NAME_REGEX.test(trimmed)) return 'Enter a valid last name (letters, spaces, , . \' - allowed)';
    return null;
  };

  const validatePhoneNumber = (phone: string) => {
    if (!phone || !phone.trim()) return null; // optional
    if (!PHONE_REGEX.test(phone.trim())) return 'Enter a valid phone number (digits, spaces, + - () allowed)';
    return null;
  };
 
  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };
 
  const handleSaveProfile = async () => {
    const firstNameErr = validateFirstName(firstName);
    const lastNameErr = validateLastName(lastName);
    const phoneErr = validatePhoneNumber(phoneNumber);
   
    if (firstNameErr) setFirstNameError(firstNameErr);
    if (lastNameErr) setLastNameError(lastNameErr);
    if (phoneErr) setPhoneNumberError(phoneErr);
   
    if (firstNameErr || lastNameErr || phoneErr) {
      return;
    }
   
    if (!userId) {
      setSaveError('User ID not available. Please refresh the page and try again.');
      return;
    }
   
    setIsSaving(true);
    setSaveError(null);
    setFirstNameError(null);
    setLastNameError(null);
    setPhoneNumberError(null);
   
    try {
      await userService.updateProfile(userId, {
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber.trim() || null,
      });
     
      // Success - exit edit mode
      setIsEditingProfile(false);
    } catch (error: any) {
      setSaveError(error.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
 
  const handleCancelEdit = async () => {
    setIsEditingProfile(false);
    // Reset to original values from API
    try {
      const profile: UserProfileDto = await userService.getProfile();
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setWorkEmail(profile.email || '');
      setPhoneNumber(profile.phone_number || '');
    } catch (error) {
      // Keep current values if API fails
    }
    setFirstNameError(null);
    setLastNameError(null);
  };
 
  const handleSubmitRequest = () => {
    navigate('/support', {
      state: {
        readonly: false,
        hideAttach: false,
        lockIdentity: true, // full name, email are non-editable on Support
        prefill: {
          fullName: `${firstName} ${lastName}`.trim(),
          workEmail: workEmail,
        }
      }
    });
  };
 
 
  const navigateToTicketPrefilled = (ticket: Ticket) => {
    navigate('/support', {
      state: {
        readonly: true,
        hideAttach: true,
        feedbackId: ticket.id,
        prefill: {
          fullName: `${firstName} ${lastName}`.trim(),
          workEmail: workEmail,
          feedbackType: ticket.type,
          subject: ticket.title,
          description: `Ticket ${ticket.id} reported on ${ticket.submittedOn.replace(/\./g, '-')}`,
          priority: 'Medium',
          status: ticket.status // Use the actual status from API
        }
      }
    });
  };
 
  const handleLogout = () => {
    logout();
    navigate('/login');
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
 
  // Don't render anything until auth is verified
  // This prevents the UI flicker when redirecting to login
  if (isLoading || !isAuthChecked || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="User Profile"
        showBackButton={role?.toLowerCase() !== 'mygrape_admin'}
        onBackClick={handleBackNavigation}
        rightContent={
          (role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'mygrape_admin') ? (
            <button
              onClick={handleLogout}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-md transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: COLORS.primary.purple }}
              title="Logout"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          ) : undefined
        }
      />
 
      <div className="pt-[calc(63px+1rem)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-8">
 
        {/* Basic Information Section */}
        <div id="onboarding-profile-basic-info" className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">Basic Information</h2>
            {!isEditingProfile ? (
              <button
                onClick={handleEditProfile}
                className="inline-flex items-center px-4 py-2 border border-[#6b1176] text-[#6b1176] rounded-lg hover:bg-[#6b1176]/10 transition-colors duration-200 bg-white"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 bg-[#6b1176] text-white rounded-lg hover:bg-[#8a2a95] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 border border-gray-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
 
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-bold text-black mb-2">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => {
                  const value = e.target.value;
                  setFirstName(value);
                  // Clear error if user starts typing
                  if (firstNameError) setFirstNameError(null);
                  // Real-time validation
                  if (value.trim()) {
                    const error = validateFirstName(value);
                    if (error) setFirstNameError(error);
                  }
                }}
                maxLength={NAME_MAX}
                disabled={!isEditingProfile}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  isEditingProfile
                    ? firstNameError
                      ? 'border-red-500 bg-white text-gray-900 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                    : 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                }`}
                placeholder="Enter your first name"
              />
              {firstNameError && (<p className="mt-1 text-xs text-red-600">{firstNameError}</p>)}
            </div>
            <div>
              <label className="block text-sm font-bold text-black mb-2">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => {
                  const value = e.target.value;
                  setLastName(value);
                  // Clear error if user starts typing
                  if (lastNameError) setLastNameError(null);
                  // Real-time validation
                  if (value.trim()) {
                    const error = validateLastName(value);
                    if (error) setLastNameError(error);
                  }
                }}
                maxLength={NAME_MAX}
                disabled={!isEditingProfile}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  isEditingProfile
                    ? lastNameError
                      ? 'border-red-500 bg-white text-gray-900 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                    : 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                }`}
                placeholder="Enter your last name"
              />
              {lastNameError && (<p className="mt-1 text-xs text-red-600">{lastNameError}</p>)}
            </div>
            <div>
              <label className="block text-sm font-bold text-black mb-2">Email Address</label>
              <input
                type="email"
                value={workEmail}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-black mb-2">Role</label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700">
                {role || 'User'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-black mb-2">
                Phone Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value;
                  setPhoneNumber(value);
                  if (phoneNumberError) setPhoneNumberError(null);
                  if (value.trim()) {
                    const err = validatePhoneNumber(value);
                    if (err) setPhoneNumberError(err);
                  }
                }}
                maxLength={20}
                disabled={!isEditingProfile}
                placeholder="e.g. +91 98765 43210"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  isEditingProfile
                    ? phoneNumberError
                      ? 'border-red-500 bg-white text-gray-900 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                    : 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                }`}
              />
              {phoneNumberError && (<p className="mt-1 text-xs text-red-600">{phoneNumberError}</p>)}
            </div>
          </div>
         
          {/* Error Display */}
          {saveError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <div className="shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{saveError}</p>
                </div>
              </div>
            </div>
          )}
        </div>
 
        {/* Support Activity Section */}
        <div id="onboarding-profile-support-activity" className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">Support Activity</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSubmitRequest}
                className="px-4 py-3 bg-[#6b1176] text-white rounded-lg hover:bg-[#8a2a95] transition-colors duration-200"
              >
                Submit New Request
              </button>
              <div className="md:hidden">
                <FilterPanel activeCount={activeFilterCount}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tickets"
                      className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                    />
                  </div>
                  <FilterSelect
                    label="Status"
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                    options={statusOptions}
                    allLabel="All Status"
                  />
                  <FilterSelect
                    label="Type"
                    value={selectedType}
                    onChange={setSelectedType}
                    options={typeOptions}
                    allLabel="All Types"
                  />
                  {isMygrapeAdmin && (
                    <FilterSelect
                      label="Submitted By"
                      value={selectedSubmitter}
                      onChange={setSelectedSubmitter}
                      options={submitterOptions}
                      allLabel="All Submitters"
                    />
                  )}
                  {isMygrapeAdmin && (
                    <FilterSelect
                      label="Hospital"
                      value={selectedHospital}
                      onChange={setSelectedHospital}
                      options={hospitalOptions}
                      allLabel="All Hospitals"
                    />
                  )}
                  {isMygrapeAdmin && (
                    <FilterSelect
                      label="Branch"
                      value={selectedBranch}
                      onChange={setSelectedBranch}
                      options={branchOptions}
                      allLabel="All Branches"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedStatus('All');
                      setSelectedType('All');
                      setSelectedHospital('All');
                      setSelectedBranch('All');
                      setSelectedSubmitter('All');
                    }}
                    className="mt-1 w-full px-3 h-11 rounded-lg text-sm font-medium text-[#6b1176] border border-[#6b1176] hover:bg-[#6b1176]/10"
                  >
                    Clear filters
                  </button>
                </FilterPanel>
              </div>
            </div>
          </div>
 
          <div>
            <div className="flex items-center justify-between mb-4 pl-2">
              <h3 className="text-lg font-bold text-gray-700">
                {isMygrapeAdmin
                  ? 'All Tickets & Feedback'
                  : 'My Tickets & Feedback'
                }
              </h3>
              <div className="flex items-center gap-2">
                {isMygrapeAdmin && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" clipRule="evenodd" />
                    </svg>
                    Admin View
                  </span>
                )}
                <div className="hidden md:flex">
                  <FilterPanel activeCount={activeFilterCount}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Search
                      </label>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tickets"
                        className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                      />
                    </div>
                    <FilterSelect
                      label="Status"
                      value={selectedStatus}
                      onChange={setSelectedStatus}
                      options={statusOptions}
                      allLabel="All Status"
                    />
                    <FilterSelect
                      label="Type"
                      value={selectedType}
                      onChange={setSelectedType}
                      options={typeOptions}
                      allLabel="All Types"
                    />
                    {isMygrapeAdmin && (
                      <FilterSelect
                        label="Submitted By"
                        value={selectedSubmitter}
                        onChange={setSelectedSubmitter}
                        options={submitterOptions}
                        allLabel="All Submitters"
                      />
                    )}
                    {isMygrapeAdmin && (
                      <FilterSelect
                        label="Hospital"
                        value={selectedHospital}
                        onChange={setSelectedHospital}
                        options={hospitalOptions}
                        allLabel="All Hospitals"
                      />
                    )}
                    {isMygrapeAdmin && (
                      <FilterSelect
                        label="Branch"
                        value={selectedBranch}
                        onChange={setSelectedBranch}
                        options={branchOptions}
                        allLabel="All Branches"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedStatus('All');
                        setSelectedType('All');
                        setSelectedHospital('All');
                        setSelectedBranch('All');
                        setSelectedSubmitter('All');
                      }}
                      className="mt-1 w-full px-3 h-11 rounded-lg text-sm font-medium text-[#6b1176] border border-[#6b1176] hover:bg-[#6b1176]/10"
                    >
                      Clear filters
                    </button>
                  </FilterPanel>
                </div>
              </div>
            </div>
            <div className="w-full bg-white rounded-[10px] overflow-hidden border border-[#E7E1E1]">
              <div
                className="max-h-[415px] overflow-y-auto"
                style={{
                  scrollbarWidth: 'thin'
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
                      {isMygrapeAdmin && (
                        <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                          Submitted By / Hospital / Branch
                        </th>
                      )}
                      <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                        Type
                      </th>
                      <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTickets ? (
                      <tr>
                        <td
                          colSpan={isMygrapeAdmin ? 5 : 4}
                          className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center"
                        >
                          Loading tickets...
                        </td>
                      </tr>
                    ) : ticketsError ? (
                      <tr>
                        <td
                          colSpan={isMygrapeAdmin ? 5 : 4}
                          className="bg-white p-[15px] font-normal text-red-600 text-sm text-center"
                        >
                          {ticketsError}
                        </td>
                      </tr>
                    ) : filteredTickets.length === 0 ? (
                      <tr>
                        <td
                          colSpan={isMygrapeAdmin ? 5 : 4}
                          className="bg-white p-[15px] font-normal text-[#333333] text-sm text-center"
                        >
                          No tickets found.
                        </td>
                      </tr>
                    ) : (
                      filteredTickets.map((ticket) => (
                        <tr
                          key={ticket.id}
                          className="border-b border-[#eeeeee] hover:bg-white/50 cursor-pointer"
                          onClick={() => navigateToTicketPrefilled(ticket)}
                        >
                          <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
                            <span
                              className="font-medium"
                              style={{ color: COLORS.primary.purpleDark }}
                            >
                              {ticket.id}
                            </span>
                          </td>
                          <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                            <div className="flex flex-col gap-1">
                              <div className="truncate wrap-break-word max-w-60" title={ticket.title}>
                                {ticket.title}
                              </div>
                              <span className="text-xs text-gray-500">
                                {ticket.submittedOn.replace(/\./g, '-')}
                              </span>
                            </div>
                          </td>
                          {isMygrapeAdmin && (
                            <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">
                                  {ticket.submittedByName || '—'}
                                </span>
                                <span className="text-xs text-gray-600">
                                  {ticket.hospitalName || '—'}
                                  {ticket.branchName ? ` • ${ticket.branchName}` : ''}
                                </span>
                              </div>
                            </td>
                          )}
                          <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
                            {ticket.type}
                          </td>
                          <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(ticket.status)}`}>
                              {ticket.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
 
        {/* Notifications Section */}
        <div id="onboarding-profile-notifications" className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Notifications</h2>
         
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">Email me when my ticket is updated</h3>
                <p className="text-sm text-gray-500 mt-1">Get notifications about ticket status changes</p>
              </div>
              <button
                onClick={() => setIsEmailNotificationsEnabled(!isEmailNotificationsEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  isEmailNotificationsEnabled ? 'bg-[#6b1176]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    isEmailNotificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
 
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900">Include me in myGrape feature update emails</h3>
                <p className="text-sm text-gray-500 mt-1">Stay informed about new features and improvements</p>
                <p className="text-xs text-gray-400 mt-1">Coming soon</p>
              </div>
              <button
                disabled
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none bg-gray-200 cursor-not-allowed opacity-50"
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 translate-x-1"
                />
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
