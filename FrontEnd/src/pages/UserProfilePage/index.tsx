import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../../constants/colors';
import { feedbackApi, type UserTicketSummary } from '../../api/feedbackApi';
import { userService, type UserProfileDto } from '../../services/userService';
import Header from '../../components/Header';

interface Ticket {
  id: string;
  title: string;
  type: string;
  status: 'In Progress' | 'Completed' | 'Under Review';
  submittedOn: string;
}

const NAME_MAX = 80;
const NAME_REGEX = /^[A-Za-z ,.'-]{2,80}$/; // allows letters, spaces, common punctuation

const UserProfilePage: React.FC = () => {
  const [isEmailNotificationsEnabled, setIsEmailNotificationsEnabled] = useState(true);
  const [isFeatureUpdatesEnabled, setIsFeatureUpdatesEnabled] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState("");
  const [, setRole] = useState(" ");
  const navigate = useNavigate();


  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState<boolean>(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  useEffect(() => {
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
      // 3) call profile endpoint as fallback
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

    let isMounted = true;
    (async () => {
      // Load profile first to populate header fields
      try {
        const profile: UserProfileDto = await userService.getProfile();
        const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
        setFullName(name || '');
        setWorkEmail(profile.email || '');
        setRole(profile.role || '');
      } catch (error) {
        // Set default values if profile fails to load
        setFullName('User');
        setWorkEmail('user@example.com');
        setRole('User');
      }

      // Require authenticated user_id again
      const userId = await resolveUserId();
      if (!isMounted) return;
      if (!userId) {
        setTicketsError('Not logged in');
        return;
      }
      setTicketsError(null);
      setLoadingTickets(true);
      feedbackApi
        .getUserTickets(userId)
        .then((data: UserTicketSummary[]) => {
          const mapped: Ticket[] = data.map((t) => ({
            id: t.feedback_id,
            title: t.feedback,
            type: t.type,
            status: t.status === 'OPEN' ? 'In Progress' : (t.status === 'CLOSED' ? 'Completed' : 'Under Review'),
            submittedOn: new Date(t.submitted_on).toISOString().slice(0,10).replace(/-/g, '.'),
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
  }, []);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'In Progress':
        return 'bg-blue-100 text-blue-800';
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'Under Review':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const validateName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Full name is required';
    if (trimmed.length > NAME_MAX) return `Full name must be ≤ ${NAME_MAX} characters`;
    if (!NAME_REGEX.test(trimmed)) return 'Enter a valid name (letters, spaces, , . \" \- allowed)';
    return null;
  };

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleSaveProfile = () => {
    const err = validateName(fullName);
    if (err) {
      setFullNameError(err);
      return;
    }
    setFullNameError(null);
    setIsEditingProfile(false);
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    setFullName("Dr. Sarah Johnson");
    setWorkEmail("jothikaraj272001@gmail.com");
    setFullNameError(null);
  };

  const handleSubmitRequest = () => {
    navigate('/support', {
      state: {
        readonly: false,
        hideAttach: false,
        lockIdentity: true, // full name, email are non-editable on Support
        prefill: {
          fullName: fullName,
          workEmail: workEmail,
        }
      }
    });
  };


  const navigateToTicketPrefilled = (ticket: Ticket) => {
    const mapStatus = (s: string) => {
      if (s === 'In Progress') return 'Created';
      if (s === 'Completed') return 'Completed';
      return 'Under Review';
    };
    navigate('/support', {
      state: {
        readonly: true,
        hideAttach: true,
        feedbackId: ticket.id,
        prefill: {
          fullName: fullName,
          workEmail: 'jothikaraj272001@gmail.com',
          feedbackType: ticket.type,
          subject: ticket.title,
          description: `Ticket ${ticket.id} reported on ${ticket.submittedOn.replace(/\./g, '-')}`,
          priority: 'Medium',
          status: mapStatus(ticket.status)
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="User Profile" />

      <div className="p-4 sm:p-6 lg:p-8 pt-20">
        <div className="max-w-4xl mx-auto space-y-6">

        {/* Basic Information Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 sm:mb-0">Basic Information</h2>
            {!isEditingProfile ? (
              <button
                onClick={handleEditProfile}
                className="inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors duration-200 bg-white"
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
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-black mb-2">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fullNameError) setFullNameError(null);
                }}
                maxLength={NAME_MAX}
                disabled={!isEditingProfile}
                className={`w-full px-3 py-2 border rounded-lg ${
                  isEditingProfile 
                    ? 'border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500' 
                    : 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                }`}
              />
              {fullNameError && (<p className="mt-1 text-xs text-red-600">{fullNameError}</p>)}
            </div>
            <div>
              <label className="block text-sm font-bold text-black mb-2">Email Address</label>
              <input
                type="email"
                value="jothikaraj272001@gmail.com"
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-black mb-2">Role</label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700">
                Manager
              </div>
            </div>
          </div>
        </div>

        {/* Support Activity Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 sm:mb-0">Support Activity</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSubmitRequest}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                Submit New Request
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <h3 className="text-lg font-medium text-gray-700 mb-4 pl-2">My Tickets & Feedback</h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black">
                    Ticket ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black">
                    Submitted On
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href="#"
                        className="font-medium hover:opacity-80"
                        style={{ color: COLORS.primary.purpleDark }}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateToTicketPrefilled(ticket);
                        }}
                      >
                        {ticket.id}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {ticket.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {ticket.submittedOn.replace(/\./g, '-')}
                    </td>
                  </tr>
                ))}
                {(!loadingTickets && tickets.length === 0 && !ticketsError) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-sm text-gray-500">No tickets found.</td>
                  </tr>
                )}
                {ticketsError && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-sm text-red-600">{ticketsError}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {loadingTickets && (
              <div className="px-6 py-3 text-sm text-gray-500">Loading tickets...</div>
            )}
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Notifications</h2>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-900">Email me when my ticket is updated</h3>
                <p className="text-sm text-gray-500 mt-1">Get notifications about ticket status changes</p>
              </div>
              <button
                onClick={() => setIsEmailNotificationsEnabled(!isEmailNotificationsEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  isEmailNotificationsEnabled ? 'bg-blue-600' : 'bg-gray-200'
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
                <h3 className="text-sm font-medium text-gray-900">Include me in Grape feature update emails</h3>
                <p className="text-sm text-gray-500 mt-1">Stay informed about new features and improvements</p>
              </div>
              <button
                onClick={() => setIsFeatureUpdatesEnabled(!isFeatureUpdatesEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  isFeatureUpdatesEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    isFeatureUpdatesEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;
