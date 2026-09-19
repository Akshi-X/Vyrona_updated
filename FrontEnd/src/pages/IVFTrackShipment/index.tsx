import { useParams, useNavigate } from 'react-router-dom';
import React, { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import ContainerQualityTrackingIcon from '../../assets/DashBoardIcons/CryocanDarkN.svg';
import { useAuth } from '../../contexts/AuthContext';
// import { useOnboardingMode } from '../../contexts/OnboardingModeContext';
import ContainerDataTable from './sections/ContainerDataTable';
import RefillLogTable from './sections/RefillLogTable';
import IVFQualityTrackingChart from './sections/IVFQualityTrackingChart';
import { IVFQualityParametersTable } from './sections/IVFQualityParametersTable';
import CryocanVisualizer from './sections/CryocanVisualisation';
import { useIvfKpiSnapshot } from './sections/useIvfKpiSnapshot';
import { userService, type UserProfileDto } from '../../services/userService';
// Header icons & modals
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";
import StakeholderChatsIcon from "../../assets/DashBoardIcons/Stakeholder_Chats.svg";
import MyTasksIcon from "../../assets/DashBoardIcons/My_Tasks.svg";
import CriticalAlertsModal from "../../components/CriticalAlertsModal";
import MyTasksModal, { type MyTask } from "../../components/MyTasksModal";
import StakeholderChatsModal from "../../components/StakeholderChatsModal";
import {
    ivfAlertsService,
    type IVFAlert,
} from "../../services/ivfAlertsService";
import { tasksService, type Task } from "../../services/tasksService";
import { ivfService } from "../../services/ivfService";
import { activityLogService } from "../../services/activityLogService";
import type { ActivityLogRecord } from "../../services/activityLogService";
import StakeholderChatBox from "../../components/StakeholderChatBox";
import { useDashboardChatWebSocket } from "../../hooks/useChatWebSocket";

export default function IVFTrackShipmentPage() {
    const { tankId } = useParams<{ tankId: string }>();
    const { userRole } = useAuth();
    const navigate = useNavigate();
    // const isOnboarding = useOnboardingMode();
    const [headerTankCode, setHeaderTankCode] = useState<string>("-");
    const [headerBranchName, setHeaderBranchName] = useState<string>("-");
    const [headerTankId, setHeaderTankId] = useState<number | undefined>(undefined);
    const [tankFullWeightKg, setTankFullWeightKg] = useState<number | null>(null);
    const [tankEmptyWeightKg, setTankEmptyWeightKg] = useState<number | null>(null);
    const [ln2L2Threshold, setLn2L2Threshold] = useState<number | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [countdown, setCountdown] = useState(3);

    // Header interactions state
    const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
    const [showMyTasks, setShowMyTasks] = useState(false);
    const [showStakeholderChats, setShowStakeholderChats] = useState(false);
    const [showStakeholderChatScreen, setShowStakeholderChatScreen] =
        useState(false);
    const [criticalAlerts, setCriticalAlerts] = useState<IVFAlert[]>([]);
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [loadingAlerts, setLoadingAlerts] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string>("");
    const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);
    const [stakeholderChats, setStakeholderChats] = useState<
        Array<{
            id: string;
            sender: string;
            patientId: string;
            message: string;
            timestamp: string;
            isRead: boolean;
        }>
    >([]);
    const [exporting, setExporting] = useState(false);
    const [useNewCryocan, 
        // setUseNewCryocan
    ] = useState(true);
    const [systemActivity, setSystemActivity] = useState<ActivityLogRecord[]>([]);
    const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
    const qualityChartRef = useRef<HTMLDivElement>(null);
    const [cryocanCanisters, setCryocanCanisters] = useState<
        Array<{ id: string; label: string; sampleCount?: number; status?: string }>
    >([]);
    const [cryocanContents, setCryocanContents] = useState<
        Record<
            string,
            Array<{
                id?: string;
                type?: string;
                hisNumber?: string;
                cryolockNumber?: string;
                caneCode?: string;
                gobletColor?: string;
                cryolockColor?: string;
                vitrificationDate?: string;
                description?: string | null;
            }>
        >
    >({});

    // WebSocket for unread count
    const { unreadMessages: wsUnreadMessages } = useDashboardChatWebSocket();

    // Calculate stakeholder chat count: only show count if canister has tagged unread messages
    const stakeholderChatCount = React.useMemo(() => {
        if (!tankId || !wsUnreadMessages) return 0;
        // Count only tagged unread messages for this specific canister (IVF flow uses canister_number)
        return wsUnreadMessages.filter(
            (msg) =>
                msg.canister_number === tankId || msg.patient_id === tankId,
        ).length;
    }, [tankId, wsUnreadMessages]);

    const criticalAlertsCount = criticalAlerts.filter(
        (alert) => alert.acknowledged_at == null,
    ).length;
    const externalTempAlert = criticalAlerts.some(
        (a) => a.acknowledged_at == null && /temp.?external|external.?temp/i.test(a.alert_type),
    );
    const internalTempAlert = criticalAlerts.some(
        (a) => a.acknowledged_at == null && /temp.?internal|internal.?temp/i.test(a.alert_type),
    );
    const myTasksCount = myTasks.filter(
        (task) =>
            task.status === "Not started" || task.status === "In progress",
    ).length;
    const routeTankCode = tankId && !/^\d+$/.test(tankId) ? tankId : "";
    const routeTankId =
        tankId && /^\d+$/.test(tankId) ? Number(tankId) : undefined;
    const resolvedTankCode =
        headerTankCode && headerTankCode !== "-"
            ? headerTankCode
            : routeTankCode;

    const { sensorTiles, ln2Level, internalTemp, externalTemp, lidStatus } =
        useIvfKpiSnapshot({ tankId, enabled: useNewCryocan });

    const toFiniteNumber = (value: unknown): number | null => {
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value === "string") {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    };

    const clampPercent = (value: number | null): number | null =>
        value == null ? null : Math.min(100, Math.max(0, value));

    const extractLn2Thresholds = (kpiLimits: unknown): { l1: number | null; l2: number | null } => {
        const ln2Level =
            kpiLimits && typeof kpiLimits === "object"
                ? (kpiLimits as Record<string, unknown>).ln2_level
                : null;

        if (!ln2Level || typeof ln2Level !== "object") {
            return { l1: null, l2: null };
        }

        const entries = Object.entries(ln2Level as Record<string, Record<string, unknown>>);
        const l1Entry = entries.find(([name]) => name.toLowerCase().includes("l1"))?.[1];
        const l2Entry = entries.find(([name]) => name.toLowerCase().includes("l2"))?.[1];

        const nextL1 = toFiniteNumber(l1Entry?.max) ?? toFiniteNumber(l2Entry?.min);
        const nextL2 = toFiniteNumber(l1Entry?.min) ?? toFiniteNumber(l2Entry?.max);

        if (nextL1 == null && nextL2 == null && entries.length > 0) {
            const legacy = entries[0][1] as Record<string, unknown>;
            return {
                l1: clampPercent(toFiniteNumber(legacy?.max)),
                l2: clampPercent(toFiniteNumber(legacy?.min)),
            };
        }

        return {
            l1: clampPercent(nextL1),
            l2: clampPercent(nextL2),
        };
    };
    const fetchCriticalAlerts = async () => {
        setLoadingAlerts(true);
        try {
            // If tankId is available, fetch canister-specific alerts
            // Otherwise, fetch hospital-wide alerts
            if (tankId) {
                const response =
                    await ivfAlertsService.getCanisterAlerts(tankId);
                setCriticalAlerts(response.alerts || []);
            } else {
                const response = await ivfAlertsService.getHospitalAlerts();
                setCriticalAlerts(response.alerts || []);
            }
        } catch (e) {
            console.error("Error fetching IVF alerts:", e);
            setCriticalAlerts([]);
        } finally {
            setLoadingAlerts(false);
        }
    };

    const fetchMyTasks = async () => {
        setLoadingTasks(true);
        try {
            let allTasks: Task[] = [];

            // IVF flow: if tankId is available, use canister-specific endpoint
            // Otherwise fallback to general "my tasks"
            if (tankId) {
                const canisterResponse =
                    await tasksService.getCanisterTasks(tankId);
                allTasks = Array.isArray(canisterResponse.tasks)
                    ? canisterResponse.tasks
                    : [];
            } else {
                const response = await tasksService.getMyTasks();
                // Combine created_tasks and assigned_tasks into a single array
                allTasks = [
                    ...(Array.isArray(response.created_tasks)
                        ? response.created_tasks
                        : []),
                    ...(Array.isArray(response.assigned_tasks)
                        ? response.assigned_tasks
                        : []),
                ];
            }

            // Ensure we always set an array
            setMyTasks(Array.isArray(allTasks) ? allTasks : []);
        } catch (e) {
            console.error("Error fetching tasks:", e);
            setMyTasks([]);
        } finally {
            setLoadingTasks(false);
        }
    };

    const fetchCurrentUser = async () => {
        try {
            const profile = await userService.getProfile();
            setCurrentUser(profile);
            setCurrentUserId(profile.user_id);
        } catch {
            // Error handled silently
        }
    };

    const fetchHeaderMetadata = async () => {
        if (!tankId) {
            setHeaderTankCode("-");
            setHeaderBranchName("-");
            setHeaderTankId(undefined);
            setTankFullWeightKg(null);
            setTankEmptyWeightKg(null);
            setLn2L2Threshold(null);
            return;
        }

        try {
            const kpiConfigResponse = await ivfService.getTankKpiConfig(tankId);
            const thresholds = extractLn2Thresholds(kpiConfigResponse?.kpi_limits);

            setHeaderTankCode(kpiConfigResponse?.tank_code || "-");
            setHeaderBranchName(kpiConfigResponse?.branch_name || "-");
            setHeaderTankId(kpiConfigResponse?.tank_id ?? undefined);
            setTankFullWeightKg(kpiConfigResponse?.full_weight_kg ?? null);
            setTankEmptyWeightKg(kpiConfigResponse?.empty_weight_kg ?? null);
            setLn2L2Threshold(thresholds.l2);
        } catch (e: unknown) {
            const msg = (e as Error)?.message || "";
            if (msg.includes("403") || msg.toLowerCase().includes("access denied") || msg.toLowerCase().includes("does not belong")) {
                setAccessDenied(true);
                setCountdown(3);
            } else {
                setHeaderTankCode("-");
                setHeaderBranchName("-");
                setTankFullWeightKg(null);
                setTankEmptyWeightKg(null);
                setLn2L2Threshold(null);
            }
        }
    };

    const handleExport = async () => {
        if (!tankId) {
            console.error("Tank ID is required for export");
            return;
        }

        setExporting(true);
        try {
            const currentDate = new Date();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1; // getMonth() returns 0-11, so add 1

            await ivfService.exportCombinedReportExcel(tankId, year, month);
        } catch (e: unknown) {
            console.error("Error exporting report:", e);
            // You could show a toast notification here
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        fetchCriticalAlerts();
        fetchMyTasks();
        fetchCurrentUser();
    }, [tankId]);

    useEffect(() => {
        fetchHeaderMetadata();
    }, [tankId]);

    useEffect(() => {
        if (!accessDenied) return;
        if (countdown <= 0) {
            navigate("/cryocan-tracking");
            return;
        }
        const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [accessDenied, countdown, navigate]);

    useEffect(() => {
        if (!useNewCryocan || !tankId) {
            setCryocanCanisters([]);
            setCryocanContents({});
            return;
        }

        let cancelled = false;
        ivfService
            .getCanisterTrackingDetails(tankId)
            .then((response) => {
                if (cancelled) return;
                const grouped = new Map<string, typeof response.data>();

                response.data.forEach((row) => {
                    const canisterId = String(row.canisterNum ?? "").trim();
                    if (!canisterId) return;
                    const current = grouped.get(canisterId) ?? [];
                    current.push(row);
                    grouped.set(canisterId, current);
                });

                const sorted = Array.from(grouped.entries()).sort(
                    ([a], [b]) => {
                        const aNum = Number(String(a).replace(/\D+/g, ""));
                        const bNum = Number(String(b).replace(/\D+/g, ""));
                        if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
                            return aNum - bNum;
                        }
                        return a.localeCompare(b);
                    },
                );

                const nextCanisters = sorted.map(([id, rows]) => ({
                    id,
                    label: `Canister ${id}`,
                    sampleCount: rows.length,
                }));

                const nextContents: Record<
                    string,
                    Array<{
                        id?: string;
                        type?: string;
                        hisNumber?: string;
                        cryolockNumber?: string;
                        caneCode?: string;
                        gobletColor?: string;
                        cryolockColor?: string;
                        vitrificationDate?: string;
                        description?: string | null;
                    }>
                > = {};
                sorted.forEach(([id, rows]) => {
                    nextContents[id] = rows.map((row) => ({
                        id: row.cryolockNum || row.hisNumber || undefined,
                        type: "Cryolock",
                        hisNumber: row.hisNumber || undefined,
                        cryolockNumber: row.cryolockNum || undefined,
                        caneCode: row.caneCode || undefined,
                        gobletColor: row.gobletColor || undefined,
                        cryolockColor: row.cryolockColor || undefined,
                        vitrificationDate: row.dateOfVitrification || undefined,
                        description: row.description ?? null,
                    }));
                });

                setCryocanCanisters(nextCanisters);
                setCryocanContents(nextContents);
            })
            .catch(() => {
                if (cancelled) return;
                setCryocanCanisters([]);
                setCryocanContents({});
            });

        return () => {
            cancelled = true;
        };
    }, [useNewCryocan, tankId]);

    useEffect(() => {
        if (!useNewCryocan || !tankId) {
            setSystemActivity([]);
            return;
        }
        let cancelled = false;
        activityLogService
            .getActivityLogs({ target_type: "tank", target_id: tankId, page_size: 20 })
            .then((res) => { if (!cancelled) setSystemActivity(res.logs ?? []); })
            .catch(() => { if (!cancelled) setSystemActivity([]); });
        return () => { cancelled = true; };
    }, [useNewCryocan, tankId]);

    // Update stakeholder chats from WebSocket data
    useEffect(() => {
        if (wsUnreadMessages && wsUnreadMessages.length > 0) {
            const transformedChats = wsUnreadMessages
                .filter(
                    (msg) =>
                        msg.canister_number === tankId ||
                        (msg.patient_id && tankId && msg.patient_id === tankId),
                )
                .map((msg) => ({
                    id: msg.canister_number || msg.patient_id || "",
                    sender: msg.sender_name,
                    patientId: msg.canister_number
                        ? `Canister ID : ${msg.canister_number}`
                        : msg.patient_id
                          ? `Canister ID : ${msg.patient_id}`
                          : "",
                    message: msg.message_content,
                    timestamp: new Date(msg.created_at).toLocaleString(),
                    isRead: false,
                }));
            setStakeholderChats(transformedChats);
        } else {
            setStakeholderChats([]);
        }
    }, [wsUnreadMessages, tankId]);

    const pageActions = (
        <div className="flex items-center gap-6">
            {/* Export Excel */}
            <div className="relative group">
                <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting || !tankId}
                    className="w-[25px] h-[25px] flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed !hidden"
                >
                    {exporting ? (
                        <svg
                            className="animate-spin h-[25px] w-[25px] text-primary"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <Download size={21} strokeWidth={2.25} className="text-primary" aria-label="Export Excel" />
                    )}
                </button>
                <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-line rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                    <div className="font-semibold text-black text-xs whitespace-nowrap">Export Combined Report</div>
                    <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-border"></div>
                </div>
            </div>
            {/* Critical Alerts */}
            <div id="onboarding-ivf-critical-alerts-icon" className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => { fetchCriticalAlerts(); setShowCriticalAlerts(true); }}>
                <div className="relative">
                    <img className="w-[28px] h-[28px]" alt="Critical Alerts" src={CriticalAlertsIcon} />
                    {criticalAlertsCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                            <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
                        </div>
                    )}
                </div>
                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Alerts</span>
            </div>
            {/* Stakeholder Chats */}
            <div id="onboarding-ivf-stakeholder-chats-icon" className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => setShowStakeholderChatScreen(true)}>
                <div className="relative">
                    <img className="w-[28px] h-[28px]" alt="Stakeholder Chats" src={StakeholderChatsIcon} />
                    {stakeholderChatCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                            <span className="font-semibold text-white text-[10px]">{stakeholderChatCount}</span>
                        </div>
                    )}
                </div>
                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Messages</span>
            </div>
            {/* My Tasks */}
            <div id="onboarding-ivf-my-tasks-icon" className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}>
                <div className="relative">
                    <img className="w-[28px] h-[28px]" alt="My Tasks" src={MyTasksIcon} />
                    {myTasksCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                            <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
                        </div>
                    )}
                </div>
                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Tasks</span>
            </div>
        </div>
    );

    if (accessDenied) {
        return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-2">Access Denied</h2>
                    <p className="text-sm text-gray-500 mb-6">You don't have access to this page.</p>
                    <div className="w-12 h-12 rounded-full border-4 border-primary flex items-center justify-center mx-auto">
                        <span className="text-xl font-bold text-primary">{countdown}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}…</p>
                </div>
            </div>
        );
    }

    return (
        <>
          <PageLayout title="Cryocan" description="Live cryogenic monitoring and canister storage." icon={ContainerQualityTrackingIcon} actions={pageActions}>
                            {/* Breadcrumb */}
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <PageBreadcrumb label="Cryocan Quality Tracking" />
                                <div className="flex items-center gap-3">
                                    <div className="text-sm font-semibold text-black">
                                        {headerTankCode} - {headerBranchName}
                                    </div>
                                    {/* !isOnboarding && <div className="inline-flex rounded-lg border border-line bg-white p-1">
                                        <button
                                            type="button"
                                            onClick={() => setUseNewCryocan(false)}
                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                                                !useNewCryocan
                                                    ? 'bg-primary text-white'
                                                    : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                            aria-pressed={!useNewCryocan}
                                        >
                                            Old UI
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setUseNewCryocan(true)}
                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                                                useNewCryocan
                                                    ? 'bg-primary text-white'
                                                    : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                            aria-pressed={useNewCryocan}
                                        >
                                            3D UI
                                        </button>
                                    </div> */}
                                </div>
                            </div>
                            {/* <ContainerProcessFlow /> */}
                            {/* Row 1: Quality Tracking (left) | Quality Parameter (right) */}
                            {!useNewCryocan ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                                    {/* Left Column: Quality Tracking */}
                                    <div className="h-full">
                                        <IVFQualityTrackingChart
                                            canisterNumber={tankId}
                                        />
                                    </div>
                                    {/* Right Column: Quality Parameter */}
                                    <div className="h-full">
                                        <IVFQualityParametersTable
                                            tankId={tankId}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <CryocanVisualizer
                                        variant="embedded"
                                        ln2Level={ln2Level ?? undefined}
                                        internalTemp={internalTemp ?? undefined}
                                        externalTemp={externalTemp ?? undefined}
                                        lidStatus={lidStatus ?? undefined}
                                        tankMaxCapacity={tankFullWeightKg}
                                        tankMinCapacity={tankEmptyWeightKg}
                                        ln2L2Threshold={ln2L2Threshold}
                                        sensorTiles={sensorTiles}
                                        canisters={cryocanCanisters}
                                        canisterContents={cryocanContents}
                                        systemActivity={systemActivity}
                                        externalTempAlert={externalTempAlert}
                                        internalTempAlert={internalTempAlert}
                                        tankCode={headerTankCode !== "-" ? headerTankCode : undefined}
                                        tankId={headerTankId ?? routeTankId}
                                        branchName={headerBranchName !== "-" ? headerBranchName : undefined}
                                        selectedSensorId={selectedSensorId}
                                        onSensorSelect={(id) => {
                                            setSelectedSensorId(id);
                                            setTimeout(() => qualityChartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                                        }}
                                    />
                                    <div ref={qualityChartRef} style={{ marginBottom: 16 }}>
                                        <IVFQualityTrackingChart canisterNumber={tankId} selectedKpiKey={selectedSensorId} onTabChange={() => setSelectedSensorId(null)} />
                                    </div>
                                </>
                            )}

                            {/* Row 2: Container Data (full width) */}
                            {!useNewCryocan && (
                                <div>
                                    <ContainerDataTable canisterNumber={tankId} />
                                </div>
                            )}

                            {/* Row 3: Refill Log — old UI only */}
                            {!useNewCryocan && (
                                <div>
                                    <RefillLogTable canisterNumber={tankId} />
                                </div>
                            )}
          </PageLayout>

            {/* Stakeholder Chat Box */}
            <StakeholderChatBox
                isOpen={showStakeholderChatScreen}
                onClose={() => setShowStakeholderChatScreen(false)}
                canisterNumber={tankId}
                onMessagesUpdated={() => {
                    // WebSocket will automatically update unread count
                    // No need to manually refresh
                }}
            />

            {/* Modals */}
            <CriticalAlertsModal
                id="onboarding-ivf-critical-alerts-modal"
                isOpen={showCriticalAlerts}
                onClose={() => setShowCriticalAlerts(false)}
                alerts={criticalAlerts.map((a) => ({
                    id: a.alert_id,
                    type: a.alert_type,
                    severity:
                        a.severity === "High"
                            ? "High"
                            : a.severity === "Medium"
                              ? "Medium"
                              : "Low",
                    patientId: a.tank_code
                        ? a.tank_code
                        : a.canister_number
                          ? a.canister_number
                          : `Canister ${a.canister_id}`,
                    branchName: (a as typeof a & { branch_name?: string })
                        .branch_name,
                    dedupKey: (a as typeof a & { dedup_key?: string })
                        .dedup_key,
                    message: a.message,
                    timestamp: new Date(a.occurred_at + "Z")+"" ,
                    status: a.status === "Active" ? "Active" : "Acknowledged",
                    acknowledgementReason: a.acknowledgment_reason,
                }))}
                loading={loadingAlerts}
                patientIdLabel=""
                onAcknowledge={async (alertId, reason) => {
                    try {
                        await ivfAlertsService.acknowledgeAlert(alertId, reason);
                        // Refresh alerts after acknowledgment
                        fetchCriticalAlerts();
                    } catch (error) {
                        console.error("Error acknowledging alert:", error);
                        throw error;
                    }
                }}
                onAcknowledgeAll={async (alertIds, reason) => {
                    try {
                        await ivfAlertsService.acknowledgeAlerts(alertIds, reason);
                        fetchCriticalAlerts();
                    } catch (error) {
                        console.error("Error acknowledging alerts:", error);
                        throw error;
                    }
                }}
            />
            <MyTasksModal
                id="onboarding-my-tasks-modal"
                isOpen={showMyTasks}
                onClose={() => setShowMyTasks(false)}
                tasks={myTasks.map((task) => {
                    try {
                        const displayTankCode =
                            (task.tank_code && String(task.tank_code).trim()) ||
                            resolvedTankCode ||
                            "";
                        return {
                            id: task.id.toString(),
                            patientId: task.patient_id || "N/A",
                            tankCode: displayTankCode || undefined,
                            tankId: task.tank_id ?? routeTankId,
                            canisterNumber:
                                task.canister_number ||
                                displayTankCode ||
                                "N/A",
                            taskName: task.task_name,
                            description: task.description || "",
                            assigneeBy: task.created_by
                                ? `${task.created_by.first_name || ""} ${task.created_by.last_name || ""}`.trim() ||
                                  "Unknown"
                                : "Unknown",
                            assignedTo: task.assignee
                                ? `${task.assignee.first_name || ""} ${task.assignee.last_name || ""}`.trim() ||
                                  "Unknown"
                                : "Unknown",
                            dueDate: task.due_date
                                ? new Date(task.due_date).toLocaleDateString()
                                : "N/A",
                            priority: task.priority,
                            status: task.status,
                        };
                    } catch (error) {
                        console.error("Error transforming task:", task, error);
                        const displayTankCode =
                            (task?.tank_code &&
                                String(task.tank_code).trim()) ||
                            resolvedTankCode ||
                            "";
                        return {
                            id: task.id?.toString() || "unknown",
                            patientId: task.patient_id || "N/A",
                            tankCode: displayTankCode || undefined,
                            tankId: task?.tank_id ?? routeTankId,
                            canisterNumber:
                                task.canister_number ||
                                displayTankCode ||
                                "N/A",
                            taskName: task.task_name || "Unknown Task",
                            description: task.description || "",
                            assigneeBy: "Unknown",
                            assignedTo: "Unknown",
                            dueDate: "N/A",
                            priority: task.priority || "Medium",
                            status: task.status || "Not started",
                        };
                    }
                })}
                loading={loadingTasks}
                variant="ivf"
                currentUserName={
                    currentUser
                        ? `${currentUser.first_name} ${currentUser.last_name}`
                        : ""
                }
                currentUserId={currentUserId}
                userRole={userRole || currentUser?.role || ""}
                defaultCanisterNumber={resolvedTankCode || ""}
                defaultTankId={routeTankId}
                onTaskCreated={() => {
                    // Refresh tasks after creation
                    fetchMyTasks();
                }}
                onAdd={() => {
                    // Task creation handled by onTaskCreated callback
                }}
                onEdit={async (task: MyTask) => {
                    try {
                        const taskId = parseInt(task.id);
                        if (isNaN(taskId)) {
                            console.error("Invalid task ID:", task.id);
                            return;
                        }

                        // Get assigneeId from the task (it should be stored when user selects from dropdown)
                        const assigneeId = task.assigneeId;

                        // Prepare update data
                        const updateData: {
                            task_name?: string;
                            description?: string;
                            assignee_id?: string;
                            patient_id?: string;
                            tank_code?: string;
                            tank_id?: number;
                            due_date?: string;
                            priority?: "Low" | "Medium" | "High";
                            status?: import("../../services/tasksService").TaskStatus;
                        } = {};

                        // Check if task was created by current user - they can edit all fields
                        const isCreatedByMe =
                            task.assigneeBy?.trim().toLowerCase() ===
                            (currentUser
                                ? `${currentUser.first_name} ${currentUser.last_name}`
                                      .trim()
                                      .toLowerCase()
                                : "");

                        if (isCreatedByMe) {
                            // Creator can update all fields
                            updateData.task_name = task.taskName;
                            updateData.description = task.description;
                            if (assigneeId) {
                                // assignee_id should be a string (user_id)
                                updateData.assignee_id = String(assigneeId);
                            }

                            // IVF tasks are tank-scoped; CGT tasks are patient-scoped
                            const targetTankId = task.tankId ?? routeTankId;
                            if (targetTankId !== undefined) {
                                updateData.tank_id = targetTankId;
                                updateData.tank_code = undefined;
                                updateData.patient_id = undefined;
                            } else if (
                                task.canisterNumber &&
                                task.canisterNumber !== "N/A"
                            ) {
                                updateData.tank_code = String(
                                    task.canisterNumber,
                                );
                                updateData.patient_id = undefined;
                            } else {
                                updateData.patient_id =
                                    task.patientId && task.patientId !== "N/A"
                                        ? task.patientId
                                        : undefined;
                            }

                            // Parse date - handle both ISO format and locale date string
                            if (task.dueDate && task.dueDate !== "N/A") {
                                try {
                                    const date = new Date(task.dueDate);
                                    if (!isNaN(date.getTime())) {
                                        updateData.due_date =
                                            date.toISOString();
                                    }
                                } catch (e) {
                                    console.error(
                                        "Error parsing date:",
                                        task.dueDate,
                                        e,
                                    );
                                }
                            }
                            updateData.priority = task.priority;
                            updateData.status = task.status;
                        } else {
                            // Assignee can only update status - use dedicated status update endpoint
                            if (task.status) {
                                await tasksService.updateTaskStatus(
                                    taskId,
                                    task.status as import("../../services/tasksService").TaskStatus,
                                );
                                // Refresh tasks after update
                                fetchMyTasks();
                                return; // Early return since we've handled the update
                            }
                            return;
                        }

                        // Call update API for full task updates (when creator edits)
                        if (Object.keys(updateData).length > 0) {
                            await tasksService.updateTask(taskId, updateData);
                        }

                        // Refresh tasks after update
                        fetchMyTasks();
                    } catch (error) {
                        console.error("Error updating task:", error);
                    }
                }}
                onDelete={() => {
                    // TODO: Implement delete task functionality
                }}
            />
            {/* Legacy modal retained but not used by icon click */}
            <StakeholderChatsModal
                isOpen={showStakeholderChats}
                onClose={() => setShowStakeholderChats(false)}
                chats={stakeholderChats}
            />
        </>
    );
}
