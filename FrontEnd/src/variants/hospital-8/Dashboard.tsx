/**
 * @variant DashboardHospital8
 * @hospital ID: 8
 * @route /dashboard
 * @baseComponent pages/Dashboard
 *
 * Refrigerator-only Dashboard for Hospital 8.
 *
 * Hospital 8 only operates the refrigerator module (no cryotanks,
 * incubators, or embryo grading). This variant features a full-bleed 3D
 * geographic visualization of branch locations with refrigerator metrics,
 * alert status, and route connections. Stat cards, charts, and gauges float
 * over the map; the Alerts / Messages / Tasks stat cards open their modals.
 *
 * Registry key: DashboardHospital8 (auto from hospital-8/Dashboard.tsx)
 */

import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  Bell,
  TrendingUp,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  CheckSquare,
  ShieldCheck,
  Activity,
  Refrigerator,
  Lightbulb,
  Calendar,
  ChevronDown,
  LayoutGrid,
  Thermometer,
  Droplets,
  Gauge,
  Inbox,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useOnboardingMode } from "../../contexts/OnboardingModeContext";
import CriticalAlertsModal from "../../components/CriticalAlertsModal";
import MyTasksModal, { type MyTask } from "../../components/MyTasksModal";
import StakeholderChatsModal from "../../components/StakeholderChatsModal";
import {
  ivfAlertsService,
  type IVFAlert,
} from "../../services/ivfAlertsService";
import { tasksService, type Task } from "../../services/tasksService";
import {
  chatService,
  type UnreadMessageResponse,
} from "../../services/chatService";
import { userService } from "../../services/userService";
import { useDashboardChatWebSocket } from "../../hooks/useChatWebSocket";
import Map3DContainer, {
  type Map3DContainerHandle,
} from "./components/Map3DContainer";
import DashboardCard from "./components/DashboardCard";
import NoiseOverlay from "./components/NoiseOverlay";
// import abstractBg from "../../assets/aaabstract.png";
import brandLogo from "../../assets/mGScale.svg";
import { mapService } from "./services/mapService";
import {
  refrigeratorDashboardService,
  type DeviationTrendResponse,
  type DeviationsByCategoryResponse,
  type TopKpiResponse,
  type BranchCriticalDistributionResponse,
  type OperationsResponse,
  type TemperatureHumidityTrendResponse,
} from "./services/refrigeratorDashboardService";
import type { BranchMetrics } from "./types/map";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
);

const BRAND_FULL = 'mgSCALE | ColdSense';

const BRAND_STYLES = `
  @keyframes brand-shimmer {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(120%); }
  }
  @keyframes brand-cursor {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
`;

const INTRO_STYLES = `
  @keyframes intro-left {
    from { opacity: 0; transform: translateX(-48px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes intro-right {
    from { opacity: 0; transform: translateX(48px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes intro-zoom {
    from { opacity: 0; transform: scale(1.16); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes intro-drop {
    from { opacity: 0; transform: translateY(-22px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes throb-pulse {
    0%, 100% { transform: scale(0.92); opacity: 0.9; }
    50%      { transform: scale(1.05); opacity: 1; }
  }
  @keyframes throb-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes throb-spin-rev {
    from { transform: rotate(0deg); }
    to   { transform: rotate(-360deg); }
  }
  @keyframes throb-dots {
    0%, 80%, 100% { opacity: 0.25; }
    40%           { opacity: 1; }
  }
  @keyframes loading-word {
    0%   { opacity: 0; transform: translateY(5px); }
    16%  { opacity: 1; transform: translateY(0); }
    84%  { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-5px); }
  }

  .intro-zoom  { animation: intro-zoom 1s cubic-bezier(0.22,1,0.36,1) both; }
  .intro-drop  { animation: intro-drop 0.7s cubic-bezier(0.22,1,0.36,1) both; }

  .intro-col-left  > * { animation: intro-left  0.7s cubic-bezier(0.22,1,0.36,1) both; }
  .intro-col-right > * { animation: intro-right 0.7s cubic-bezier(0.22,1,0.36,1) both; }
  .intro-col-left  > *:nth-child(1),
  .intro-col-right > *:nth-child(1) { animation-delay: 0.10s; }
  .intro-col-left  > *:nth-child(2),
  .intro-col-right > *:nth-child(2) { animation-delay: 0.20s; }
  .intro-col-left  > *:nth-child(3),
  .intro-col-right > *:nth-child(3) { animation-delay: 0.30s; }
  .intro-col-left  > *:nth-child(4),
  .intro-col-right > *:nth-child(4) { animation-delay: 0.40s; }

  @keyframes insight-drain {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: 50.27; }
  }
  @keyframes insight-fadein {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

// Per-card hover micro-interactions, each peculiar to the card's content.
const HOVER_STYLES = `
  /* Operations chevrons beckon rightward */
  @keyframes hover-beckon {
    0%, 100% { transform: translateX(0); }
    50%      { transform: translateX(3px); }
  }
  /* Avg Conditions — humidity droplet drips down */
  @keyframes hover-drip {
    0%, 60%, 100% { transform: translateY(0); }
    30%           { transform: translateY(2.5px); }
  }
