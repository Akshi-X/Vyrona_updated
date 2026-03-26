import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { OngoingTreatments } from '../../components/OngoingTreatments';
import { IVFOngoingTreatments } from '../../components/IVFOngoingTreatments';
import { CurveBar } from '../../components/CurveBar';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import QualityDeviationChart from '../../components/QualityDeviationChart';
import { patientService } from '../../services/patientService';
import TrackShipmentModal from '../../components/TrackShipmentModal';
import TrackCanisterModal from '../../components/TrackCanisterModal';
import { criticalAlertsService, type CriticalAlert as ServiceCriticalAlert } from '../../services/criticalAlertsService';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { logisticsService, type PatientStatistics, type LogisticsMetrics } from '../../services/logisticsService';
import { performanceService, type AvgQualityDeviationsResponse, type OnTimePercentageResponse, type AvgLeadTimeResponse, type SuccessRateResponse } from '../../services/performanceService';
import { riskService, type RiskMetrics } from '../../services/riskService';
import { complianceService, type ComplianceMetrics } from '../../services/complianceService';
import { chatService, type UnreadMessageResponse } from '../../services/chatService';
import { userService } from '../../services/userService';
import { useDashboardChatWebSocket } from '../../hooks/useChatWebSocket';
// Dashboard Icons
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import TreatmentsCountIcon from '../../assets/DashBoardIcons/Treatments_Count.svg';
import PatientCountIcon from '../../assets/DashBoardIcons/Patient_Count.svg';
import TrackingShipmentIcon from '../../assets/DashBoardIcons/TrackShipment.svg';
import AftercareIcon from '../../assets/DashBoardIcons/AfterCare.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import RiskIcon from '../../assets/DashBoardIcons/Risk.svg';
import ComplianceIcon from '../../assets/DashBoardIcons/Compliance.svg';
import LogisticsChainIcon from '../../assets/DashBoardIcons/Logistics_Chain.svg';
import LogisticsQualityIcon from '../../assets/DashBoardIcons/Logistics_Quality.svg';
import FailuresIcon from '../../assets/DashBoardIcons/Failure.svg';
import NextIcon from '../../assets/DashBoardIcons/NextIcon.svg';
// IVF Icons
import EmbryosIcon from '../../assets/DashBoardIcons/Embryos.svg';
import ContainersIcon from '../../assets/DashBoardIcons/Containers.svg';
import ContainerQualityTrackingIcon from '../../assets/DashBoardIcons/ContainerQualityTracking.svg';
import OutboundModelIcon from '../../assets/OutboundModel.svg';
import IncubatorQualityTrackingIcon from '../../assets/DashBoardIcons/IncubatorQualityTracking.svg';
import QualityDeviationsIcon from '../../assets/DashBoardIcons/QualityDeviations.svg';
import DeviationDriverIcon from '../../assets/flag-icon.svg';
import OutboundShipmentIcon from '../../assets/DashBoardIcons/OutbondShipment.svg';
import AvgQualityLostPatientIcon from '../../assets/DashBoardIcons/AvgQualityLostPatient.svg';
import { ivfService } from '../../services/ivfService';
import type { IVFTreatment } from '../../types/ivf.ts';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Microscope } from 'lucide-react';

interface StakeholderChat {
  id: string;
  sender: string;
  patientId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}


// Performance Icons
import OnTimeIcon from '../../assets/DashBoardIcons/OnTime.svg';
import AvgLeadTimeIcon from '../../assets/DashBoardIcons/AvgLeadTime.svg';

interface DashboardProps { }