`;

const GLITCH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_\\/[]{}=+*^?#·@%&";

// Continuously types each character in after shuffling through cryptic glitch
// characters, then holds and advances to the next phrase, looping forever.
const ScrambleText: React.FC<{
  text: string | string[];
  className?: string;
  style?: React.CSSProperties;
}> = ({ text, className, style }) => {
  const phrases = Array.isArray(text) ? text : [text];
  const key = JSON.stringify(phrases);

  const [cells, setCells] = useState<{ ch: string; settled: boolean }[]>(() =>
    (phrases[0] ?? "").split("").map((ch) => ({ ch, settled: true })),
  );

  useEffect(() => {
    const list = JSON.parse(key) as string[];
    if (list.length === 0) return;

    const staggered = (chars: string[]) =>
      chars.map((_, i) => 4 + i + Math.floor(Math.random() * 7));

    const holdFrames = 64; // ~2.9s settled before scrambling to the next phrase
    let phraseIdx = 0;
    let chars = list[0].split("");
    let settleAt = staggered(chars);
    let maxFrame = Math.max(0, ...settleAt);
    let frame = 0;

    const id = setInterval(() => {
      setCells(
        chars.map((realCh, i) => {
          if (realCh === " ") return { ch: " ", settled: true };
          if (frame >= settleAt[i]) return { ch: realCh, settled: true };
          return {
            ch: GLITCH_CHARS[(Math.random() * GLITCH_CHARS.length) | 0],
            settled: false,
          };
        }),
      );
      frame++;
      if (frame >= maxFrame + holdFrames) {
        phraseIdx = (phraseIdx + 1) % list.length;
        chars = list[phraseIdx].split("");
        settleAt = staggered(chars);
        maxFrame = Math.max(0, ...settleAt);
        frame = 0;
      }
    }, 45);

    return () => clearInterval(id);
  }, [key]);

  return (
    <span className={className} style={style}>
      {cells.map((c, i) => (
        <span key={i} style={c.settled ? undefined : { color: "#c084fc", opacity: 0.7 }}>
          {c.ch}
        </span>
      ))}
    </span>
  );
};

const LOADING_WORDS = [
  "Collecting Insights for you",
  "Preparing your Dashboard",
  "Establishing Secure Connection",
  "Initialising Live Data Stream",
  "Loading your Maps",
];

// Cycles through the loading phrases, fading each in and out.
const LoadingWords: React.FC = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % LOADING_WORDS.length), 1900);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={idx}
      className="text-xs font-semibold text-gray-500"
      style={{ animation: "loading-word 1.9s ease-in-out" }}
    >
      {LOADING_WORDS[idx]}
    </span>
  );
};

type RangePreset = '7d' | '30d' | 'custom';
type CardRange = 'global' | '7d' | '30d';

interface InsightSlide {
  bigValue: string;
  colorClass: string;
  arrow: 'up' | 'down' | null;
  arrowClass: string;
  headline: string;
  sub: string;
}

interface StakeholderChat {
  id: string;
  sender: string;
  patientId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

function cardRangeToTs(cardRange: CardRange, globalFromTs: number, globalToTs: number): { fromTs: number; toTs: number } {
  if (cardRange === 'global') return { fromTs: globalFromTs, toTs: globalToTs };
  const now = Date.now();
  return { fromTs: now - (cardRange === '7d' ? 7 : 30) * 864e5, toTs: now };
}

const fmtShortDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Shift a yyyy-mm-dd date string by N days, returning yyyy-mm-dd
const shiftDay = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function rangeLabelOf(preset: RangePreset, from: string, to: string): string {
  if (preset === '7d') return 'Last 7 days';
  if (preset === '30d') return 'Last 30 days';
  if (from && to) return `${fmtShortDate(from)} – ${fmtShortDate(to)}`;
  return 'Custom range';
}

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

const TrendDelta: React.FC<{ delta: number | null; className?: string }> = ({ delta, className = '' }) => {
  if (delta === null) return <span className={`text-[11px] text-gray-400 ${className}`}>—</span>;
  if (delta >= 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-500 ${className}`}>
        <ArrowUpRight size={11} /> +{delta}%
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 ${className}`}>
      <ArrowDownRight size={11} /> {delta}%
    </span>
  );
};

const CardRangeSelect: React.FC<{ value: CardRange; onChange: (v: CardRange) => void; globalLabel: string; globalPreset: RangePreset }> = ({ value, onChange, globalLabel, globalPreset }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value as CardRange)}
    className="text-[10px] font-semibold text-gray-500 bg-transparent border-none outline-none cursor-pointer hover:text-gray-700"
  >
    {/* The global option already shows the active range, so hide the preset that
        would duplicate it — unless this card is explicitly set to that override. */}
    <option value="global">{globalLabel}</option>
    {(globalPreset !== '7d' || value === '7d') && <option value="7d">Last 7 days</option>}
    {(globalPreset !== '30d' || value === '30d') && <option value="30d">Last 30 days</option>}
  </select>
);

const DashboardHospital8: React.FC = () => {
  const { isAuthenticated, userRole } = useAuth();
  const isOnboarding = useOnboardingMode();

  const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [showStakeholderChats, setShowStakeholderChats] = useState(false);

  const [refrigeratorAlerts, setRefrigeratorAlerts] = useState<IVFAlert[]>([]);
  const [loadingRefrigeratorAlerts, setLoadingRefrigeratorAlerts] = useState(false);

  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [stakeholderChats, setStakeholderChats] = useState<StakeholderChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [apiUnreadCount, setApiUnreadCount] = useState(0);

  const mapRef = useRef<Map3DContainerHandle>(null);

  const [branches, setBranches] = useState<BranchMetrics[]>([]);
  const [hoveredBranch, setHoveredBranch] = useState<number | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<BranchMetrics | null>(null);

  const [typedIndex, setTypedIndex] = useState(0);

  // Intro / loader orchestration
  const [mapReady, setMapReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hideLoader, setHideLoader] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  // ── Date range filter ───────────────────────────────────────────────
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Draft values for the custom-range inputs; committed to customFrom/customTo on Apply
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [showRangeMenu, setShowRangeMenu] = useState(false);

  // Per-card range overrides
  const [topKpiRange, setTopKpiRange] = useState<CardRange>('global');
  const [trendRange, setTrendRange] = useState<CardRange>('global');
  const [combinedRange, setCombinedRange] = useState<CardRange>('global');
  const [avgRange, setAvgRange] = useState<CardRange>('global');

  // Dashboard data states
  const [trendData, setTrendData] = useState<DeviationTrendResponse | null>(null);
  const [categoryData, setCategoryData] = useState<DeviationsByCategoryResponse | null>(null);
  const [kpiGridData, setKpiGridData] = useState<DeviationsByCategoryResponse | null>(null);
  const [topKpiData, setTopKpiData] = useState<TopKpiResponse | null>(null);
  const [pieData, setPieData] = useState<BranchCriticalDistributionResponse | null>(null);
  const [opsData, setOpsData] = useState<OperationsResponse | null>(null);
  const [tempHumidity, setTempHumidity] = useState<TemperatureHumidityTrendResponse | null>(null);

  const [insightIdx, setInsightIdx] = useState(0);
  const [insightPaused, setInsightPaused] = useState(false);
  const [arcResetKey, setArcResetKey] = useState(0);

  // ── Derived timestamps ──────────────────────────────────────────────
  const { globalFromTs, globalToTs } = useMemo(() => {
    const now = Date.now();
    if (rangePreset === '7d') return { globalFromTs: now - 7 * 864e5, globalToTs: now };
    if (rangePreset === '30d') return { globalFromTs: now - 30 * 864e5, globalToTs: now };
    if (customFrom && customTo) {
      return {
        globalFromTs: new Date(customFrom).getTime(),
        globalToTs: new Date(customTo + 'T23:59:59').getTime(),
      };
    }
    return { globalFromTs: now - 7 * 864e5, globalToTs: now };
  }, [rangePreset, customFrom, customTo]);

  const topKpiTs = useMemo(() => cardRangeToTs(topKpiRange, globalFromTs, globalToTs), [topKpiRange, globalFromTs, globalToTs]);
  const trendTs = useMemo(() => cardRangeToTs(trendRange, globalFromTs, globalToTs), [trendRange, globalFromTs, globalToTs]);
  const combinedTs = useMemo(() => cardRangeToTs(combinedRange, globalFromTs, globalToTs), [combinedRange, globalFromTs, globalToTs]);
  const avgTs = useMemo(() => cardRangeToTs(avgRange, globalFromTs, globalToTs), [avgRange, globalFromTs, globalToTs]);

  // Label for the global range, shown as the "global" option in each card's range select.
  const globalRangeLabel = rangeLabelOf(rangePreset, customFrom, customTo);

  const branchId = selectedBranch?.branch_id ?? null;

  // ── Intro effects ───────────────────────────────────────────────────
  useEffect(() => {
    if (loadingMap) setMapReady(false);
  }, [loadingMap]);

  useEffect(() => {
    if (loadingMap || mapReady) return;
    const t = setTimeout(() => setMapReady(true), 6000);
    return () => clearTimeout(t);
  }, [loadingMap, mapReady]);

  useEffect(() => {
    if (loadingMap || !mapReady) {
      setRevealed(false);
      setHideLoader(false);
      return;
    }
    const t = setTimeout(() => setRevealed(true), 120);
    return () => clearTimeout(t);
  }, [loadingMap, mapReady]);

  useEffect(() => {
    if (!revealed) {
      setIntroDone(false);
      return;
    }
    const loaderT = setTimeout(() => setHideLoader(true), 650);
    const doneT = setTimeout(() => setIntroDone(true), 1300);
    return () => {
      clearTimeout(loaderT);
      clearTimeout(doneT);
    };
  }, [revealed]);

  useEffect(() => {
    if (!revealed) {
      setTypedIndex(0);
      return;
    }
    if (typedIndex >= BRAND_FULL.length) return;
    const t = setTimeout(() => setTypedIndex((i) => i + 1), 35);
    return () => clearTimeout(t);
  }, [revealed, typedIndex]);

  // ── WebSocket for chat ──────────────────────────────────────────────
  // Generic chat WS isn't refrigerator-scoped; only the count refresh is reused.
  // The messages modal is populated from the refrigerator-specific fetch below.
  const {
    unreadCount: wsUnreadCount,
    refresh: refreshUnread,
  } = useDashboardChatWebSocket({ enabled: !isOnboarding });

  // ── Modal data fetchers ─────────────────────────────────────────────
  const fetchStakeholderChats = async () => {
    setLoadingChats(true);
    try {
      const response = await chatService.getRefrigeratorUnreadMessages();
      if (response && typeof response.total_unread === "number") {
        setApiUnreadCount(response.total_unread);
      }
      if (response?.unread_messages?.length) {
        const transformedChats: StakeholderChat[] = response.unread_messages.map(
          (msg: UnreadMessageResponse) => ({
            id: msg.message_id.toString(),
            sender: msg.sender_name,
            patientId: msg.refrigerator_code
              ? `Refrigerator: ${msg.refrigerator_code}`
              : msg.refrigerator_id
                ? `Refrigerator #${msg.refrigerator_id}`
                : "N/A",
            message: msg.message_content,
            timestamp: new Date(msg.created_at).toLocaleString(),
            isRead: false,
          })
        );
        setStakeholderChats(transformedChats);
      } else {
        setStakeholderChats([]);
        setApiUnreadCount(0);
      }
    } catch {
      setStakeholderChats((prev) => (prev.length > 0 ? prev : []));
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await tasksService.getHospitalRefrigeratorTasks();
      setMyTasks(response.tasks || []);
    } catch {
      setMyTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchRefrigeratorAlerts = async () => {
    setLoadingRefrigeratorAlerts(true);
    try {
      const response = await ivfAlertsService.getHospitalRefrigeratorAlerts();
      setRefrigeratorAlerts(response?.alerts || []);
    } catch {
      setRefrigeratorAlerts([]);
    } finally {
      setLoadingRefrigeratorAlerts(false);
    }
  };

  const fallbackBranches: BranchMetrics[] = [
    { branch_id: 1, branch_name: "Chennai", refrigerator_count: 5, active_alerts: 0, latitude: 13.0827, longitude: 80.2707 },
    { branch_id: 3, branch_name: "Hyderabad", refrigerator_count: 6, active_alerts: 2, latitude: 17.385, longitude: 78.4867 },
    { branch_id: 4, branch_name: "Mumbai", refrigerator_count: 12, active_alerts: 1, latitude: 19.076, longitude: 72.8777 },
    { branch_id: 5, branch_name: "Delhi", refrigerator_count: 9, active_alerts: 0, latitude: 28.7041, longitude: 77.1025 },
    { branch_id: 6, branch_name: "Kolkata", refrigerator_count: 7, active_alerts: 0, latitude: 22.5726, longitude: 88.3639 },
  ];

  const fetchMapData = async () => {
    setLoadingMap(true);
    try {
      const data = await mapService.getBranchesWithMetrics();
      setBranches(data?.length ? data : fallbackBranches);
    } catch (e) {
      console.error("Failed to fetch map data:", e);
      setBranches(fallbackBranches);
    } finally {
      setLoadingMap(false);
    }
  };

  useEffect(() => {
    fetchMapData();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchUnreadCount = async () => {
      try {
        const response = await chatService.getUnreadMessages();
        if (response && typeof response.total_unread === "number") {
          setApiUnreadCount(response.total_unread);
        }
      } catch {
        // unread count is not critical
      }
    };
    fetchUnreadCount();
  }, [isAuthenticated]);

  useEffect(() => {
    if (showStakeholderChats && isAuthenticated) {
      fetchStakeholderChats();
    }
  }, [showStakeholderChats, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchUserProfile = async () => {
      try {
        await userService.getProfile();
      } catch {
        // profile fetch failed
      }
    };
    fetchUserProfile();
  }, [isAuthenticated]);

  // ── Dashboard card fetch effects ────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getDeviationTrend({ ...trendTs, branchId });
      if (!cancelled) setTrendData(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, trendTs.fromTs, trendTs.toTs, branchId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getDeviationsByCategory({ ...combinedTs, branchId });
      if (!cancelled) setCategoryData(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, combinedTs.fromTs, combinedTs.toTs, branchId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getTopKpi({ ...topKpiTs, branchId });
      if (!cancelled) setTopKpiData(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, topKpiTs.fromTs, topKpiTs.toTs, branchId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getDeviationsByCategory({ ...combinedTs, branchId });
      if (!cancelled) setKpiGridData(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, combinedTs.fromTs, combinedTs.toTs, branchId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getBranchCriticalDistribution({ fromTs: globalFromTs, toTs: globalToTs });
      if (!cancelled) setPieData(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, globalFromTs, globalToTs]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getOperations({ branchId });
      if (!cancelled) setOpsData(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, branchId]);

  // Avg temp/humidity trend — follows its card range, always 24 buckets
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await refrigeratorDashboardService.getTemperatureHumidityTrend({
        fromTs: avgTs.fromTs,
        toTs: avgTs.toTs,
        branchId,
      });
      if (!cancelled) setTempHumidity(data);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, avgTs.fromTs, avgTs.toTs, branchId]);

  // ── Derived values ──────────────────────────────────────────────────
  const routes = useMemo(() => mapService.generateRoutesFromBranches(branches), [branches]);

  const totalRefrigerators = branches.reduce((sum, b) => sum + (b.refrigerator_count || 0), 0);
  const totalBranches = branches.length;
  const healthyBranches = branches.filter((b) => (b.active_alerts || 0) === 0).length;
  const networkHealth = totalBranches > 0 ? Math.round((healthyBranches / totalBranches) * 100) : 98;

  const trendSeries = trendData?.series.map((p) => p.cumulative) ?? [];

  // const areaOptions = {
  //   responsive: true,
  //   maintainAspectRatio: false,
  //   plugins: { legend: { display: false }, tooltip: { enabled: false } },
  //   scales: { x: { display: false }, y: { display: false } },
  //   elements: { point: { radius: 0 } },
  //   layout: { padding: 0 },
  // };

  const trendCardOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        display: true,
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 7 }, color: '#9ca3af', maxTicksLimit: 4, maxRotation: 0, minRotation: 0 },
      },
      y: {
        display: true,
        grid: { color: 'rgba(107,17,118,0.06)' },
        border: { display: false },
        ticks: { font: { size: 7 }, color: '#9ca3af', maxTicksLimit: 3 },
      },
    },
    elements: { point: { radius: 0 } },
    layout: { padding: { top: 4, right: 4, bottom: 0, left: 0 } },
  };

  const trendCardData = useMemo(() => ({
    labels: (trendData?.series ?? []).map((p) => fmtShortDate(p.day)),
    datasets: [{
      data: (trendData?.series ?? []).map((p) => p.cumulative),
      borderColor: '#8b3ad6',
      borderWidth: 2,
      fill: true,
      backgroundColor: 'rgba(139,58,214,0.18)',
      tension: 0.4,
      pointRadius: 0,
    }],
  }), [trendData]);

  // Avg temperature / humidity trend (wide card)
  const thPoints = tempHumidity?.points ?? [];
  const thFmtHour = (d: Date) => {
    let h = d.getHours();
    const ampm = h < 12 ? "am" : "pm";
    h = h % 12 || 12;
    return `${h}${ampm}`;
  };
  // Short hour label; prefix the date when the day changes (e.g. "1 May 1am")
  const thLabels = thPoints.map((p, i) => {
    const d = new Date(p.t);
    const prev = i > 0 ? new Date(thPoints[i - 1].t) : null;
    const dayChanged =
      !prev || prev.getDate() !== d.getDate() || prev.getMonth() !== d.getMonth();
    const hour = thFmtHour(d);
    return dayChanged
      ? `${d.getDate()} ${d.toLocaleDateString([], { month: "short" })} ${hour}`
      : hour;
  });
  const thLine = (data: (number | null)[], color: string, fill: string) => ({
    labels: thLabels,
    datasets: [{
      data,
      borderColor: color,
      borderWidth: 2,
      fill: true,
      backgroundColor: fill,
      tension: 0.4,
      pointRadius: 0,
      spanGaps: true,
      // Point markers reveal only on hover (overlay)
      pointHoverRadius: 4,
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: "#ffffff",
      pointHoverBorderWidth: 2,
      pointHitRadius: 12,
    }],
  });
  const tempChartData = thLine(thPoints.map((p) => p.temperature), "#8b3ad6", "rgba(139,58,214,0.12)");
  const humChartData = thLine(thPoints.map((p) => p.humidity), "#3b9ef0", "rgba(59,158,240,0.12)");
  const thOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: "index" as const,
        intersect: false,
        callbacks: {
          title: (items: any) => {
            const i = items?.[0]?.dataIndex;
            return i != null && thPoints[i]
              ? new Date(thPoints[i].t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "";
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: { display: false },
        ticks: {
          font: { size: 8 },
          color: "#9ca3af",
          autoSkip: true,
          maxRotation: 0,
          minRotation: 0,
          maxTicksLimit: 6,
        },
      },
      y: { display: false },
    },
    elements: { point: { radius: 0 } },
    layout: { padding: 0 },
  };

  // const makeArea = (points: number[], color: string, fillColor?: string) => ({
  //   labels: points.map((_, i) => i),
  //   datasets: [
  //     {
  //       data: points,
  //       borderColor: color,
  //       borderWidth: 2,
  //       fill: true,
  //       backgroundColor: fillColor ?? `${color}22`,
  //       tension: 0.4,
  //       pointRadius: 0,
  //     },
  //   ],
  // });

  // Branch concentration (feeds the insight slides)
  const pieBranches = pieData?.branches ?? [];

  // Per-KPI alert counts (bottom-left grid)
  const kpiAlerts = kpiGridData?.categories ?? [];
  const maxKpiAlert = kpiAlerts.length ? Math.max(...kpiAlerts.map((c) => c.count)) : 1;

  // Category bars
  const cats = categoryData?.categories ?? [];
  const maxCatPct = cats.length ? Math.max(...cats.map((c) => c.pct)) : 1;
  const CAT_COLORS = ['#6b1176', '#9333ea', '#a855f7', '#c084fc', '#d8b4fe'];

  const insights = useMemo<InsightSlide[]>(() => {
    const list: InsightSlide[] = [];

    list.push({
      bigValue: `${networkHealth}%`,
      colorClass: 'text-white',
      arrow: 'up',
      arrowClass: 'text-emerald-400',
      headline: 'of refrigerators are healthy',
      sub: `${healthyBranches} of ${totalBranches} branches operating within normal ranges.`,
    });

    if (trendData && trendData.delta_pct !== null) {
      const pos = trendData.delta_pct >= 0;
      list.push({
        bigValue: `${pos ? '+' : ''}${trendData.delta_pct}%`,
        colorClass: pos ? 'text-rose-300' : 'text-emerald-300',
        arrow: pos ? 'up' : 'down',
        arrowClass: pos ? 'text-rose-400' : 'text-emerald-400',
        headline: pos ? 'increase in refrigerator deviations' : 'fewer refrigerator deviations',
        sub: `${trendData.total.toLocaleString()} total alerts this period vs ${trendData.previous_total.toLocaleString()} in the previous window.`,
      });
    } else if (trendData && trendData.total > 0) {
      list.push({
        bigValue: trendData.total.toLocaleString(),
        colorClass: 'text-white',
        arrow: null,
        arrowClass: '',
        headline: 'refrigerator deviations this period',
        sub: 'No prior period to compare — first tracked window.',
      });
    }

    if (topKpiData?.kpi_name) {
      if (topKpiData.delta_pct !== null) {
        const pos = topKpiData.delta_pct >= 0;
        list.push({
          bigValue: `${pos ? '+' : ''}${topKpiData.delta_pct}%`,
          colorClass: pos ? 'text-rose-300' : 'text-emerald-300',
          arrow: pos ? 'up' : 'down',
          arrowClass: pos ? 'text-rose-400' : 'text-emerald-400',
          headline: `change in ${topKpiData.label} alerts`,
          sub: `${topKpiData.count.toLocaleString()} ${topKpiData.label} alerts this period — top deviated KPI.`,
        });
      } else {
        list.push({
          bigValue: topKpiData.count.toLocaleString(),
          colorClass: 'text-rose-300',
          arrow: 'up',
          arrowClass: 'text-rose-400',
          headline: `${topKpiData.label} leads deviations`,
          sub: `${topKpiData.count.toLocaleString()} alerts — leading category with no prior comparison.`,
        });
      }
    }

    if (pieBranches.length > 0) {
      const top = pieBranches[0];
      list.push({
        bigValue: `${top.pct}%`,
        colorClass: 'text-rose-300',
        arrow: 'up',
        arrowClass: 'text-rose-400',
        headline: `of critical alerts at ${top.branch_name}`,
        sub: `${top.count.toLocaleString()} High severity alerts — highest concentration of any branch.`,
      });
    }

    if (opsData) {
      const total = opsData.active_alerts + opsData.unread_messages + opsData.active_tasks;
      if (total > 0) {
        list.push({
          bigValue: total.toLocaleString(),
          colorClass: 'text-rose-300',
          arrow: 'up',
          arrowClass: 'text-rose-400',
          headline: 'open items need attention',
          sub: `${opsData.active_alerts} active alerts · ${opsData.unread_messages} unread messages · ${opsData.active_tasks} active tasks.`,
        });
      } else {
        list.push({
          bigValue: '0',
          colorClass: 'text-emerald-300',
          arrow: 'down',
          arrowClass: 'text-emerald-400',
          headline: 'open items — all clear',
          sub: 'No active alerts, messages, or pending tasks at this time.',
        });
      }
    }

    return list;
  }, [networkHealth, healthyBranches, totalBranches, trendData, topKpiData, pieBranches, opsData]);

  const safeInsightIdx = insights.length > 0 ? insightIdx % insights.length : 0;

  useEffect(() => {
    if (insights.length <= 1 || insightPaused) return;
    const t = setTimeout(() => setInsightIdx((i) => (i + 1) % insights.length), 5000);
    return () => clearTimeout(t);
  }, [safeInsightIdx, insightPaused, insights.length]);

  // Modal transforms
  const transformedAlerts = refrigeratorAlerts.map((alert) => {
    const severity: "Low" | "Medium" | "High" | "Critical" =
      alert.severity === "High" ? "High" : alert.severity === "Medium" ? "Medium" : "Low";
    return {
      id: alert.alert_id,
      type: alert.alert_type,
      severity,
      patientId: alert.refrigerator_code ? alert.refrigerator_code : (alert.tank_code ?? "N/A"),
      branchName: (alert as IVFAlert & { branch_name?: string }).branch_name,
      dedupKey: (alert as IVFAlert & { dedup_key?: string }).dedup_key,
      message: alert.message,
      timestamp: new Date(alert.occurred_at + "Z") + "",
      status: (alert.status === "Active" ? "Active" : "Acknowledged") as "Active" | "Acknowledged" | "Resolved" | "Escalated",
      acknowledgementReason: alert.acknowledgment_reason,
    };
  });

  const transformedTasks: MyTask[] = myTasks.map((task) => {
    try {
      return {
        id: task.id.toString(),
        patientId: task.patient_id || "N/A",
        tankCode: task.tank_code || undefined,
        taskName: task.task_name,
        description: task.description || "",
        assigneeBy: task.created_by
          ? `${task.created_by.first_name || ""} ${task.created_by.last_name || ""}`.trim() || "Unknown"
          : "Unknown",
        assignedTo: task.assignee
          ? `${task.assignee.first_name || ""} ${task.assignee.last_name || ""}`.trim() || "Unknown"
          : "Unknown",
        dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : "N/A",
        priority: task.priority,
        status: task.status,
      };
    } catch {
      return {
        id: task.id?.toString() || "unknown",
        patientId: task.patient_id || "N/A",
        tankCode: task.tank_code || undefined,
        taskName: task.task_name || "Unknown Task",
        description: task.description || "",
        assigneeBy: "Unknown",
        assignedTo: "Unknown",
        dueDate: "N/A",
        priority: task.priority || "Medium",
        status: task.status || "Not started",
      };
    }
  });

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the dashboard.</p>
      </div>
    );
  }

  const statRows = [
    {
      key: "alerts",
      label: "Active Alerts",
      value: opsData?.active_alerts ?? 0,
      Icon: Bell,
      tile: "bg-[#6b1176] text-white",
      onClick: () => {
        fetchRefrigeratorAlerts();
        setShowCriticalAlerts(true);
      },
    },
    {
      key: "messages",
      label: "Messages",
      value: opsData?.unread_messages ?? Math.max(wsUnreadCount || 0, apiUnreadCount || 0),
      Icon: MessageSquare,
      tile: "bg-[#9333ea] text-white",
      onClick: () => {
        refreshUnread();
        fetchStakeholderChats();
        setShowStakeholderChats(true);
      },
    },
    {
      key: "tasks",
      label: "Active Tasks",
      value: opsData?.active_tasks ?? 0,
      Icon: CheckSquare,
      tile: "bg-[#b56ee0] text-white",
      onClick: () => {
        fetchMyTasks();
        setShowMyTasks(true);
      },
    },
  ];

  return (
    <>
      <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-[#F4ECFB] via-[#FBF8FF] to-[#F2E9FA]">
        {/* Abstract background image */}
        {/* <img
          src={abstractBg}
          aria-hidden="true"
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{ zIndex: 0 }}
        /> */}

        <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'url(/ivf_pattern.png)', backgroundSize: '20%', backgroundRepeat: 'repeat', opacity: 0.30 }} />
            

        <style>{INTRO_STYLES}</style>
        <style>{HOVER_STYLES}</style>

        {/* Full-bleed map */}
        <div className="absolute inset-0">
          {!loadingMap && (
            <div
              className={`absolute top-0 bottom-0 left-0 ${revealed && !introDone ? "intro-zoom" : ""}`}
              style={{ width: "142%", opacity: revealed ? undefined : 0 }}
            >
              <Map3DContainer
                ref={mapRef}
                branches={branches}
                routes={routes}
                hoveredBranch={hoveredBranch}
                onBranchHover={setHoveredBranch}
                onBranchClick={(branch) => setSelectedBranch(branch)}
                selectedBranch={selectedBranch}
                onClosePopup={() => setSelectedBranch(null)}
                pitch={20}
                onMapReady={() => setMapReady(true)}
              />
            </div>
          )}
        </div>

        {/* Logo throbber */}
        {!hideLoader && (
          <div
            className="absolute inset-0 z-[70] flex flex-col items-center justify-center"
            style={{
              background: "radial-gradient(ellipse at center, #FBF8FF 0%, #F2E9FA 55%, #EADbF7 100%)",
              opacity: revealed ? 0 : 1,
              transition: "opacity 0.6s ease",
              pointerEvents: revealed ? "none" : "auto",
            }}
          >
            <div className="relative flex items-center justify-center w-36 h-36">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "conic-gradient(from 0deg, transparent 0deg, rgba(107,17,118,0.05) 120deg, #6b1176 340deg, transparent 360deg)",
                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                  animation: "throb-spin 1.1s linear infinite",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  inset: 16,
                  background: "conic-gradient(from 180deg, transparent 0deg, rgba(192,132,252,0.08) 140deg, #c084fc 330deg, transparent 360deg)",
                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
                  animation: "throb-spin-rev 1.6s linear infinite",
                }}
              />
              <div
                aria-label="mgSCALE"
                className="relative w-16 h-16"
                style={{
                  backgroundColor: "#6b1176",
                  WebkitMask: `url(${brandLogo}) center / contain no-repeat`,
                  mask: `url(${brandLogo}) center / contain no-repeat`,
                  animation: "throb-pulse 1.5s ease-in-out infinite",
                }}
              />
            </div>
            <div className="mt-7 flex flex-col items-center gap-2">
              <p className="text-sm font-black tracking-tight text-gray-800">
                mgSCALE <span className="text-gray-300 font-thin">|</span>{" "}
                <span style={{ color: "#6b1176" }}>ColdSense</span>
              </p>
              <div className="h-4 flex items-center justify-center">
                <LoadingWords />
              </div>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "#6b1176",
                      animation: "throb-dots 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.16}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="absolute top-0 inset-x-0 z-40 flex items-start justify-between gap-4 px-6 pt-5 pointer-events-none">
          {/* Branding card */}
          <div
            className={`pointer-events-auto ${revealed && !introDone ? "intro-drop" : ""}`}
            style={{ opacity: revealed ? undefined : 0 }}
          >
            <style>{BRAND_STYLES}</style>
            <div
              className="relative overflow-hidden rounded-2xl px-4 py-3 pl-1"
              style={{
                // background: 'rgba(255,255,255,0.76)',
                // backdropFilter: 'blur(20px)',
                // WebkitBackdropFilter: 'blur(20px)',
                // border: '1px solid rgba(255,255,255,0.72)',
                // boxShadow: '0 4px 24px rgba(107,17,118,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                minWidth: 220,
              }}
            >
              {/* <div
                className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
                style={{ background: 'linear-gradient(to bottom, #6b1176, #c084fc)' }}
              /> */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)',
                  animation: 'brand-shimmer 3.6s ease-in-out infinite',
                }}
              />
              <div className="relative z-10">
                <div className="flex items-center leading-none">
                  <span className="text-[26px] font-black tracking-tight" style={{ color: '#6b1176' }}>
                    {BRAND_FULL.slice(0, Math.min(typedIndex, 7))}
                  </span>
                  {typedIndex > 7 && (
                    <span className="text-[26px] font-thin tracking-tight" style={{ color: '#6b1176'}}>
                      {BRAND_FULL.slice(7, Math.min(typedIndex, 10))}
                    </span>
                  )}
                  {typedIndex > 10 && (
                    <span className="text-[26px] font-black tracking-tight text-gray-800">
                      {BRAND_FULL.slice(10, typedIndex)}
                    </span>
                  )}
                  {typedIndex < BRAND_FULL.length && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '2px',
                        height: '20px',
                        background: '#6b1176',
                        marginLeft: '3px',
                        borderRadius: '1px',
                        verticalAlign: 'middle',
                        animation: 'brand-cursor 1.1s step-end infinite',
                      }}
                    />
                  )}
                </div>
                <p
                  className="text-[10px] text-purple-900 mt-2 tracking-wide transition-opacity duration-700"
                  style={{ opacity: typedIndex >= BRAND_FULL.length ? 1 : 0 }}
                >
                  <ScrambleText
                    text={[
                      "Alerting Systems Armed",
                      "Live Cold-Storage Monitoring",
                      "All Systems Operational",
                      "Healthcare, Elevated",
                      "One View, Complete Control",
                      "Monitor | Alert | Protect",

                    ]}
                    className="text-[14px] font-bold"
                  />
                </p>
              </div>
            </div>
          </div>

          {/* Right header controls */}
          <div
            className={`flex items-center gap-2 pointer-events-auto ${revealed && !introDone ? "intro-drop" : ""}`}
            style={{ opacity: revealed ? undefined : 0 }}
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/70 shadow-sm">
              <Refrigerator size={14} className="text-primary" />
              <span className="text-xs font-bold text-gray-800">{totalRefrigerators}</span>
              <span className="text-[10px] text-gray-400">Refrigerators</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/70 shadow-sm">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-xs font-bold text-gray-800">{networkHealth}%</span>
              <span className="text-[10px] text-gray-400">Health</span>
            </div>
            {/* Date-range selector — single button + dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRangeMenu((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/70 shadow-sm hover:bg-white transition"
              >
                <Calendar size={14} className="text-primary" />
                <span className="text-xs font-bold text-gray-800">
                  {rangeLabelOf(rangePreset, customFrom, customTo)}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-gray-400 transition-transform ${showRangeMenu ? "rotate-180" : ""}`}
                />
              </button>

              {showRangeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRangeMenu(false)} />
                  <div className="absolute right-0 mt-1.5 z-50 w-48 rounded-xl bg-white/95 backdrop-blur-md border border-white/70 shadow-lg overflow-hidden p-1">
                    {RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          if (opt.value === "custom") {
                            // Seed the draft inputs from the last applied range; don't
                            // commit until Apply is clicked.
                            setRangePreset("custom");
                            setDraftFrom(customFrom);
                            setDraftTo(customTo);
                          } else {
                            setRangePreset(opt.value);
                            setShowRangeMenu(false);
                          }
                        }}
                        className={`w-full flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition ${rangePreset === opt.value ? "bg-primary text-white" : "text-gray-600 hover:bg-primary/5"}`}
                      >
                        {opt.value === "custom" && <Calendar size={12} />}
                        {opt.label}
                      </button>
                    ))}
                    {rangePreset === "custom" && (
                      <div className="mt-1 pt-2 px-2 pb-2 border-t border-gray-100 flex flex-col gap-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">From</span>
                          <input
                            type="date"
                            value={draftFrom}
                            max={draftTo ? shiftDay(draftTo, -1) : undefined}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraftFrom(v);
                              // Keep from < to: bump To to +1 day if missing or not after From
                              if (v && (!draftTo || draftTo <= v)) setDraftTo(shiftDay(v, 1));
                            }}
                            className="text-[11px] font-medium bg-gray-50 rounded-md px-2 py-1 outline-none text-gray-700 border border-gray-200"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">To</span>
                          <input
                            type="date"
                            value={draftTo}
                            min={draftFrom ? shiftDay(draftFrom, 1) : undefined}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraftTo(v);
                              // Keep from < to: pull From back 1 day if missing or not before To
                              if (v && (!draftFrom || draftFrom >= v)) setDraftFrom(shiftDay(v, -1));
                            }}
                            className="text-[11px] font-medium bg-gray-50 rounded-md px-2 py-1 outline-none text-gray-700 border border-gray-200"
                          />
                        </div>
                        <button
                          disabled={!draftFrom || !draftTo || draftFrom >= draftTo}
                          onClick={() => {
                            setCustomFrom(draftFrom);
                            setCustomTo(draftTo);
                            setShowRangeMenu(false);
                          }}
                          className="mt-1 w-full px-3 py-1.5 rounded-lg text-xs font-bold transition bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Floating cards — row-wise grid (rows stretch to equal height) */}
        {!loadingMap && (
          <div
            className="absolute left-10 top-[136px] bottom-6 z-30 w-[572px] overflow-y-auto overflow-x-hidden pr-3 pointer-events-auto"
            style={{ opacity: revealed ? undefined : 0 }}
          >
          <div
            className={`grid grid-cols-12 items-stretch content-start gap-3 ${revealed && !introDone ? "intro-col-left" : ""}`}
          >
            {/* Top KPI card (was: Total Refrigerators) */}
            <DashboardCard
              accent="violet"
              watermark={TrendingUp}
              className="group pointer-events-auto h-full order-1 col-span-6"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp size={12} style={{ color: "#8b3ad6" }} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700">
                      Top Deviated KPI
                    </p>
                  </div>
                  <CardRangeSelect value={topKpiRange} onChange={setTopKpiRange} globalLabel={globalRangeLabel} globalPreset={rangePreset} />
                </div>
                {/* KPI name + comparison — vertically centered in the card */}
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-2xl font-extrabold text-primary leading-tight line-clamp-2 pr-16">
                    {topKpiData?.label ?? '—'}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <TrendDelta delta={topKpiData?.delta_pct ?? null} />
                    <span className="text-[10px] text-gray-400">vs previous period</span>
                  </div>
                </div>
              </div>
              {/* Count — anchored to right center */}
              <div className="absolute top-1/2 -translate-y-1/2 mt-1 right-4 flex flex-col items-end leading-none">
                <span className="text-5xl font-black text-primary leading-none inline-block origin-right transition-transform duration-300 group-hover:scale-105">
                  {(topKpiData?.count ?? 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">alerts</span>
              </div>
            </DashboardCard>

            {/* Operations card */}
            <div id="onboarding-dashboard-alerts" className="pointer-events-auto h-full order-3 col-span-5">
              <DashboardCard accent="violet" className="group h-full">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Inbox size={12} style={{ color: "#8b3ad6" }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700">
                    Operations
                  </p>
                  {selectedBranch && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold truncate max-w-[80px]">
                      {selectedBranch.branch_name}
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  {statRows.map((row, i) => (
                    <button
                      key={row.key}
                      onClick={row.onClick}
                      className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-black/5 transition text-left"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${row.tile}`}>
                        <row.Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          {row.label}
                        </p>
                        <p className="text-lg font-extrabold text-primary leading-tight">
                          {row.value}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-primary group-hover:[animation:hover-beckon_1.1s_ease-in-out_infinite]"
                        style={{ animationDelay: `${i * 130}ms` }}
                      />
                    </button>
                  ))}
                </div>
              </DashboardCard>
            </div>

            {/* Alerts by KPI + Deviations by Category — combined wide card (bottom) */}
            <DashboardCard
              accent="indigo"
              watermark={LayoutGrid}
              className="group pointer-events-auto h-full order-6 col-span-12"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <LayoutGrid size={12} style={{ color: "#6d4ae0" }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700">
                    Deviation Overview
                  </p>
                </div>
                <CardRangeSelect value={combinedRange} onChange={setCombinedRange} globalLabel={globalRangeLabel} globalPreset={rangePreset} />
              </div>
              <div className="flex items-stretch gap-4">
                {/* Left — Alerts by KPI */}
                <div className="flex-1 min-w-0 border-r border-gray-100 pr-4">
                  <p className="text-[10px] font-semibold text-gray-500 mb-2">Alerts by KPI</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Array.from({ length: 4 }).map((_, idx) => {
                      const c = kpiAlerts[idx] ?? null;
                      if (!c) {
                        return (
                          <div
                            key={`kpi-empty-${idx}`}
                            className="rounded-lg px-3 py-2.5 bg-gray-50/60 border border-gray-100 flex items-center justify-center min-h-[56px]"
                          >
                            <span className="text-[10px] text-gray-500">—</span>
                          </div>
                        );
                      }
                      const key = (c.kpi_name + ' ' + c.label).toLowerCase();
                      const KpiIcon: ElementType =
                        key.includes('temp') ? Thermometer :
                        key.includes('humid') || key.includes('moist') ? Droplets :
                        Activity;
                      const iconColor =
                        key.includes('temp') ? '#8b3ad6' :
                        key.includes('humid') || key.includes('moist') ? '#3b9ef0' :
                        '#8b3ad6';
                      return (
                        <div
                          key={c.kpi_name}
                          className="relative overflow-hidden rounded-lg px-3 py-2.5 bg-primary/[0.04] border border-primary/10 min-h-[56px]"
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/[0.07]"
                            style={{ width: `${maxKpiAlert > 0 ? (c.count / maxKpiAlert) * 100 : 0}%` }}
                          />
                          <div className="relative flex items-center justify-between gap-1">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-gray-500 leading-tight truncate" title={c.label}>
                                {c.label}
                              </p>
                              <p className="text-2xl font-black text-primary leading-none mt-0.5">
                                {c.count.toLocaleString()}
                              </p>
                            </div>
                            <KpiIcon size={32} className="shrink-0 opacity-20" style={{ color: iconColor }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right — Deviations by Category */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-500 mb-2">By Category</p>
                  {cats.length > 0 ? (
                    <>
                      <div className="flex items-end justify-between gap-2 h-24">
                        {cats.map((c, i) => (
                          <div key={c.kpi_name} className="flex-1 flex flex-col items-center justify-end h-full">
                            <span className="text-[9px] font-bold text-gray-600 mb-1 transition-transform duration-300 group-hover:-translate-y-0.5">{c.pct}%</span>
                            <div
                              className="w-full rounded-t-lg origin-bottom transition-transform duration-300 group-hover:scale-y-105"
                              style={{
                                height: `${maxCatPct > 0 ? (c.pct / maxCatPct) * 100 : 0}%`,
                                backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
                        {cats.map((c, i) => (
                          <div key={c.kpi_name} className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                            />
                            <span className="text-[10px] text-gray-600 flex-1 truncate">{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-24 flex items-center justify-center">
                      <p className="text-[10px] text-gray-400">No KPI alerts in range</p>
                    </div>
                  )}
                </div>
              </div>
            </DashboardCard>

            {/* Deviation Trend — cumulative line */}
            <DashboardCard
              accent="violet"
              className="group pointer-events-auto h-full order-2 col-span-6"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Activity size={12} style={{ color: "#8b3ad6" }} />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700">
                      Deviation Trend
                    </p>
                  </div>
                  <CardRangeSelect value={trendRange} onChange={setTrendRange} globalLabel={globalRangeLabel} globalPreset={rangePreset} />
                </div>
                {/* Left / Right split */}
                <div className="flex flex-1 min-h-0 gap-2">
                  {/* Left — count centred, delta + label pinned to bottom */}
                  <div className="w-[44%] shrink-0 flex flex-col border-r border-gray-100 pr-3">
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5">
                      <p className="text-4xl font-black text-primary leading-none transition-transform duration-300 group-hover:-translate-y-0.5">
                        {(trendData?.total ?? 0).toLocaleString()}
                      </p>
                      <TrendDelta delta={trendData?.delta_pct ?? null} />
                    </div>
                    <p className="text-[9px] text-gray-400 text-center pb-0.5">vs previous period</p>
                  </div>
                  {/* Right — chart with axes + left-edge fade */}
                  <div className="flex-1 min-w-0 relative">
                    <div className="absolute inset-0">
                      {trendSeries.length > 0 ? (
                        <Line data={trendCardData} options={trendCardOptions} />
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-[10px] text-gray-400">No data for range</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </DashboardCard>

            {/* Insights card — auto-swipe with timer arc */}
            <div
              className="group relative overflow-hidden rounded-2xl pointer-events-auto h-full order-4 col-span-7"
              style={{ background: "linear-gradient(155deg, #162114 0%, #0c180d 55%, #09140f 100%)" }}
              onMouseEnter={() => setInsightPaused(true)}
              onMouseLeave={() => { setInsightPaused(false); setArcResetKey((k) => k + 1); }}
            >
              <div
                className="absolute bottom-[-10%] left-[-5%] w-44 h-44 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(190,118,28,0.72) 0%, transparent 68%)", filter: "blur(30px)" }}
              />
              <div
                className="absolute top-[-18%] right-[5%] w-36 h-36 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(48,155,70,0.55) 0%, transparent 65%)", filter: "blur(24px)" }}
              />
              <div className="relative z-10 p-3 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center transition-colors duration-300 group-hover:bg-yellow-300/15">
                      <Lightbulb size={13} className="text-yellow-300 transition-all duration-300 group-hover:scale-125 group-hover:drop-shadow-[0_0_6px_rgba(253,224,71,0.9)]" />
                    </div>
                    <span className="text-xs font-semibold text-white">ColdSense Insights</span>
                  </div>
                  {/* 5-second drain arc */}
                  <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
                    <circle cx="11" cy="11" r="8" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                    <circle
                      key={`${safeInsightIdx}-${arcResetKey}`}
                      cx="11" cy="11" r="8"
                      fill="none"
                      stroke="rgba(255,255,255,0.75)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="50.27"
                      strokeDashoffset="0"
                      transform="rotate(-90 11 11)"
                      style={{
                        animationName: 'insight-drain',
                        animationDuration: '5s',
                        animationTimingFunction: 'linear',
                        animationFillMode: 'forwards',
                        animationPlayState: insightPaused ? 'paused' : 'running',
                      }}
                    />
                  </svg>
                </div>
                {insights.length > 0 && (
                  <div key={safeInsightIdx} className="mt-auto" style={{ animation: 'insight-fadein 0.4s ease both' }}>
                    <div className="flex items-start gap-1">
                      <span className={`text-5xl font-black tracking-tight leading-none ${insights[safeInsightIdx].colorClass}`}>
                        {insights[safeInsightIdx].bigValue}
                      </span>
                      {insights[safeInsightIdx].arrow === 'up' && (
                        <ArrowUpRight size={16} className={`${insights[safeInsightIdx].arrowClass} mt-1.5`} />
                      )}
                      {insights[safeInsightIdx].arrow === 'down' && (
                        <ArrowDownRight size={16} className={`${insights[safeInsightIdx].arrowClass} mt-1.5`} />
                      )}
                    </div>
                    <p className="text-sm font-bold text-white mt-2.5 leading-snug">
                      {insights[safeInsightIdx].headline}
                    </p>
                    <p className="text-xs text-white/40 mt-1 leading-relaxed">
                      {insights[safeInsightIdx].sub}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-3">
                  {insights.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setInsightIdx(i); setArcResetKey((k) => k + 1); }}
                      className="h-[3px] rounded-full transition-all duration-300"
                      style={{
                        width: i === safeInsightIdx ? 18 : 8,
                        backgroundColor: i === safeInsightIdx ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.22)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Avg Temperature & Humidity — wide trend card (24 points) */}
            <DashboardCard
              accent="violet"
              className="group pointer-events-auto h-full col-span-12 order-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Gauge size={12} style={{ color: "#8b3ad6" }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700">
                    Avg Conditions
                  </p>
                </div>
                <CardRangeSelect value={avgRange} onChange={setAvgRange} globalLabel={globalRangeLabel} globalPreset={rangePreset} />
              </div>
              <div className="flex items-stretch gap-4">
                {/* 30% — overall averages: temp centered in upper half, humidity in lower half */}
                <div className="w-[30%] shrink-0 flex flex-col border-r border-gray-100 pr-4">
                  {/* Upper half — temperature */}
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-1">
                    <div className="flex items-center gap-1.5">
                      <Thermometer size={12} style={{ color: "#8b3ad6" }} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
                      <p className="text-[9px] text-gray-400 uppercase tracking-wider">Avg Temperature</p>
                    </div>
                    <p className="text-3xl font-black text-primary leading-none">
                      {tempHumidity?.avg_temperature ?? '—'}
                      <span className="text-base font-bold">°C</span>
                    </p>
                  </div>

                  <div className="h-px bg-gray-100" />

                  {/* Lower half — humidity */}
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-1">
                    <div className="flex items-center gap-1.5">
                      <Droplets size={12} style={{ color: "#3b9ef0" }} className="group-hover:[animation:hover-drip_1.3s_ease-in-out_infinite]" />
                      <p className="text-[9px] text-gray-400 uppercase tracking-wider">Avg Humidity</p>
                    </div>
                    <p className="text-3xl font-black text-primary leading-none">
                      {tempHumidity?.avg_humidity ?? '—'}
                      <span className="text-base font-bold">%</span>
                    </p>
                  </div>
                </div>

                {/* 70% — two stacked graphs */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Temperature (°C)
                    </p>
                    <div className="h-20">
                      <Line data={tempChartData} options={thOptions} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Humidity (%)
                    </p>
                    <div className="h-20">
                      <Line data={humChartData} options={thOptions} />
                    </div>
                  </div>
                  {/* Interval info — centered on the graphs, always 24 points */}
                  <p className="text-[9px] text-gray-400 text-center">
                    {tempHumidity?.bucket_hours
                      ? `24 points · each ≈ ${
                          tempHumidity.bucket_hours >= 24
                            ? `${(tempHumidity.bucket_hours / 24).toFixed(tempHumidity.bucket_hours % 24 === 0 ? 0 : 1)} day${tempHumidity.bucket_hours >= 48 ? "s" : ""}`
                            : `${tempHumidity.bucket_hours} hr${tempHumidity.bucket_hours === 1 ? "" : "s"}`
                        } across the selected period`
                      : "24 points across the selected period"}
                  </p>
                </div>
              </div>
            </DashboardCard>
          </div>
          </div>
        )}

        <NoiseOverlay />
      </div>

      <CriticalAlertsModal
        isOpen={showCriticalAlerts}
        onClose={() => setShowCriticalAlerts(false)}
        alerts={transformedAlerts}
        loading={loadingRefrigeratorAlerts}
        patientIdLabel="Refrigerator"
        onAcknowledge={async (alertId, reason) => {
          await ivfAlertsService.acknowledgeAlert(alertId, reason);
          await fetchRefrigeratorAlerts();
        }}
        onAcknowledgeAll={async (alertIds, reason) => {
          await ivfAlertsService.acknowledgeAlerts(alertIds, reason);
          await fetchRefrigeratorAlerts();
        }}
      />

      <MyTasksModal
        isOpen={showMyTasks}
        onClose={() => setShowMyTasks(false)}
        tasks={transformedTasks}
        loading={loadingTasks}
        variant="refrigerator"
        userRole={userRole}
        onTaskCreated={fetchMyTasks}
      />

      <StakeholderChatsModal
        isOpen={showStakeholderChats}
        onClose={() => setShowStakeholderChats(false)}
        chats={stakeholderChats}
        loading={loadingChats}
      />
    </>
  );
};

export default DashboardHospital8;