export default function Dashboard({ }: DashboardProps) {
  const { isAuthenticated, userRole } = useAuth();
  const navigate = useNavigate();
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);

  // Real data from APIs
  const [criticalAlerts, setCriticalAlerts] = useState<ServiceCriticalAlert[] | IVFAlert[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [stakeholderChats, setStakeholderChats] = useState<StakeholderChat[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showTrackShipment, setShowTrackShipment] = useState(false);
  const [trackError, setTrackError] = useState<string | undefined>(undefined);
  const [showTrackCanister, setShowTrackCanister] = useState(false);
  const [canisterError, setCanisterError] = useState<string | undefined>(undefined);
  const [showOutboundQualityTracking, setShowOutboundQualityTracking] = useState(false);
  const [outboundQualityTrackingError, setOutboundQualityTrackingError] = useState<string | undefined>(undefined);
  const [loadingChats, setLoadingChats] = useState(false);
  const [apiUnreadCount, setApiUnreadCount] = useState<number>(0);

  // WebSocket for unread chat count (tagged messages only)
  const { unreadCount: wsUnreadCount, unreadMessages: wsUnreadMessages, refresh: refreshUnread } = useDashboardChatWebSocket();

  // User initials for avatar (set for potential future use)
  const [_userInitials, setUserInitials] = useState<string>('');
  // User first and last name for greeting
  const [userFirstName, setUserFirstName] = useState<string>('');
  const [userLastName, setUserLastName] = useState<string>('');
  const [loadingUserProfile, setLoadingUserProfile] = useState<boolean>(true);
  // Workspace label (hospital name or pharma company name) for header above greeting
  const [userWorkspaceName, setUserWorkspaceName] = useState<string>('');
  // User department (CGT or IVF) - initialize from localStorage
  const [userDepartment, setUserDepartment] = useState<string | null>(() => {
    try {
      const dept = localStorage.getItem('department');
      return dept ? dept.toUpperCase() : null;
    } catch {
      return null;
    }
  });

  // IVF embryo tracking (live API data)
  const [ivfEmbryoTracking, setIvfEmbryoTracking] = useState<IVFTreatment[]>([]);
  const [loadingIvfEmbryoTracking, setLoadingIvfEmbryoTracking] = useState(false);
  const [ivfEmbryoTrackingError, setIvfEmbryoTrackingError] = useState<string | null>(null);
  const [ivfEmbryoTrackingHasMore, setIvfEmbryoTrackingHasMore] = useState(false);
  const [ivfEmbryoTrackingNextOffset, setIvfEmbryoTrackingNextOffset] = useState<number | null>(null);
  const [loadingIvfEmbryoTrackingMore, setLoadingIvfEmbryoTrackingMore] = useState(false);
  // Filter options from separate API; filter values applied to table API (backend-level)
  const [ivfEmbryoTrackingFilterOptions, setIvfEmbryoTrackingFilterOptions] = useState<{
    site_names: string[];
    statuses: string[];
    goblet_colors: string[];
    crylock_colors: string[];
    total?: number;
    site_name_counts?: Record<string, number>;
    status_counts?: Record<string, number>;
    goblet_color_counts?: Record<string, number>;
    crylock_color_counts?: Record<string, number>;
  }>({ site_names: [], statuses: [], goblet_colors: [], crylock_colors: [] });
  /** Total matching current filters (from embryo_tracking API) */
  const [ivfEmbryoTrackingFilteredTotal, setIvfEmbryoTrackingFilteredTotal] = useState<number | null>(null);
  /** Total with no filters (for "filtered / total" denominator); set when filters are all "all" */
  const [ivfEmbryoTrackingTotalUnfiltered, setIvfEmbryoTrackingTotalUnfiltered] = useState<number | undefined>(undefined);
  const [ivfEmbryoTrackingFilterValues, setIvfEmbryoTrackingFilterValues] = useState<{
    siteName: string;
    status: string;
    gobletColor: string;
    cryolockColor: string;
  }>({ siteName: 'all', status: 'all', gobletColor: 'all', cryolockColor: 'all' });

  // IVF total embryos/cryolocks metric (live API data)
  const [ivfTotalEmbryos, setIvfTotalEmbryos] = useState<number | null>(null);
  const [, setIvfTotalCryolocks] = useState<number | null>(null);
  const [loadingIvfTotals, setLoadingIvfTotals] = useState(false);
  const [ivfTotalsError, setIvfTotalsError] = useState<string | null>(null);

  // IVF total containers metric (live API data)
  const [ivfTotalContainers, setIvfTotalContainers] = useState<number | null>(null);
  const [loadingIvfContainers, setLoadingIvfContainers] = useState(false);
  const [ivfContainersError, setIvfContainersError] = useState<string | null>(null);

  // IVF quality deviations flagged metric (live API data)
  const [ivfQualityDeviations, setIvfQualityDeviations] = useState<number | null>(null);
  const [loadingIvfQualityDeviations, setLoadingIvfQualityDeviations] = useState(false);
  const [ivfQualityDeviationsError, setIvfQualityDeviationsError] = useState<string | null>(null);

  // IVF top deviation driver metric (live API data)
  const [ivfTopDeviationDriverName, setIvfTopDeviationDriverName] = useState<string | null>(null);
  const [loadingIvfTopDeviationDriver, setLoadingIvfTopDeviationDriver] = useState(false);
  const [ivfTopDeviationDriverError, setIvfTopDeviationDriverError] = useState<string | null>(null);

  // IVF outbound shipments metric (live API data)
  const [ivfOutboundShipments, setIvfOutboundShipments] = useState<number | null>(null);
  const [loadingIvfOutboundShipments, setLoadingIvfOutboundShipments] = useState(false);
  const [ivfOutboundShipmentsError, setIvfOutboundShipmentsError] = useState<string | null>(null);


  // IVF total deviations metric (live API data)
  const [ivfTotalDeviations, setIvfTotalDeviations] = useState<number | null>(null);
  const [loadingIvfTotalDeviations, setLoadingIvfTotalDeviations] = useState(false);
  const [ivfTotalDeviationsError, setIvfTotalDeviationsError] = useState<string | null>(null);

  console.log(
      ivfOutboundShipments,
  loadingIvfOutboundShipments,
  ivfOutboundShipmentsError,
  ivfTotalDeviations,
  loadingIvfTotalDeviations,
  ivfTotalDeviationsError,
  )

  // IVF quality deviation chart data (live API data)
  const [ivfQualityDeviationChart, setIvfQualityDeviationChart] = useState<{
    containers: string[];
    metrics: Array<{ name: string; color: string; data: number[] }>;
  } | null>(null);
  const [loadingIvfQualityDeviationChart, setLoadingIvfQualityDeviationChart] = useState(false);
  const [ivfQualityDeviationChartError, setIvfQualityDeviationChartError] = useState<string | null>(null);

  // Fetch stakeholder chats from API (for modal display)
  const fetchStakeholderChats = async () => {
    setLoadingChats(true);
    try {
      const response = await chatService.getUnreadMessages();

      // Update the total unread count from API response
      if (response && typeof response.total_unread === 'number') {
        setApiUnreadCount(response.total_unread);
      }

      if (response && response.unread_messages && response.unread_messages.length > 0) {
        const transformedChats: StakeholderChat[] = response.unread_messages.map((msg: UnreadMessageResponse) => ({
          id: msg.message_id.toString(),
          sender: msg.sender_name,
          patientId: msg.canister_number
            ? `Canister ID: ${msg.canister_number}`
            : (msg.patient_id ? `Patient ID: ${msg.patient_id}` : 'Unknown'),
          message: msg.message_content,
          timestamp: new Date(msg.created_at).toLocaleString(),
          isRead: false // These are unread messages
        }));
        setStakeholderChats(transformedChats);
      } else {
        // No messages found - set empty array and count to 0
        setStakeholderChats([]);
        setApiUnreadCount(0);
      }
    } catch (error) {
      // Only clear chats on error if we don't have any cached data
      // This prevents clearing messages that might have been loaded from WebSocket
      setStakeholderChats(prevChats => {
        return prevChats.length > 0 ? prevChats : [];
      });
      // Don't reset API count on error - keep last known value
    } finally {
      setLoadingChats(false);
    }
  };

  // Update stakeholder chats from WebSocket data (only when WebSocket has data)
  // Don't clear chats if WebSocket is empty - let API fetch handle initial load
  useEffect(() => {
    if (wsUnreadMessages && wsUnreadMessages.length > 0) {
      const transformedChats: StakeholderChat[] = wsUnreadMessages.map((msg) => ({
        id: msg.message_id.toString(),
        sender: msg.sender_name,
        patientId: msg.canister_number
          ? `Canister ID: ${msg.canister_number}`
          : (msg.patient_id ? `Patient ID: ${msg.patient_id}` : 'Unknown'),
        message: msg.message_content,
        timestamp: new Date(msg.created_at).toLocaleString(),
        isRead: false
      }));
      setStakeholderChats(transformedChats);
    }
    // Don't clear chats if WebSocket is empty - API fetch will handle it
  }, [wsUnreadMessages]);

  // Calculate dynamic notification counts
  // Use the maximum of WebSocket count and API count to ensure accuracy
  // This handles cases where WebSocket might not be connected yet or API has more recent data
  const isIVF = (userDepartment || '').toUpperCase() === 'IVF';
  const stakeholderChatCount = Math.max(wsUnreadCount || 0, apiUnreadCount || 0);
  const activeCriticalAlertsCount = criticalAlerts.filter((alert) => {
    if ('acknowledged_at' in alert) {
      return alert.acknowledged_at == null && alert.status === 'Active';
    }
    return alert.status === 'Active';
  }).length;
  const criticalAlertsCount = isIVF
    ? (ivfQualityDeviations ?? 0)
    : activeCriticalAlertsCount;
  const myTasksCount = myTasks.filter(task => task.status === 'Not started' || task.status === 'In progress').length;

  // Format count for display (show "9+" for counts > 9)
  const formatCount = (count: number): string => {
    return count > 9 ? '9+' : count.toString();
  };


  // Fetch critical alerts from API
  const fetchCriticalAlerts = async () => {
    setLoadingAlerts(true);
    try {
      if (isIVF) {
        // Use IVF alerts service for IVF department
        const response = await ivfAlertsService.getHospitalAlerts();
        setCriticalAlerts(response.alerts || []);
      } else {
        // Use CGT alerts service for CGT department
        // TODO: Get pharma_id from user context or modify API to use current user context
        // For now, using a default pharma_id - this should be replaced with actual user's pharma_id
        const pharmaId = '1'; // Default pharma_id - needs to be replaced with actual user's pharma_id
        const response = await criticalAlertsService.getCriticalAlerts(pharmaId);
        setCriticalAlerts(response.alerts || []);
      }
    } catch (error) {
      setCriticalAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Fetch critical alerts on component mount and when department changes
  useEffect(() => {
    fetchCriticalAlerts();
  }, [userDepartment]);

  // Fetch my tasks from API
  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await tasksService.getMyTasks();
      // Combine created_tasks and assigned_tasks into a single array
      const allTasks = [
        ...(response.created_tasks || []),
        ...(response.assigned_tasks || [])
      ];
      setMyTasks(allTasks);
    } catch (error) {
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Fetch my tasks on component mount
  useEffect(() => {
    fetchMyTasks();
  }, []);

  // Fetch unread count on component mount (for badge display)
  useEffect(() => {
    if (isAuthenticated) {
      // Fetch unread messages to get the count (without opening modal)
      const fetchUnreadCount = async () => {
        try {
          const response = await chatService.getUnreadMessages();
          if (response && typeof response.total_unread === 'number') {
            setApiUnreadCount(response.total_unread);
          }
        } catch {
          // Silently handle errors - unread count is not critical
        }
      };
      fetchUnreadCount();
    }
  }, [isAuthenticated]);

  // Fetch stakeholder chats when modal opens (for display)
  // WebSocket handles real-time updates automatically
  useEffect(() => {
    if (showStakeholderChats && isAuthenticated) {
      fetchStakeholderChats();
    }
  }, [showStakeholderChats, isAuthenticated]);

  // Update API count when WebSocket count changes (as a fallback/sync)
  useEffect(() => {
    if (wsUnreadCount !== null && wsUnreadCount !== undefined) {
      // WebSocket count is authoritative when available
      // But we keep API count as fallback
    }
  }, [wsUnreadCount]);

  // Debug: Log the final calculated count
  useEffect(() => {
  }, [stakeholderChatCount, wsUnreadCount, apiUnreadCount]);

  // Debug: Log when chats state changes
  useEffect(() => {
  }, [stakeholderChats]);

  // Fetch user profile to compute initials and get department
  useEffect(() => {
    const fetchUserProfile = async () => {
      setLoadingUserProfile(true);
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
        setUserFirstName(first);
        setUserLastName(last);
        setUserWorkspaceName(profile.company_name?.trim() || '');

        // Get department (CGT or IVF) - check localStorage first, then API
        let department: string | null = null;
        try {
          const storedDept = localStorage.getItem('department');
          if (storedDept) {
            department = storedDept.toUpperCase();
          }
        } catch {}

        // Fall back to API if not in localStorage
        if (!department) {
          department = profile.department?.toUpperCase() || null;
        }

        setUserDepartment(department);
      } catch {
        // Try to get department from localStorage even if API fails
        try {
          const storedDept = localStorage.getItem('department');
          if (storedDept) {
            const department = storedDept.toUpperCase();
            setUserDepartment(department);
          }
        } catch {}
        setUserInitials('U');
        setUserFirstName('');
        setUserLastName('');
        setUserWorkspaceName('');
      } finally {
        setLoadingUserProfile(false);
      }
    };
    if (isAuthenticated) {
      fetchUserProfile();
    } else {
      setLoadingUserProfile(false);
    }
  }, [isAuthenticated]);

  // Fetch IVF embryo tracking filter options; refetch when filter values change so counts reflect current selection
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;
    let cancelled = false;
    ivfService.getEmbryoTrackingFilters(ivfEmbryoTrackingFilterValues)
      .then((res) => {
        if (!cancelled) {
          setIvfEmbryoTrackingFilterOptions({
            site_names: res?.site_names ?? [],
            statuses: res?.statuses ?? [],
            goblet_colors: res?.goblet_colors ?? [],
            crylock_colors: res?.crylock_colors ?? [],
            total: res?.total,
            site_name_counts: res?.site_name_counts,
            status_counts: res?.status_counts,
            goblet_color_counts: res?.goblet_color_counts,
            crylock_color_counts: res?.crylock_color_counts,
          });
          const noFilters =
            ivfEmbryoTrackingFilterValues.siteName === 'all' &&
            ivfEmbryoTrackingFilterValues.status === 'all' &&
            ivfEmbryoTrackingFilterValues.gobletColor === 'all' &&
            ivfEmbryoTrackingFilterValues.cryolockColor === 'all';
          if (noFilters && res?.total != null) {
            setIvfEmbryoTrackingTotalUnfiltered(res.total);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIvfEmbryoTrackingFilterOptions({ site_names: [], statuses: [], goblet_colors: [], crylock_colors: [] });
        }
      });
    return () => { cancelled = true; };
  }, [userDepartment, isAuthenticated, ivfEmbryoTrackingFilterValues.siteName, ivfEmbryoTrackingFilterValues.status, ivfEmbryoTrackingFilterValues.gobletColor, ivfEmbryoTrackingFilterValues.cryolockColor]);

  // Build API filter params from current filter values (backend-level)
  const embryoTrackingApiFilters = useMemo(() => {
    const f: { branch_name?: string; status?: string; cryolock_color?: string; goblet_color?: string } = {};
    if (ivfEmbryoTrackingFilterValues.siteName && ivfEmbryoTrackingFilterValues.siteName !== 'all') f.branch_name = ivfEmbryoTrackingFilterValues.siteName;
    if (ivfEmbryoTrackingFilterValues.status && ivfEmbryoTrackingFilterValues.status !== 'all') f.status = ivfEmbryoTrackingFilterValues.status;
    if (ivfEmbryoTrackingFilterValues.gobletColor && ivfEmbryoTrackingFilterValues.gobletColor !== 'all') f.goblet_color = ivfEmbryoTrackingFilterValues.gobletColor;
    if (ivfEmbryoTrackingFilterValues.cryolockColor && ivfEmbryoTrackingFilterValues.cryolockColor !== 'all') f.cryolock_color = ivfEmbryoTrackingFilterValues.cryolockColor;
    return f;
  }, [ivfEmbryoTrackingFilterValues]);

  // Fetch IVF embryo tracking table (with backend filters); refetch when filters change
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchEmbryoTracking = async () => {
      setLoadingIvfEmbryoTracking(true);
      setIvfEmbryoTrackingError(null);
      try {
        const response = await ivfService.getEmbryoTracking(0, 50, embryoTrackingApiFilters);
        if (!cancelled) {
          setIvfEmbryoTracking(response?.data || []);
          setIvfEmbryoTrackingFilteredTotal(response?.total ?? null);
          setIvfEmbryoTrackingHasMore(response?.has_more || false);
          setIvfEmbryoTrackingNextOffset(response?.next_offset ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setIvfEmbryoTracking([]);
          setIvfEmbryoTrackingFilteredTotal(null);
          setIvfEmbryoTrackingError(e?.message || 'Failed to load embryo tracking data');
          setIvfEmbryoTrackingHasMore(false);
          setIvfEmbryoTrackingNextOffset(null);
        }
      } finally {
        if (!cancelled) setLoadingIvfEmbryoTracking(false);
      }
    };

    fetchEmbryoTracking();
    return () => { cancelled = true; };
  }, [userDepartment, isAuthenticated, embryoTrackingApiFilters]);

  // Load more IVF embryo tracking data (same backend filters)
  const loadMoreIvfEmbryoTracking = async () => {
    if (loadingIvfEmbryoTrackingMore || !ivfEmbryoTrackingHasMore || ivfEmbryoTrackingNextOffset === null) return;
    setLoadingIvfEmbryoTrackingMore(true);
    try {
      const response = await ivfService.getEmbryoTracking(ivfEmbryoTrackingNextOffset, 50, embryoTrackingApiFilters);
      setIvfEmbryoTracking(prev => [...prev, ...(response?.data || [])]);
      setIvfEmbryoTrackingHasMore(response?.has_more || false);
      setIvfEmbryoTrackingNextOffset(response?.next_offset ?? null);
    } catch {
      setIvfEmbryoTrackingHasMore(false);
      setIvfEmbryoTrackingNextOffset(null);
    } finally {
      setLoadingIvfEmbryoTrackingMore(false);
    }
  };

  const handleIvfEmbryoTrackingFilterChange = (key: 'siteName' | 'status' | 'gobletColor' | 'cryolockColor', value: string) => {
    setIvfEmbryoTrackingFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleIvfEmbryoTrackingClearFilters = () => {
    setIvfEmbryoTrackingFilterValues({ siteName: 'all', status: 'all', gobletColor: 'all', cryolockColor: 'all' });
  };

  // Fetch IVF totals (Total Embryos/Cryolocks) from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchTotals = async () => {
      setLoadingIvfTotals(true);
      setIvfTotalsError(null);
      try {
        const response = await ivfService.getTotalEmbryosCryolocks();
        if (!cancelled) {
          setIvfTotalEmbryos(response?.total_embryos ?? 0);
          setIvfTotalCryolocks(response?.total_cryolocks ?? 0);
        }
      } catch (e: any) {
        if (!cancelled) {
          setIvfTotalEmbryos(null);
          setIvfTotalCryolocks(null);
          setIvfTotalsError(e?.message || 'Failed to load totals');
        }
      } finally {
        if (!cancelled) setLoadingIvfTotals(false);
      }
    };

    fetchTotals();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated]);

  // Fetch IVF total containers from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchTotalContainers = async () => {
      setLoadingIvfContainers(true);
      setIvfContainersError(null);
      try {
        const response = await ivfService.getTotalContainers();
        if (!cancelled) setIvfTotalContainers(response?.total_containers ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          setIvfTotalContainers(null);
          setIvfContainersError(e?.message || 'Failed to load total containers');
        }
      } finally {
        if (!cancelled) setLoadingIvfContainers(false);
      }
    };

    fetchTotalContainers();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated]);

  // Fetch IVF quality deviations flagged from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchQualityDeviations = async () => {
      setLoadingIvfQualityDeviations(true);
      setIvfQualityDeviationsError(null);
      try {
        const response = await ivfService.getQualityDeviationsFlagged();
        if (!cancelled) setIvfQualityDeviations(response?.total_deviations ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          setIvfQualityDeviations(null);
          setIvfQualityDeviationsError(e?.message || 'Failed to load quality deviations');
        }
      } finally {
        if (!cancelled) setLoadingIvfQualityDeviations(false);
      }
    };

    fetchQualityDeviations();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated]);

  // Fetch IVF top deviation driver from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchTopDeviationDriver = async () => {
      setLoadingIvfTopDeviationDriver(true);
      setIvfTopDeviationDriverError(null);
      try {
        const response = await ivfService.getTotalDeviations();

        // Sort deviations by count (descending) and skip "Unknown"
        const sortedEntries = Object.entries(response.deviations_by_kpi)
          .sort(([, countA], [, countB]) => countB - countA);

        // Find the first entry that is not "Unknown"
        let max_deviated_alert = "";
        for (const [alert_name] of sortedEntries) {
          if (alert_name !== "Unknown") {
            max_deviated_alert = alert_name;
            break;
          }
        }

        // Fallback to first entry if all are "Unknown"
        if (!max_deviated_alert && sortedEntries.length > 0) {
          max_deviated_alert = sortedEntries[0][0];
        }

        if (!cancelled) setIvfTopDeviationDriverName(max_deviated_alert || 'N/A');
      } catch (e: any) {
        if (!cancelled) {
          setIvfTopDeviationDriverName(null);
          setIvfTopDeviationDriverError(e?.message || 'Failed to load top deviation driver');
        }
      } finally {
        if (!cancelled) setLoadingIvfTopDeviationDriver(false);
      }
    };

    fetchTopDeviationDriver();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated]);

  // Fetch IVF outbound shipments from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchOutboundShipments = async () => {
      setLoadingIvfOutboundShipments(true);
      setIvfOutboundShipmentsError(null);
      try {
        const response = await ivfService.getOutboundShipments();
        if (!cancelled) setIvfOutboundShipments(response?.total_outbound_shipments ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          setIvfOutboundShipments(null);
          setIvfOutboundShipmentsError(e?.message || 'Failed to load outbound shipments');
        }
      } finally {
        if (!cancelled) setLoadingIvfOutboundShipments(false);
      }
    };

    fetchOutboundShipments();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated]);


  // Fetch IVF total deviations from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchTotalDeviations = async () => {
      setLoadingIvfTotalDeviations(true);
      setIvfTotalDeviationsError(null);
      try {
        const response = await ivfService.getTotalDeviations();
        if (!cancelled) setIvfTotalDeviations(response?.total_deviations ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          setIvfTotalDeviations(null);
          setIvfTotalDeviationsError(e?.message || 'Failed to load total deviations');
        }
      } finally {
        if (!cancelled) setLoadingIvfTotalDeviations(false);
      }
    };

    fetchTotalDeviations();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated]);

  // Fetch IVF quality deviation chart from API
  useEffect(() => {
    const shouldFetch = (userDepartment || '').toUpperCase() === 'IVF' && isAuthenticated;
    if (!shouldFetch) return;

    let cancelled = false;
    const fetchQualityDeviationChart = async () => {
      setLoadingIvfQualityDeviationChart(true);
      setIvfQualityDeviationChartError(null);
      try {
        const response = await ivfService.getDeviationsGraph();
        if (!cancelled && response) {
          const isUserRole = String(userRole || '').toLowerCase() === 'user';
          const REQUIRED_ALERTS = [
            'Battery Level',
            'Lid State',
            'LN2',
            'Evaporation Rate',
            'Internal Temperature',
            'External Temperature',
            'Shock Detection',
          ];

          const responseRows = Array.isArray(response)
            ? response
            : Array.isArray(response.data)
              ? response.data
              : [];

          const apiHeadings = !Array.isArray(response) && Array.isArray(response.available_heading)
            ? response.available_heading
            : [];

          const getLabelForItem = (item: { branch_name?: string | null; tank_code?: string | null }) => {
            const branchName = String(item?.branch_name ?? '').trim();
            const tankCode = String(item?.tank_code ?? '').trim();
            if (isUserRole) return tankCode || branchName;
            if (!branchName) return '';
            return branchName;
          };

          const labelsFromData = responseRows
            .map((item) => getLabelForItem(item))
            .filter((name): name is string => typeof name === 'string' && name.length > 0);

          const containers = apiHeadings.length > 0
            ? Array.from(new Set(apiHeadings.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)))
            : Array.from(new Set(labelsFromData)).sort((a, b) => a.localeCompare(b));

          // Sum duplicate rows from API by (branch_name, alert_name).
          const deviationMap = new Map<string, number>();
          responseRows.forEach((item) => {
            const labelName = getLabelForItem(item);
            const alertName = (item?.alert_name ?? '').trim();
            const count = Number(item?.deviation_count ?? 0);
            if (!labelName || !alertName || !Number.isFinite(count)) return;
            const key = `${labelName}__${alertName}`;
            deviationMap.set(key, (deviationMap.get(key) ?? 0) + count);
          });

          const responseAlerts = responseRows
            .map((item) => item?.alert_name)
            .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
          const orderedAlerts = Array.from(new Set([...REQUIRED_ALERTS, ...responseAlerts]));

          // Keep color assignment deterministic; chart component also maps by name.
          const colorPalette = ['#A78BFA', '#60A5FA', '#F59E0B', '#10B981', '#F97316', '#EC4899', '#94A3B8'];
          const metrics = orderedAlerts.map((alertName, idx) => ({
            name: alertName,
            color: colorPalette[idx % colorPalette.length],
            data: containers.map((containerLabel) => {
              const key = `${containerLabel}__${alertName}`;
              return deviationMap.get(key) ?? 0;
            }),
          }));
          setIvfQualityDeviationChart({ containers, metrics });
        }
      } catch (e: any) {
        if (!cancelled) {
          setIvfQualityDeviationChart(null);
          setIvfQualityDeviationChartError(e?.message || 'Failed to load quality deviation chart');
        }
      } finally {
        if (!cancelled) setLoadingIvfQualityDeviationChart(false);
      }
    };

    fetchQualityDeviationChart();
    return () => {
      cancelled = true;
    };
  }, [userDepartment, isAuthenticated, userRole]);

  // Transform API data to match component interface
  const transformedTasks: MyTask[] = myTasks.map(task => {
    try {
      return {
        id: task.id.toString(),
        patientId: task.patient_id || 'N/A',
        tankCode: task.tank_code || undefined,
        taskName: task.task_name,
        description: task.description || '',
        assigneeBy: task.created_by
          ? `${task.created_by.first_name || ''} ${task.created_by.last_name || ''}`.trim() || 'Unknown'
          : 'Unknown',
        assignedTo: task.assignee
          ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unknown'
          : 'Unknown',
        dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A',
        priority: task.priority,
        status: task.status
      };
    } catch (error) {
      return {
        id: task.id?.toString() || 'unknown',
        patientId: task.patient_id || 'N/A',
        tankCode: task.tank_code || undefined,
        taskName: task.task_name || 'Unknown Task',
        description: task.description || '',
        assigneeBy: 'Unknown',
        assignedTo: 'Unknown',
        dueDate: 'N/A',
        priority: task.priority || 'Medium',
        status: task.status || 'Not started'
      };
    }
  });

  const transformedAlerts = criticalAlerts.map(alert => {
    // Check if it's an IVF alert (has alert_id) or CGT alert (has id)
    if ('alert_id' in alert) {
      // IVF alert
      const ivfAlert = alert as IVFAlert;
      const severity: 'Low' | 'Medium' | 'High' | 'Critical' =
        ivfAlert.severity === 'High' ? 'High' :
        ivfAlert.severity === 'Medium' ? 'Medium' : 'Low';
      return {
        id: ivfAlert.alert_id,
        type: ivfAlert.alert_type,
        severity,
        patientId: ivfAlert.tank_code
          ? ivfAlert.tank_code
          : ivfAlert.canister_number
            ? ivfAlert.canister_number
            : (typeof ivfAlert.canister_id === 'number'
              ? `Canister ${ivfAlert.canister_id}`
              : 'N/A'),
        branchName: (ivfAlert as IVFAlert & { branch_name?: string }).branch_name,
        dedupKey: (ivfAlert as IVFAlert & { dedup_key?: string }).dedup_key,
        message: ivfAlert.message,
        timestamp: new Date(ivfAlert.occurred_at+"Z").toLocaleString(),
        status: (ivfAlert.status === 'Active' ? 'Active' : 'Acknowledged') as 'Active' | 'Acknowledged' | 'Resolved' | 'Escalated'
      };
    } else {
      const cgtAlert = alert as ServiceCriticalAlert;
      return {
        id: cgtAlert.id,
        type: cgtAlert.type,
        severity: cgtAlert.severity,
        patientId: cgtAlert.patient_id,
        message: cgtAlert.message,
        timestamp: cgtAlert.timestamp,
        status: cgtAlert.status
      };
    }
  });

  // State for patient statistics
  const [patientStats, setPatientStats] = useState<PatientStatistics | null>(null);
  const [logisticsMetrics, setLogisticsMetrics] = useState<LogisticsMetrics | null>(null);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [complianceMetrics, setComplianceMetrics] = useState<ComplianceMetrics | null>(null);
  const [qualityDeviations, setQualityDeviations] = useState<AvgQualityDeviationsResponse | null>(null);
  const [onTimePercentage, setOnTimePercentage] = useState<OnTimePercentageResponse | null>(null);
  const [avgLeadTime, setAvgLeadTime] = useState<AvgLeadTimeResponse | null>(null);
  const [successRate, setSuccessRate] = useState<SuccessRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  // Fetch patient statistics and logistics metrics on component mount
  // Only fetch CGT APIs if user is NOT IVF (i.e., is CGT)
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch patient statistics, logistics metrics, risk metrics, compliance metrics, quality deviations, on-time percentage, average lead time, and success rate in parallel
        const [stats, logistics, risk, compliance, qualityDev, onTime, leadTime, success] = await Promise.all([
          logisticsService.getPatientStatistics(), // /api/patients/statistics
          logisticsService.getLogisticsMetrics(),  // /api/logistics
          riskService.getRiskMetrics(), // /api/risk
          complianceService.getComplianceMetrics(), // /api/compliance
          performanceService.getAvgQualityDeviations(), // /api/performance/avg-quality-deviations
          performanceService.getOnTimePercentage(), // /api/performance/on-time-percentage
          performanceService.getAvgLeadTime(), // /api/performance/avg-lead-time
          performanceService.getSuccessRate() // /api/performance/success-rate
        ]);

        setPatientStats(stats);
        setLogisticsMetrics(logistics);
        setRiskMetrics(risk);
        setComplianceMetrics(compliance);
        setQualityDeviations(qualityDev);
        setOnTimePercentage(onTime);
        setAvgLeadTime(leadTime);
        setSuccessRate(success);
      } catch (err) {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    // Only fetch CGT APIs if user is authenticated AND is NOT IVF (i.e., is CGT)
    const isIVF = (userDepartment || '').toUpperCase() === 'IVF';
    if (isAuthenticated && !isIVF) {
      fetchDashboardData();
    } else {
      // If IVF user, set loading to false and clear CGT data
      setLoading(false);
      setPatientStats(null);
      setLogisticsMetrics(null);
      setRiskMetrics(null);
      setComplianceMetrics(null);
      setQualityDeviations(null);
      setOnTimePercentage(null);
      setAvgLeadTime(null);
      setSuccessRate(null);
    }
  }, [isAuthenticated, userDepartment]);

  // Icon mapping function
  const getIcon = (iconName: string) => {
    const iconMap: { [key: string]: string } = {
      'Treatments_Count': TreatmentsCountIcon,
      'Patient_Count': PatientCountIcon,
      'Risk': RiskIcon,
      'Compliance': ComplianceIcon,
      'Logistics_Chain': LogisticsChainIcon,
      'Logistics_Quality': LogisticsQualityIcon,
    };
    return iconMap[iconName] || '';
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the dashboard.</p>
      </div>
    );
  }

  const volumeCards = [
    {
      label: "Tracking Shipment",
      description: "Track delivery status with live updates.",
      icon: TrackingShipmentIcon,
      alt: "Track Shipment",
    },
    {
      label: "Aftercare",
      description: "Helping you even after the work is done.",
      icon: AftercareIcon,
      alt: "Aftercare",
    },
    {
      label: "Failure",
      description: "Spot failures early with real-time insights.",
      icon: FailuresIcon,
      alt: "Failures",
    },
  ];


  return (
    <div
      className="bg-[#FDFAFF] flex w-full h-[100vh] overflow-x-hidden"
      style={{
        maxWidth: '100vw',
        touchAction: 'pan-y',
        overscrollBehaviorX: 'none'
      }}
    >
      {/* Main Content Area */}
      <main
        className="flex-1 flex flex-col overflow-x-hidden overflow-y-hidden min-w-0"
        style={{
          maxWidth: '100vw',
          touchAction: 'pan-y',
          overscrollBehaviorX: 'none',
          height: '100vh'
        }}
      >

        {/* Dashboard Content */}
        <div
          className="flex-1 p-6 pt-10 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0"
          style={{
            touchAction: 'pan-y',
            overscrollBehaviorX: 'none',
            overscrollBehaviorY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >

          {userDepartment === 'IVF' ? (
            // IVF Dashboard Layout
            <>
              {/* Single row: greeting (left) + alerts (right); on mobile: alerts on top, greeting below */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Greeting - below alerts on mobile, left on desktop */}
                <div className="order-2 lg:order-1 flex flex-col gap-0.5">
                  <p className="text-sm text-gray-500 font-normal min-h-[1.25rem]">
                    {userWorkspaceName || '\u00A0'}
                  </p>
                  {(() => {
                    const hour = new Date().getHours();
                    const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
                    const displayName = [userFirstName, userLastName].filter(Boolean).join(' ') || 'User';
                    return (
                      <p className="text-black font-semibold text-xl flex items-center gap-2">
                        <span>Good {greeting},</span>
                        {loadingUserProfile ? (
                          <span className="inline-block h-7 w-[150px] max-w-full animate-pulse rounded-md bg-gray-200" />
                        ) : (
                          <span className="text-[#6b1176]">{displayName}</span>
                        )}
                      </p>
                    );
                  })()}
                </div>
                {/* Critical Alerts, Stakeholder Chats, My Tasks - on top on mobile, right on desktop */}
                <section className="order-1 lg:order-2 w-full lg:w-auto">
                  <div className="flex justify-end gap-8">
                    {/* Critical Alerts */}
                    <div className="relative group">
                      <img
                        className="w-[25px] h-[25px] cursor-pointer"
                        alt="Critical Alerts"
                        src={CriticalAlertsIcon}
                        onClick={() => {
                          fetchCriticalAlerts();
                          setShowCriticalAlerts(true);
                        }}
                      />
                      {criticalAlertsCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                          <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
                        </div>
                      )}
                    </div>
                    {/* Stakeholder Chats */}
                    <div className="relative group">
                      <img
                        className="w-[25px] h-[25px] cursor-pointer"
                        alt="Stakeholder Chats"
                        src={StakeholderChatsIcon}
                        onClick={() => {
                          refreshUnread();
                          fetchStakeholderChats();
                          setShowStakeholderChats(true);
                        }}
                      />
                      {stakeholderChatCount > 0 && (
                        <div className={`absolute -top-1 -right-1 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center ${
                          stakeholderChatCount > 9 ? 'px-1 min-w-[20px]' : 'w-4 h-4'
                        }`}>
                          <span className="font-semibold text-white text-[10px]">{formatCount(stakeholderChatCount)}</span>
                        </div>
                      )}
                    </div>
                    {/* My Tasks */}
                    <div className="relative group">
                      <img
                        className="w-[25px] h-[25px] cursor-pointer"
                        alt="My Tasks"
                        src={MyTasksIcon}
                        onClick={() => {
                          fetchMyTasks();
                          setShowMyTasks(true);
                        }}
                      />
                      {myTasksCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                          <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex gap-6 flex-col lg:flex-row">
                {/* Left Column - Volume, Performance, Shipment sections */}
                <div className="flex-1 flex flex-col gap-6 min-w-0">
                  {/* Volume Section */}
                  <section>
                    <h2 className="font-semibold text-black text-base mb-4">Volume</h2>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Total Embryos/Cryolocks */}
                      <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px]">
                        <div className="flex flex-col items-start mb-2 ml-3">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img className="w-[18px] h-[18px]" alt="Embryos" src={EmbryosIcon} />
                          </div>
                          <div className="font-normal text-[#656565] text-[11px] mt-2">
                            Total Cryolocks
                          </div>
                          <div className="font-semibold text-black text-[28px] mt-1">
                            {loadingIvfTotals
                              ? '--/--'
                              : ivfTotalsError
                                ? '0/0'
                                : <AnimatedNumber value={ivfTotalEmbryos ?? 0} />}
                          </div>
                        </div>
                      </div>

                      {/* Total number of Containers */}
                      <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px]">
                        <div className="flex flex-col items-start mb-2 ml-3">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img className="w-[18px] h-[18px]" alt="Containers" src={ContainersIcon} />
                          </div>
                          <div className="font-normal text-[#656565] text-[11px] mt-2">
                            Total number of Containers
                          </div>
                          <div className="font-semibold text-black text-[28px] mt-1">
                            {loadingIvfContainers
                              ? '--'
                              : ivfContainersError
                                ? '0'
                                : <AnimatedNumber value={ivfTotalContainers ?? 0} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Performance Section */}
                  <section>
                    <h2 className="font-semibold text-black text-base mb-4">Container Performance</h2>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Quality Deviations Flagged */}
                      <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px]">
                        <div className="flex flex-col items-start mb-2 ml-3">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img className="w-[18px] h-[18px]" alt="Quality Deviations" src={CriticalAlertsIcon} />
                          </div>
                          <div className="font-normal text-[#656565] text-[11px] mt-2">
                            Quality Deviations Flagged
                          </div>
                          <div className="font-semibold text-black text-[28px] mt-1">
                            {loadingIvfQualityDeviations
                              ? '--'
                              : ivfQualityDeviationsError
                                ? '0'
                                : <AnimatedNumber value={ivfQualityDeviations ?? 0} />}
                          </div>
                        </div>
                      </div>

                      {/* Top Deviation Driver */}
                      <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px]">
                        <div className="flex flex-col items-start mb-2 ml-3 w-full min-w-0">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img className="w-[18px] h-[18px]" alt="Deviation Driver" src={DeviationDriverIcon} />
                          </div>
                          <div className="font-normal text-[#656565] text-[11px] mt-2">
                            Top Deviation Driver
                          </div>
                          <div className="font-semibold text-black text-[23px] mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap" title={ivfTopDeviationDriverName || undefined}>
                            {loadingIvfTopDeviationDriver
                              ? '--'
                              : ivfTopDeviationDriverError
                                ? 'N/A'
                                : ivfTopDeviationDriverName ?? 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Outbound Shipments Section */}
                  <section>
                    <h2 className="font-semibold text-black text-base mb-4">Incubator Performance</h2>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Outbound Shipments */}
                      <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px]">
                        <div className="flex flex-col items-start mb-2 ml-3">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img className="w-[18px] h-[18px]" alt="Outbound Shipment" src={OutboundShipmentIcon} />
                          </div>
                          <div className="font-normal text-[#656565] text-[11px] mt-2">
                            Quality Deviations Flagged
                          </div>
                          <div className="font-semibold text-black text-[28px] mt-1">
                            <AnimatedNumber value={0} />
                            {/* {loadingIvfOutboundShipments
                              ? '--'
                              : ivfOutboundShipmentsError
                                ? '0'
                                : `${ivfOutboundShipments ?? 0}`} */}
                          </div>
                        </div>
                      </div>

                      {/* Deviations */}
                      <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px]">
                        <div className="flex flex-col items-start mb-2 ml-3">
                          <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                            <img className="w-[18px] h-[18px]" alt="Avg Quality Lost Patient" src={AvgQualityLostPatientIcon} />
                          </div>
                          <div className="font-normal text-[#656565] text-[11px] mt-2">
                          Top Deviation Driver
                          </div>
                          <div className="font-semibold text-black text-[28px] mt-1">
                            <AnimatedNumber value={0} />
                            {/* {loadingIvfTotalDeviations
                              ? '--'
                              : ivfTotalDeviationsError
                                ? '0'
                                : `${ivfTotalDeviations ?? 0}`} */}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right Column - Monthly Summary + Quality Tracking cards */}
                <div className="flex-1 flex flex-col gap-6 min-w-0">
                  {/* <h1 className="font-semibold text-black text-lg">Monthly Summary</h1> */}
                  {/* Quality Tracking Links - Above the chart */}
                  <section>
                    <div className="flex gap-6 mt-10">
                      {/* Container Quality Tracking */}
                          <div
                            className="flex-1 bg-[#6B1176] rounded-lg cursor-pointer transition-all drop-shadow-[0_3px_3px_rgba(0,0,0,0.10)] h-[123px] hover:drop-shadow-[0_3px_3px_rgba(0,0,0,0.18)] relative overflow-hidden hover:bg-[#7a1a88] hover:shadow-lg hover:-translate-y-0.5"
                        onClick={() => {
                          setShowTrackCanister(true);
                          setCanisterError(undefined);
                        }}
                      >
                        {/* Background Graphic - Subtle Icon */}
                        <div className="absolute bottom-0 right-0 opacity-5 translate-x-[30%] translate-y-[20%]">
                          <img
                            className="w-24 h-24"
                            alt="Container Quality Tracking background"
                            src={ContainerQualityTrackingIcon}
                          />
                        </div>

                        {/* Content */}
                        <div className="relative h-full px-3 py-4">
                          {/* Icon at Top Left */}
                          <div className="absolute top-4 left-4">
                            <img
                              className="w-[18px] h-[18px]"
                              alt="Container Quality Tracking"
                              src={ContainerQualityTrackingIcon}
                            />
                          </div>

                          {/* Title - Left aligned */}
                          <div className="font-semibold text-white text-[14px] text-left mt-8 mb-1 whitespace-nowrap">
                            Cryocan
                            <br />
                            Quality Tracking
                          </div>

                          {/* Arrow Button at Bottom Right */}
                          <div className="absolute bottom-0 right-0">
                            <button
                              className="w-[26px] h-[24px] bg-[#9C3AA6] rounded-tl-lg flex items-center justify-center transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowTrackCanister(true);
                                setCanisterError(undefined);
                              }}
                            >
                              <img
                                className="w-[14px] h-[14px]"
                                alt="Next"
                                src={NextIcon}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Embryo Grading */}
                      <div
                        className="flex-1 bg-[#6B1176] rounded-lg hover:bg-[#7a1a88] hover:shadow-lg hover:-translate-y-0.5 cursor-pointer transition-all drop-shadow-[0_3px_3px_rgba(0,0,0,0.10)] h-[123px] hover:drop-shadow-[0_3px_3px_rgba(0,0,0,0.18)] relative overflow-hidden"
                        onClick={() => {
                          // Embryo Grading: no redirect for now
                        }}
                      >
                        {/* Background Graphic - Subtle Icon */}
                        <div className="absolute bottom-0 right-0 opacity-5 translate-x-[0%] translate-y-[15%]">
                          <Microscope className="w-24 h-24 text-white" strokeWidth={1.5} />
                        </div>

                        {/* Content */}
                        <div className="relative h-full px-3 py-4">
                          {/* Icon at Top Left */}
                          <div className="absolute top-4 left-4">
                            <Microscope className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                          </div>

                          {/* Title - Left aligned */}
                          <div className="font-semibold text-white text-[14px] text-left mt-8 mb-1 whitespace-nowrap">
                            Embryo <br /> Grading
                          </div>

                          {/* Arrow Button at Bottom Right */}
                          <div className="absolute bottom-0 right-0">
                            <button
                              className="w-[26px] h-[24px] bg-[#9C3AA6] rounded-tl-lg flex items-center justify-center transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Embryo Grading: no redirect for now
                              }}
                            >
                              <img
                                className="w-[14px] h-[14px]"
                                alt="Next"
                                src={NextIcon}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Incubator Quality Tracking */}
                      <div className="flex-1 bg-[#6B1176] rounded-lg cursor-pointer transition-all drop-shadow-[0_3px_3px_rgba(0,0,0,0.10)] h-[123px] hover:drop-shadow-[0_3px_3px_rgba(0,0,0,0.18)] relative overflow-hidden  hover:bg-[#7a1a88] hover:shadow-lg hover:-translate-y-0.5">
                        {/* Background Graphic - Subtle Icon */}
                        <div className="absolute bottom-0 right-0 opacity-5 translate-x-[30%] translate-y-[20%]">
                          <img
                            className="w-24 h-24"
                            alt="Incubator Quality Tracking background"
                            src={IncubatorQualityTrackingIcon}
                          />
                        </div>

                        {/* Content */}
                        <div className="relative h-full px-3 py-4">
                          {/* Icon at Top Left */}
                          <div className="absolute top-4 left-4">
                            <img
                              className="w-[18px] h-[18px]"
                              alt="Incubator Quality Tracking"
                              src={IncubatorQualityTrackingIcon}
                            />
                          </div>

                          {/* Title - Left aligned */}
                          <div className="font-semibold text-white text-[14px] text-left mt-8 mb-1 whitespace-nowrap">
                            Incubator <br /> Quality Tracking
                          </div>

                          {/* Arrow Button at Bottom Right */}
                          <div className="absolute bottom-0 right-0">
                            <button
                              className="w-[26px] h-[24px] bg-[#9C3AA6] rounded-tl-lg flex items-center justify-center transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <img
                                className="w-[14px] h-[14px]"
                                alt="Next"
                                src={NextIcon}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Quality Deviation Chart - Below Quality Tracking */}
                  <section className="flex-1 h-[347px]">
                    {loadingIvfQualityDeviationChart ? (
                      <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[347px] flex items-center justify-center">
                        <p className="text-gray-500">Loading quality deviation data...</p>
                      </div>
                    ) : ivfQualityDeviationChartError ? (
                      <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[347px] flex items-center justify-center">
                        <p className="text-red-500">Error: {ivfQualityDeviationChartError}</p>
                      </div>
                    ) : ivfQualityDeviationChart ? (
                      <QualityDeviationChart
                        containers={ivfQualityDeviationChart.containers}
                        metrics={ivfQualityDeviationChart.metrics}
                      />
                    ) : null}
                  </section>
                </div>
              </div>

              {/* Ongoing Treatments Section */}
              <section className="w-full">
                <div className="flex flex-col border border-[#E7E1E1] rounded-2xl p-4 w-full overflow-x-auto">
                <h2 className="font-semibold text-black text-base mb-4">Site Level Information</h2>
                {loadingIvfEmbryoTracking ? (
                  <div className="w-full">
                    <div className="mb-2">
                      <div className="relative overflow-hidden h-4 w-32 rounded-md bg-gray-200">
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                          style={{ width: '50%' }}
                        />
                      </div>
                    </div>
                    <div>
                      <table className="min-w-max w-full">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-[#FDF4FF]">
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">HIS # (PK)</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Cryolock #</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Canister #</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Tank ID</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Cane ID</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Goblet Color</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Cryolock Color</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Date of Vitrification</th>
                            <th className="px-4 py-3 text-left h-[56px] font-semibold text-[#6B1176] text-xs whitespace-nowrap">Site Name</th>
                          </tr>
                        </thead>
                        <tbody >
                          {Array.from({ length: 6 }, (_, i) => (
                            <tr key={i} className="border-b border-[#F3E0FF] bg-white">
                              {[70, 75, 55, 60, 55, 65, 75, 95, 80].map((w, col) => (
                                <td key={col} className="px-4 py-3">
                                  <div className="relative overflow-hidden h-4 rounded-md bg-gray-200" style={{ width: `${w}px` }}>
                                    <div
                                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                      style={{ width: '50%', animationDelay: `${i * 0.08}s` }}
                                    />
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : ivfEmbryoTrackingError ? (
                  <div className="px-4 py-8 text-center text-red-600 text-xs">{ivfEmbryoTrackingError}</div>
                ) : (
                  <div className="w-full">
                    <div>
                      <IVFOngoingTreatments
                      treatments={ivfEmbryoTracking}
                      hasMore={ivfEmbryoTrackingHasMore}
                      isLoading={loadingIvfEmbryoTracking}
                      isLoadingMore={loadingIvfEmbryoTrackingMore}
                      onLoadMore={loadMoreIvfEmbryoTracking}
                      filterOptions={ivfEmbryoTrackingFilterOptions}
                      filterValues={ivfEmbryoTrackingFilterValues}
                      onFilterChange={handleIvfEmbryoTrackingFilterChange}
                      onClearFilters={handleIvfEmbryoTrackingClearFilters}
                      filteredTotal={ivfEmbryoTrackingFilteredTotal}
                      totalUnfiltered={ivfEmbryoTrackingTotalUnfiltered ?? ivfEmbryoTrackingFilterOptions.total}
                    />
                    </div>
                  </div>
                )}
                </div>
              </section>
            </>
          ) : (
            // CGT Dashboard Layout (existing)
            <>
              <div className="flex gap-6 flex-1 flex-col lg:flex-row">
                {/* Left Column */}
              <div className="flex-1 flex flex-col gap-6 min-w-0">
                <h1 className="font-semibold text-black text-lg">
                  Monthly Summary
                </h1>

              {/* Volume Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Volume
                </h2>
                <div className="p-0">
                  <div className="grid grid-cols-2 gap-6 relative">

                    {/* Patient Count */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] ">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Patient Count"
                            src={getIcon('Patient_Count')}
                          />
                        </div>
                        <div className="font-normal text-[#656565] text-[11px] mt-2">
                          Patient Count:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : <AnimatedNumber value={patientStats?.current_month_patient_count ?? 0} />}
                        </div>
                      </div>
                    </div>

                    {/* Treatment Count */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] ">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Treatments Count"
                            src={getIcon('Treatments_Count')}
                          />
                        </div>
                        <div className="font-normal text-[#656565] text-[11px] mt-2">
                          Quality Deviation Flagged:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading ? '...' : <AnimatedNumber value={qualityDeviations?.total_deviations ?? 0} />}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Logistics Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Logistics
                </h2>
                <div className="p-0">
                  <div className="grid grid-cols-2 gap-6 relative">

                    {/* Cold Chain Packaging Failure */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] ">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 mr-4 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Cold Chain Packaging Failure"
                            src={getIcon('Logistics_Chain')}
                          />
                        </div>
                        <div className="font-normal text-[#656565] text-[11px] mt-2">
                          Cold Chain Packaging Failure
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading
                            ? '...'
                            : logisticsMetrics?.cold_chain_packaging_failure_percentage != null
                              ? `${logisticsMetrics.cold_chain_packaging_failure_percentage.toFixed(1)}%`
                              : '0%'}
                        </div>
                      </div>
                    </div>

                    {/* Average Quality Lost per Patient */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] ">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fef2ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Average Quality Lost per Patient"
                            src={getIcon('Logistics_Quality')}
                          />
                        </div>
                        <div className="font-normal text-[#656565] text-[11px] mt-2">
                          Avg Quality Lost/Patient
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading
                            ? '...'
                            : logisticsMetrics?.avg_quality_lost_per_patient_percentage != null
                              ? `${logisticsMetrics.avg_quality_lost_per_patient_percentage}%`
                              : '0%'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Performance Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Performance
                </h2>
                <div className="p-0">
                  <div className="grid grid-cols-2 gap-6 relative">

                    {/* On Time Percentage */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] ">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="On Time Performance"
                            src={OnTimeIcon}
                          />
                        </div>
                        <div className="font-normal text-[#656565] text-[11px] mt-2">
                          On Time:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading
                            ? '...'
                            : onTimePercentage?.on_time_percentage != null
                              ? `${onTimePercentage.on_time_percentage}%`
                              : '0%'}
                        </div>
                      </div>
                    </div>

                    {/* Average Lead Time */}
                    <div className="flex flex-col bg-white border border-[#E7E1E1] rounded-lg p-3 h-[123px] ">
                      <div className="flex flex-col items-start mb-2 ml-3">
                        <div className="w-8 h-8 bg-[#fdf1ff] rounded-2xl flex items-center justify-center">
                          <img
                            className="w-[18px] h-[18px]"
                            alt="Average Lead Time"
                            src={AvgLeadTimeIcon}
                          />
                        </div>
                        <div className="font-normal text-[#656565] text-[11px] mt-2">
                          Avg Lead time:
                        </div>
                        <div className="font-semibold text-black text-[28px] mt-1">
                          {loading
                            ? '...'
                            : avgLeadTime?.avg_lead_time_days != null
                              ? `${avgLeadTime.avg_lead_time_days}d`
                              : '0d'}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </section>
            </div>

            {/* Right Column */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
              {/* Notifications Section */}
              <section className="w-full">
                <div className="flex justify-end gap-8 mb-4">
                  {/* Critical Alerts */}
                  <div className="relative group">
                    <img
                      className="w-[25px] h-[25px] cursor-pointer"
                      alt="Critical Alerts"
                      src={CriticalAlertsIcon}
                      onClick={() => {
                        fetchCriticalAlerts();
                        setShowCriticalAlerts(true);
                      }}
                    />
                    {criticalAlertsCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                        <span className="font-semibold text-white text-[10px]">
                          {criticalAlertsCount}
                        </span>
                      </div>
                    )}
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Critical Alerts
                      </div>
                      <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>

                  {/* Stakeholder Chats */}
                  <div className="relative group">
                    <img
                      className="w-[25px] h-[25px] cursor-pointer"
                      alt="Stakeholder Chats"
                      src={StakeholderChatsIcon}
                      onClick={() => {
                        refreshUnread(); // Refresh from WebSocket
                        fetchStakeholderChats(); // Also fetch for modal display
                        setShowStakeholderChats(true);
                      }}
                    />
                    {stakeholderChatCount > 0 && (
                      <div className={`absolute -top-1 -right-1 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center ${
                        stakeholderChatCount > 9 ? 'px-1 min-w-[20px]' : 'w-4 h-4'
                      }`}>
                        <span className="font-semibold text-white text-[10px]">
                          {formatCount(stakeholderChatCount)}
                        </span>
                      </div>
                    )}
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        Stakeholder Chats
                      </div>
                      <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>


                  {/* My Tasks */}
                  <div className="relative group">
                    <img
                      className="w-[25px] h-[25px] cursor-pointer"
                      alt="My Tasks"
                      src={MyTasksIcon}
                      onClick={() => {
                        fetchMyTasks();
                        setShowMyTasks(true);
                      }}
                    />
                    {myTasksCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                        <span className="font-semibold text-white text-[10px]">
                          {myTasksCount}
                        </span>
                      </div>
                    )}
                    {/* Tooltip */}
                    <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="font-semibold text-black text-xs whitespace-nowrap">
                        My Tasks
                      </div>
                      <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Volume Section (Top Row) */}
              <section className="w-full">
                <div className="flex gap-6 mt-5">
                  {volumeCards.map((card, index) => (
                    <div
                      key={index}
                      className="flex-1 bg-[#6B1176] rounded-lg cursor-pointer transition-all drop-shadow-[0_3px_3px_rgba(0,0,0,0.10)] h-[123px] hover:drop-shadow-[0_3px_3px_rgba(0,0,0,0.18)] relative overflow-hidden"
                      onClick={() => {
                        if (card.alt === 'My Tasks') {
                          fetchMyTasks();
                          setShowMyTasks(true);
                        } else if (card.alt === 'Track Shipment') {
                          setShowTrackShipment(true);
                        }
                      }}
                    >
                      {/* Background Graphic - Subtle Icon */}
                      <div className="absolute bottom-0 right-0 opacity-5 translate-x-[30%] translate-y-[20%]">
                        <img
                          className="w-24 h-24"
                          alt={`${card.alt} background`}
                          src={card.icon}
                        />
                      </div>

                      {/* Content */}
                      <div className="relative h-full px-3 py-4">
                        {/* Icon at Top Left */}
                        <div className="absolute top-4 left-4">
                          <img
                            className="w-[18px] h-[18px]"
                            alt={card.alt}
                            src={card.icon}
                          />
                        </div>

                        {/* Title - Centered */}
                        <div className="font-semibold text-white text-[14px] text-left mt-8 mb-1 whitespace-nowrap">
                          {card.label}
                        </div>

                        {/* Description - Centered */}
                        <div className="text-white opacity-90 text-[11px] text-left w-[120px]">
                          {card.description}
                        </div>

                        {/* Arrow Button at Bottom Right */}
                        <div className="absolute bottom-0 right-0">
                          <button
                            className="w-[26px] h-[24px] bg-[#9C3AA6] rounded-tl-lg flex items-center justify-center transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (card.alt === 'Track Shipment') {
                                setShowTrackShipment(true);
                              }
                            }}
                          >
                            <img
                              className="w-[14px] h-[14px]"
                              alt="Next"
                              src={NextIcon}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Risk and Compliance Section */}
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Risk Section */}
                <div className="flex-1 bg-[#fff3ee] rounded-lg border border-[#E7E1E1] p-5 h-[349px] flex flex-col items-center">
                  <div className="w-full mb-12">
                    <h3 className="font-semibold text-black text-base">
                      Risk
                    </h3>
                  </div>

                  <div className="relative w-[185px] h-[92px] mb-12 flex items-center justify-center">
                    <CurveBar
                      percentage={loading ? 0 : riskMetrics?.deviation_percentage || 0}
                      color="#ff6b35"
                      size="md"
                      gradient={{
                        id: 'riskGradient',
                        x1: '0%',
                        y1: '0%',
                        x2: '100%',
                        y2: '0%',
                        stops: [
                          { offset: '0%', color: 'rgba(244, 149, 0, 1)' },
                          { offset: '100%', color: 'rgba(234, 88, 12, 1)' }
                        ]
                      }}
                    />
                    <div className="absolute mt-[25px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                      <div className="font-semibold text-black text-[28px] whitespace-nowrap">
                        {loading ? '...' : riskMetrics?.deviation_percentage || 0}%
                      </div>
                      <div className="font-normal text-black text-[12px] whitespace-nowrap">
                        Deviation
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-[7px] mb-3 mt-6">
                    <img
                      className="w-[18px] h-[18px]"
                      alt="Risk"
                      src={RiskIcon}
                    />
                    <div className="font-normal text-black text-[12px] whitespace-nowrap">
                      Top Risk Driver
                    </div>
                  </div>

                  <div className="h-[30px] bg-[#ffffff] rounded-[10px] px-4">
                    <span className="font-semibold text-orange-600 text-xs whitespace-nowrap mt-2 py-3">
                      {loading ? '...' : riskMetrics?.top_risk_driver?.name || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Compliance Section */}
                <div className="flex-1 bg-[#e4f5ff] rounded-lg border border-[#E7E1E1] p-5 flex flex-col items-center ">
                  <h2 className="self-start font-semibold text-black text-base">
                    Shipment Status
                  </h2>

                  <div className="relative flex items-center justify-center w-[185px] h-[92px] mt-12 mb-6">
                    <CurveBar
                      percentage={loading ? 0 : successRate?.success_rate || 0}
                      color="#1083c5"
                      size="md"
                      gradient={{
                        id: 'complianceGradient',
                        x1: '0%',
                        y1: '0%',
                        x2: '100%',
                        y2: '0%',
                        stops: [
                          { offset: '0%', color: 'rgba(0, 120, 183, 1)' },
                          { offset: '100%', color: 'rgba(0, 152, 240, 1)' }
                        ]
                      }}
                    />
                    <div className="absolute mt-[25px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                      <div className="font-semibold text-black text-[28px]">
                        {loading ? '...' : successRate?.success_rate != null ? `${successRate.success_rate}%` : '0%'}
                      </div>
                      <div className="font-normal text-black text-[12px]">
                        Success Rate
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2 mt-12">
                    <img
                      className="w-[18px] h-[18px]"
                      alt="Compliance icon"
                      src={ComplianceIcon}
                    />
                    <span className="font-normal text-black text-[12px] whitespace-nowrap">
                      Emissions per Treatment
                    </span>
                  </div>

                  <div className="bg-[#ffffff] px-4 h-[30px] rounded-[10px] mt-0 gap-1 flex items-center justify-center">
                    <span className="font-bold text-[#1083c5] text-sm">
                      {loading ? '...' : complianceMetrics?.emissions_per_treatment_tco2e || 0}
                    </span>
                    <span className="ml-0.5 font-normal text-black text-[10px] mt-1">
                      tCO2e
                    </span>
                  </div>
                </div>
                </div>
              </div>
            </div>
              {/* Ongoing Treatments Section */}
              <section>
                <h2 className="font-semibold text-black text-base mb-4">
                  Ongoing Treatments
                </h2>
                <OngoingTreatments />
              </section>
            </>
          )}
        </div>
      </main>

      {/* Critical Alerts Modal */}
      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={transformedAlerts}
        loading={loadingAlerts}
        patientIdLabel={isIVF ? 'Tank Code' : 'Patient ID'}
      />

      {/* My Tasks Modal */}
      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={transformedTasks}
        loading={loadingTasks}
        variant="dashboard"
      />

      {/* Stakeholder Chats Modal */}
      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
        loading={loadingChats}
      />


      {/* Track Shipment Modal */}
      <TrackShipmentModal
        isOpen={showTrackShipment}
        onClose={() => {
          setTrackError(undefined);
          setShowTrackShipment(false);
        }}
        error={trackError}
        onTrack={async (pid) => {
          try {
            setTrackError(undefined);
            await patientService.getPatientById(pid);
            setShowTrackShipment(false);
            navigate(`/track/${encodeURIComponent(pid)}`);
          } catch (e: any) {
            const msg = (e?.message as string) || 'Failed to fetch patient';
            setTrackError(msg);
          }
        }}
      />

      {/* Track Canister Modal */}
      <TrackCanisterModal
        isOpen={showTrackCanister}
        onClose={() => {
          setCanisterError(undefined);
          setShowTrackCanister(false);
        }}
        error={canisterError}
        onTrack={(canisterId) => {
          setCanisterError(undefined);
          setShowTrackCanister(false);
          navigate(`/ivf-track-shipment/${encodeURIComponent(canisterId)}`);
        }}
      />

      {/* Outbound Quality Tracking Modal */}
      <TrackCanisterModal
        isOpen={showOutboundQualityTracking}
        onClose={() => {
          setOutboundQualityTrackingError(undefined);
          setShowOutboundQualityTracking(false);
        }}
        error={outboundQualityTrackingError}
        title="Outbound Quality Tracking"
        icon={OutboundModelIcon}
        onTrack={(canisterId) => {
          setOutboundQualityTrackingError(undefined);
          setShowOutboundQualityTracking(false);
          navigate(`/outbound-quality-tracking/${encodeURIComponent(canisterId)}`);
        }}
      />
    </div>
  );
}
