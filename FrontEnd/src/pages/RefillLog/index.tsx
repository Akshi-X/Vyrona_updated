import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { ivfService, type IvfBranch, type RefillLogItem } from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";
import { userService, type UserListItem } from "../../services/userService";

type ContainerItem = {
    id: string;
    tankId: string;
    tankCode: string;
    containerNo: string;
    branch: string;
    lastRefillDate: string;
    lastRefilledBy?: string;
    lastDescription?: string;
    lastLogDate?: string;
    lastLogTime?: string;
    ln2LevelKg?: number | null;   // raw kg from ln2_mass_kg
    ln2ConfigMin?: number | null;
};

type RefillLogCreateForm = {
    refill_date: string;
    refill_time: string;
    refilled_by: string;
    description: string;
    status: string;
    reservoir_id: string;
};

const formatDaysAgo = (dateStr: string): string => {
    if (!dateStr || dateStr === "NA") return "NA";
    const [day, month, year] = dateStr.split("/").map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
};

const RefillLog = () => {
    const { isAuthenticated } = useAuth();
    const [selectedBranch] = useState<string>("All");
    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [containers, setContainers] = useState<ContainerItem[]>([]);
    const [containersLoading, setContainersLoading] = useState(false);

    const [activityBranch, setActivityBranch] = useState<string>("All");
    const [isActivityBranchOpen, setIsActivityBranchOpen] = useState(false);
    const activityBranchRef = useRef<HTMLDivElement>(null);
    const [showBanner, setShowBanner] = useState(true);
    const [isAddRefillOpen, setIsAddRefillOpen] = useState(false);
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
    const [users, setUsers] = useState<UserListItem[]>([]);
    const [allActivityLogs, setAllActivityLogs] = useState<{
        timestamp: string;
        sortKey: string;
        tankCode: string;
        branch: string;
        operator: string;
        description: string;
        status: string;
    }[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [reservoirs, setReservoirs] = useState<{ reservoir_id: number; reservoir_name: string; branch_id: number | null; branch_name: string | null }[]>([]);
    const [reservoirLogs, setReservoirLogs] = useState<{ log_id: number; reservoir_id: number; reservoir_name: string; branch_name: string | null; ln2_ordered_date: string | null; ln2_received_date: string | null; created_at: string | null }[]>([]);
    const [reservoirLogsLoading, setReservoirLogsLoading] = useState(false);
    // Modal tab: "refill" | "reservoir"
    const [addModalTab, setAddModalTab] = useState<"refill" | "reservoir">("refill");
    const [reservoirForm, setReservoirForm] = useState({ reservoir_id: "", ln2_ordered_date: "", ln2_received_date: "" });
    const [reservoirSubmitting, setReservoirSubmitting] = useState(false);
    const [reservoirError, setReservoirError] = useState<string | null>(null);
    const [editingLogId, setEditingLogId] = useState<number | null>(null);
    const [editLogForm, setEditLogForm] = useState<{ ln2_ordered_date: string; ln2_received_date: string }>({ ln2_ordered_date: "", ln2_received_date: "" });
    const [editLogSaving, setEditLogSaving] = useState(false);
    const [viewContainer, setViewContainer] = useState<ContainerItem | null>(null);
    const [viewLogs, setViewLogs] = useState<RefillLogItem[]>([]);
    const [viewLoading, setViewLoading] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);
    const [addForm, setAddForm] = useState<RefillLogCreateForm>({
        refill_date: new Date().toISOString().slice(0, 10),
        refill_time: "09:00",
        refilled_by: "",
        description: "",
        status: "Not started",
        reservoir_id: "",
    });

    const branchDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
                // dropdown closed via click outside
            }
            if (activityBranchRef.current && !activityBranchRef.current.contains(e.target as Node)) {
                setIsActivityBranchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const loadContainers = async () => {
            setContainersLoading(true);
            try {
                const data = await shipmentService.getActiveCanisters();
                if (data?.branches && Array.isArray(data.branches)) {
                    const flattened = data.branches.flatMap((branch, branchIndex: number) => {
                        const list = branch.tanks || [];
                        return (Array.isArray(list) ? list : []).map(
                            (c: { tank_id: number; tank_code: string; updated_at: string | null }, idx: number): ContainerItem => ({
                                id: String(c.tank_id ?? branchIndex * 1000 + idx),
                                tankId: String(c.tank_id ?? branchIndex * 1000 + idx),
                                tankCode: String(c.tank_code ?? `T${idx + 1}`),
                                containerNo: String(c.tank_code ?? `Container ${idx + 1}`),
                                branch: branch.branch_name ?? "N/A",
                                lastRefillDate: c.updated_at
                                    ? new Date(c.updated_at).toLocaleDateString("en-GB")
                                    : "NA",
                            }),
                        );
                    });
                    // Fetch last refill log + LN2 level for each container
                    const withLogs = await Promise.all(
                        flattened.map(async (c) => {
                            try {
                                const [refillRes, ln2Res, configRes] = await Promise.all([
                                    ivfService.getCanisterRefillLogs(c.tankId),
                                    ivfService.getLn2HistoryById(c.tankId, 1).catch(() => null),
                                    ivfService.getKpiConfigList(Number(c.tankId)).catch(() => null),
                                ]);
                                const logs = refillRes?.refill_logs ?? [];
                                const last = logs[0];
                                const latestLn2 = ln2Res?.history?.[0];
                                return {
                                    ...c,
                                    lastRefilledBy: last?.refilled_by ?? "-",
                                    lastDescription: last?.description ?? "-",
                                    lastLogDate: last?.refill_date ?? "-",
                                    lastLogTime: last?.refill_time ?? "-",
                                    ln2LevelKg: latestLn2?.ln2_mass_kg ?? null,
                                    ln2ConfigMin: configRes?.config?.find((cfg: { kpi_name: string; min: number | null }) => cfg.kpi_name === "ln2_level")?.min ?? null,
                                };
                            } catch {
                                return c;
                            }
                        }),
                    );
                    setContainers(withLogs);

                    // Fetch all logs from all containers for activity log
                    setActivityLoading(true);
                    try {
                        const allLogs = await Promise.all(
                            flattened.map(async (c) => {
                                try {
                                    const res = await ivfService.getCanisterRefillLogs(c.tankId);
                                    return (res?.refill_logs ?? []).map((log) => ({
                                        timestamp: `${log.refill_date ?? "-"}${log.refill_time ? ", " + log.refill_time : ""}`,
                                        sortKey: `${log.refill_date ?? ""}T${log.refill_time ?? ""}`,
                                        tankCode: c.tankCode,
                                        branch: c.branch,
                                        operator: log.refilled_by ?? "-",
                                        description: log.description ?? "-",
                                        status: log.status ?? "-",
                                    }));
                                } catch {
                                    return [];
                                }
                            }),
                        );
                        const merged = allLogs
                            .flat()
                            .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
                        setAllActivityLogs(merged);
                    } finally {
                        setActivityLoading(false);
                    }
                } else {
                    setContainers([]);
                }
            } catch {
                setContainers([]);
            } finally {
                setContainersLoading(false);
            }
        };
        if (isAuthenticated) loadContainers();
    }, [isAuthenticated]);

    useEffect(() => {
        const loadBranches = async () => {
            try {
                const res = await ivfService.getBranches();
                setBranches(Array.isArray(res?.branches) ? res.branches : []);
            } catch {
                setBranches([]);
            }
        };
        if (isAuthenticated) loadBranches();
    }, [isAuthenticated]);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const res = await userService.getAllUsersInCompany();
                setUsers(Array.isArray(res?.users) ? res.users : []);
            } catch {
                setUsers([]);
            }
        };
        if (isAuthenticated) loadUsers();
    }, [isAuthenticated]);

    const loadReservoirData = async () => {
        setReservoirLogsLoading(true);
        try {
            const [resRes, logsRes] = await Promise.all([
                ivfService.getReservoirs().catch(() => null),
                ivfService.getReservoirLogs().catch(() => null),
            ]);
            setReservoirs(Array.isArray(resRes?.reservoirs) ? resRes.reservoirs : []);
            setReservoirLogs(Array.isArray(logsRes?.logs) ? logsRes.logs : []);
        } finally {
            setReservoirLogsLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) loadReservoirData();
    }, [isAuthenticated]);

    const branchOptions = useMemo(() => {
        const options = new Set<string>();
        branches.forEach((b) => { if (b?.branch_name?.trim()) options.add(b.branch_name.trim()); });
        return ["All", ...Array.from(options)];
    }, [branches]);

    const filteredContainers = useMemo(() => {
        if (selectedBranch === "All") return containers;
        return containers.filter((c) => c.branch === selectedBranch);
    }, [containers, selectedBranch]);

    // Banner detected data (hardcoded from detection; replace with real data when API ready)
    const BANNER_DATE = "2026-02-19"; // 19/02/26
    const BANNER_TIME = "12:30";

    const resetAddForm = (prefillDate?: string, prefillTime?: string) => {
        setAddForm({
            refill_date: prefillDate ?? new Date().toISOString().slice(0, 10),
            refill_time: prefillTime ?? "09:00",
            refilled_by: "",
            description: "",
            status: "Not started",
            reservoir_id: "",
        });
        setAddError(null);
    };

    const openView = async (container: ContainerItem) => {
        setViewContainer(container);
        setViewLogs([]);
        setViewError(null);
        setViewLoading(true);
        try {
            const res = await ivfService.getCanisterRefillLogs(container.tankId);
            setViewLogs(Array.isArray(res?.refill_logs) ? res.refill_logs : []);
        } catch (e) {
            setViewError((e as Error)?.message || "Failed to load logs");
        } finally {
            setViewLoading(false);
        }
    };

    const submitReservoirLog = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!reservoirForm.reservoir_id) { setReservoirError("Select a reservoir."); return; }
        setReservoirSubmitting(true);
        setReservoirError(null);
        try {
            await ivfService.createReservoirLog({
                reservoir_id: Number(reservoirForm.reservoir_id),
                ln2_ordered_date: reservoirForm.ln2_ordered_date || null,
                ln2_received_date: reservoirForm.ln2_received_date || null,
            });
            setIsAddRefillOpen(false);
            setReservoirForm({ reservoir_id: "", ln2_ordered_date: "", ln2_received_date: "" });
            loadReservoirData();
        } catch (error) {
            setReservoirError((error as Error)?.message || "Failed to create reservoir log");
        } finally {
            setReservoirSubmitting(false);
        }
    };

    const saveEditLog = async (logId: number) => {
        setEditLogSaving(true);
        try {
            await ivfService.updateReservoirLog(logId, {
                ln2_ordered_date: editLogForm.ln2_ordered_date || null,
                ln2_received_date: editLogForm.ln2_received_date || null,
            });
            setEditingLogId(null);
            loadReservoirData();
        } catch {
            // silently ignore — could add error state if needed
        } finally {
            setEditLogSaving(false);
        }
    };

    const submitAddRefillLog = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedTankId) { setAddError("Select a container before adding log."); return; }
        if (!addForm.refilled_by.trim()) { setAddError("Refilled By is required."); return; }
        setAddSubmitting(true);
        setAddError(null);
        try {
            await ivfService.createRefillLog(selectedTankId, {
                refill_date: addForm.refill_date,
                refill_time: addForm.refill_time,
                refilled_by: addForm.refilled_by.trim(),
                description: addForm.description.trim(),
                status: addForm.status,
                ...(addForm.reservoir_id ? { reservoir_id: Number(addForm.reservoir_id) } : {}),
            });
            setIsAddRefillOpen(false);
        } catch (error) {
            setAddError((error as Error)?.message || "Failed to create refill log");
        } finally {
            setAddSubmitting(false);
        }
    };

    return (
        <main className="flex flex-col h-screen overflow-hidden">
            <div className="flex-1 px-8 py-8 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0 pb-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="font-semibold text-black text-2xl tracking-tight">Refill Logs</h1>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => { resetAddForm(); setAddModalTab("refill"); setIsAddRefillOpen(true); }}
                            className="px-5 h-9 rounded-lg border border-[#6b1176] text-[#6b1176] text-sm font-medium hover:bg-[#f7ecff] transition-colors"
                        >
                            Add Logs
                        </button>
                    </div>
                </div>

                {/* Banner */}
                {showBanner && (
                    <div className="relative rounded-xl border-2 p-5 transition-all duration-200 border-[#E7D4F0] bg-gradient-to-r from-[#F7ECFF]/50 to-white">
                        {/* Close — top right */}
                        <button
                            type="button"
                            onClick={() => setShowBanner(false)}
                            className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500" aria-hidden="true">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                        </button>

                        <div className="flex items-end gap-4">
                            {/* Droplet icon */}
                            <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-[#F2E4FF] text-[#6b1176] self-start">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                </svg>
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-8">
                                <h3 className="font-semibold text-sm text-gray-900">Refill Detected</h3>
                                <div className="mt-1.5 flex flex-col gap-0.5">
                                    <p className="text-sm text-gray-700">Tank Code: <span className="font-medium text-gray-900">T20</span></p>
                                    <p className="text-sm text-gray-700">Branch Name: <span className="font-medium text-gray-900">Tambaram</span></p>
                                    <p className="text-sm text-gray-700">Date & Time: <span className="font-medium text-gray-900">19/02/26 12:30 PM</span></p>
                                </div>
                            </div>
                            {/* Add Refill — aligned to bottom */}
                            <button
                                type="button"
                                onClick={() => { resetAddForm(BANNER_DATE, BANNER_TIME); setAddModalTab("refill"); setIsAddRefillOpen(true); }}
                                className="flex-shrink-0 flex items-center gap-1.5 px-4 h-8 rounded-lg bg-[#6b1176] text-white text-xs font-medium hover:bg-[#5a0e63] transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                </svg>
                                Add Logs
                            </button>
                        </div>
                    </div>
                )}

                {/* Two panels */}
                <div className="grid grid-cols-2 gap-6" style={{ height: "400px" }}>

                    {/* Left: Active Tank Status */}
                    <div className="bg-white border border-[#E7E1E1] rounded-lg flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7E1E1] shrink-0">
                            <h2 className="font-semibold text-black text-base">Active Tank Status</h2>
                        </div>

                        {/* Table header */}
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,110px)_minmax(0,80px)] px-4 py-2 bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] shrink-0">
                            <div>Container #</div>
                            <div className="text-center">LN2 Level</div>
                            <div className="text-center">View</div>
                            <div className="text-center">Last Refill</div>
                        </div>

                        {/* Container list */}
                        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-100">
                            {containersLoading && (
                                <div className="p-4 text-xs text-gray-500">Loading containers...</div>
                            )}
                            {!containersLoading && filteredContainers.map((container) => (
                                <div
                                    key={container.id}
                                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,110px)_minmax(0,80px)] px-4 py-2.5 items-center"
                                >
                                    <div className="min-w-0">
                                        <span className="text-[#6b1176] text-xs font-bold block truncate">
                                            {container.tankCode} ({container.tankId})
                                        </span>
                                        <span className="text-xs text-gray-500 truncate block">{container.branch}</span>
                                    </div>
                                    {/* LN2 Level progress bar */}
                                    <div className="px-2">
                                        {container.ln2LevelKg != null ? (() => {
                                            // Same formula as IVFQualityParametersTable
                                            const ln2_100per = container.tankId === '84' ? 45.2 : 34.894;
                                            const ln2Pct = Math.min(100, Math.max(0, Math.round((container.ln2LevelKg / ln2_100per) * 100)));
                                            const l2Pct = container.ln2ConfigMin != null
                                                ? Math.round(100 - ((ln2_100per - container.ln2ConfigMin) / ln2_100per) * 100)
                                                : null;
                                            return (
                                                <div className="flex flex-col items-stretch gap-0.5">
                                                    {/* Bar */}
                                                    <div className="relative h-2.5 rounded-full bg-[#E7D4F0] overflow-visible">
                                                        <div
                                                            className="absolute inset-y-0 left-0 rounded-full bg-[#6b1176]"
                                                            style={{ width: `${ln2Pct}%` }}
                                                        />
                                                        {/* L2 threshold marker */}
                                                        {l2Pct != null && (
                                                            <div
                                                                className="absolute top-0 w-0.5 h-full bg-orange-400 -translate-x-1/2"
                                                                style={{ left: `${Math.min(100, Math.max(0, l2Pct))}%` }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <span className="text-[10px] text-[#6b1176] font-medium">LN2 - {ln2Pct}%</span>
                                                        {l2Pct != null && (
                                                            <span className="text-[10px] text-orange-500 font-medium">L2 - {l2Pct}%</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })() : (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => openView(container)}
                                            className="px-2 h-6 rounded-md border border-[#6b1176] text-[#6b1176] text-[10px] font-medium hover:bg-[#f7ecff] transition-colors"
                                        >
                                            View
                                        </button>
                                    </div>
                                    <div className="text-center text-xs text-gray-600 font-medium truncate">
                                        {formatDaysAgo(container.lastRefillDate)}
                                    </div>
                                </div>
                            ))}
                            {!containersLoading && filteredContainers.length === 0 && (
                                <div className="p-4 text-xs text-gray-500">No containers found.</div>
                            )}
                        </div>
                    </div>

                    {/* Right: Reservoir Logs */}
                    <div className="bg-white border border-[#E7E1E1] rounded-lg flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#E7E1E1] shrink-0">
                            <h2 className="font-semibold text-black text-base">Reservoir Logs</h2>
                        </div>
                        <div className="flex flex-1 min-h-0 overflow-hidden">
                            {/* Left: Cryocan SVG illustration */}
                            <div className="flex items-center justify-center shrink-0 px-3 border-r border-[#E7E1E1]">
                                <svg width="220" height="320" viewBox="0 0 240 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Cryocan tank">
                                    <defs>
                                        <linearGradient id="res-fill-gradient" x1="0" x2="0" y1="1" y2="0">
                                            <stop offset="0%" stopColor="#9B72B0" />
                                            <stop offset="100%" stopColor="#B58BC6" />
                                        </linearGradient>
                                        <linearGradient id="res-body-gradient" x1="0" x2="1" y1="0" y2="0">
                                            <stop offset="0%" stopColor="#9580a8" />
                                            <stop offset="50%" stopColor="#c9b3db" />
                                            <stop offset="100%" stopColor="#9580a8" />
                                        </linearGradient>
                                        <clipPath id="res-body-clip">
                                            <rect x="30" y="50" width="140" height="220" rx="30" />
                                        </clipPath>
                                    </defs>
                                    {/* Tank lid/cap */}
                                    <rect x="50" y="15" width="100" height="40" rx="10" fill="#a78bba" stroke="#8B6B9E" strokeWidth="2" />
                                    <rect x="60" y="22" width="80" height="10" rx="5" fill="#c9b3db" />
                                    <rect x="70" y="35" width="60" height="8" rx="4" fill="#b8a0cc" />
                                    {/* Tank base/feet */}
                                    <rect x="40" y="270" width="30" height="18" rx="6" fill="#8B6B9E" />
                                    <rect x="130" y="270" width="30" height="18" rx="6" fill="#8B6B9E" />
                                    <rect x="65" y="270" width="70" height="12" rx="3" fill="#a78bba" />
                                    {/* Tank body */}
                                    <rect x="30" y="50" width="140" height="220" rx="30" fill="url(#res-body-gradient)" stroke="#8B6B9E" strokeWidth="3" />
                                    {/* LN2 fill ~60% */}
                                    <g clipPath="url(#res-body-clip)">
                                        <rect x="30" y="182" width="140" height="88" fill="url(#res-fill-gradient)" />
                                        <path d="M30 0 Q55 -6 80 0 T130 0 T170 0" fill="#B58BC6" opacity="0.9" transform="translate(0,182)">
                                            <animate attributeName="d" values="M30 0 Q55 -6 80 0 T130 0 T170 0;M30 0 Q55 6 80 0 T130 0 T170 0;M30 0 Q55 -6 80 0 T130 0 T170 0" dur="3s" repeatCount="indefinite" />
                                        </path>
                                        <ellipse cx="100" cy="182" rx="40" ry="3" fill="white" opacity="0.3">
                                            <animate attributeName="opacity" values="0.3;0.5;0.3" dur="2s" repeatCount="indefinite" />
                                        </ellipse>
                                    </g>
                                    {/* Inner shadow */}
                                    <rect x="30" y="50" width="140" height="220" rx="30" fill="none" stroke="#6B1176" strokeWidth="1" opacity="0.1" />
                                    {/* Percentage */}
                                    <text x="100" y="175" textAnchor="middle" fontSize="24" fontWeight="bold" fill="#6B1176" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>60%</text>
                                    <text x="100" y="195" textAnchor="middle" fontSize="12" fill="#6B1176" opacity="0.7" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Reservoir</text>
                                </svg>
                            </div>

                            {/* Right: table */}
                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                {/* Table header */}
                                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,110px)_minmax(0,110px)_36px] px-4 py-2 bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] shrink-0">
                                    <div>Reservoir</div>
                                    <div>LN2 Ordered</div>
                                    <div>LN2 Received</div>
                                    <div />
                                </div>
                                <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-100">
                                    {reservoirLogsLoading && (
                                        <div className="p-4 text-xs text-gray-500">Loading...</div>
                                    )}
                                    {!reservoirLogsLoading && reservoirLogs.length === 0 && (
                                        <div className="p-4 text-xs text-gray-400">No reservoir logs found.</div>
                                    )}
                                    {!reservoirLogsLoading && reservoirLogs.map((log) => {
                                        const isEditing = editingLogId === log.log_id;
                                        return (
                                            <div
                                                key={log.log_id}
                                                className="grid grid-cols-[minmax(0,1fr)_minmax(0,110px)_minmax(0,110px)_36px] px-4 py-2 items-center hover:bg-gray-50"
                                            >
                                                <div className="flex items-center min-w-0">
                                                    <span className="text-sm font-medium text-gray-800 truncate">{log.reservoir_name}</span>
                                                </div>
                                                {isEditing ? (
                                                    <input
                                                        type="date"
                                                        value={editLogForm.ln2_ordered_date}
                                                        onChange={(e) => setEditLogForm(f => ({ ...f, ln2_ordered_date: e.target.value }))}
                                                        className="text-xs border border-[#6b1176] rounded px-1 py-0.5 w-full focus:outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-600 truncate">{log.ln2_ordered_date ?? "—"}</span>
                                                )}
                                                {isEditing ? (
                                                    <input
                                                        type="date"
                                                        value={editLogForm.ln2_received_date}
                                                        onChange={(e) => setEditLogForm(f => ({ ...f, ln2_received_date: e.target.value }))}
                                                        className="text-xs border border-[#6b1176] rounded px-1 py-0.5 w-full focus:outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-600 truncate">{log.ln2_received_date ?? "—"}</span>
                                                )}
                                                <div className="flex items-center justify-end">
                                                    {isEditing ? (
                                                        <button
                                                            type="button"
                                                            disabled={editLogSaving}
                                                            onClick={() => saveEditLog(log.log_id)}
                                                            className="text-[#6b1176] hover:text-[#5a0e63] disabled:opacity-50"
                                                            title="Save"
                                                        >
                                                            {editLogSaving ? (
                                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                                            ) : (
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingLogId(log.log_id);
                                                                setEditLogForm({
                                                                    ln2_ordered_date: log.ln2_ordered_date ?? "",
                                                                    ln2_received_date: log.ln2_received_date ?? "",
                                                                });
                                                            }}
                                                            className="text-[#6b1176] hover:text-[#5a0e63] transition-colors"
                                                            title="Edit"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414a2 2 0 01.586-1.414z" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Recent Activity Log */}
                <div className="flex-1 min-h-0 bg-white border border-[#E7E1E1] rounded-xl overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#E7E1E1]">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b1176]">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                                <path d="M12 7v5l4 2" />
                            </svg>
                            <h2 className="font-semibold text-gray-900 text-base">Recent Activity Log</h2>
                        </div>
                        <div className="relative" ref={activityBranchRef}>
                            <button
                                type="button"
                                onClick={() => setIsActivityBranchOpen(!isActivityBranchOpen)}
                                className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#E7E1E1] text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                <svg className="w-4 h-4 text-[#6b1176]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                <span className={activityBranch !== "All" ? "text-[#6b1176] font-medium" : ""}>
                                    {activityBranch === "All" ? "All Branches" : activityBranch}
                                </span>
                                <svg className={`w-3.5 h-3.5 transition-transform ${isActivityBranchOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {isActivityBranchOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[160px] max-h-60 overflow-y-auto">
                                    {branchOptions.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => { setActivityBranch(option); setIsActivityBranchOpen(false); }}
                                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                                activityBranch === option ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-50"
                                            }`}
                                        >
                                            {option === "All" ? "All Branches" : option}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto min-h-0">
                        {activityLoading ? (
                            <div className="flex items-center justify-center h-24 text-sm text-gray-400 gap-2">
                                <svg className="animate-spin w-4 h-4 text-[#6b1176]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Loading activity...
                            </div>
                        ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white z-10">
                                <tr className="border-b border-[#E7E1E1]">
                                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Timestamp</th>
                                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Tank</th>
                                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Branch</th>
                                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Operator</th>
                                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {allActivityLogs.filter((r) => activityBranch === "All" || r.branch === activityBranch).map((row, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.timestamp}</td>
                                        <td className="px-4 py-2.5 font-semibold text-[#6b1176] whitespace-nowrap">{row.tankCode}</td>
                                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.branch}</td>
                                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.operator}</td>
                                        <td className="px-4 py-2.5 text-gray-500 max-w-[160px] truncate">{row.description}</td>
                                    </tr>
                                ))}
                                {allActivityLogs.filter((r) => activityBranch === "All" || r.branch === activityBranch).length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-6 text-center text-sm text-gray-400">No recent activity.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Refill / Reservoir Modal */}
            {isAddRefillOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="w-full max-w-xl bg-white rounded-lg border border-[#E7E1E1] p-5">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-black">Add Log</h3>
                            <button type="button" onClick={() => !(addSubmitting || reservoirSubmitting) && setIsAddRefillOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        {/* Toggle */}
                        <div className="flex items-center gap-1 p-1 bg-[#F7ECFF] rounded-lg mb-4 w-fit">
                            <button
                                type="button"
                                onClick={() => setAddModalTab("refill")}
                                className={`px-4 h-8 rounded-md text-sm font-medium transition-colors ${addModalTab === "refill" ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-white/60"}`}
                            >
                                Refill Logs
                            </button>
                            <button
                                type="button"
                                onClick={() => setAddModalTab("reservoir")}
                                className={`px-4 h-8 rounded-md text-sm font-medium transition-colors ${addModalTab === "reservoir" ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-white/60"}`}
                            >
                                Reservoir
                            </button>
                        </div>

                        {/* Refill Logs form */}
                        {addModalTab === "refill" && (
                            <form onSubmit={submitAddRefillLog} className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Tank <span className="text-red-500">*</span></label>
                                        <select value={selectedTankId ?? ""} onChange={(e) => {
                                                const tankId = e.target.value || null;
                                                setSelectedTankId(tankId);
                                                const tank = containers.find((c) => c.tankId === tankId);
                                                const matchedReservoir = tank
                                                    ? reservoirs.find((r) => r.branch_name === tank.branch)
                                                    : undefined;
                                                setAddForm((p) => ({ ...p, reservoir_id: matchedReservoir ? String(matchedReservoir.reservoir_id) : "" }));
                                            }} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm bg-white" required>
                                            <option value="">Select tank</option>
                                            {containers.map((c) => (
                                                <option key={c.tankId} value={c.tankId}>{c.tankCode} ({c.tankId})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                                        <input type="text" value={containers.find((c) => c.tankId === selectedTankId)?.branch ?? ""} readOnly className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm bg-gray-50 text-gray-500" placeholder="Auto-filled" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Reservoir</label>
                                    <select value={addForm.reservoir_id} onChange={(e) => setAddForm((p) => ({ ...p, reservoir_id: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm bg-white">
                                        <option value="">None</option>
                                        {reservoirs.map((r) => (
                                            <option key={r.reservoir_id} value={r.reservoir_id}>
                                                {r.reservoir_name}{r.branch_name ? ` — ${r.branch_name}` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refill Date</label>
                                        <input type="date" value={addForm.refill_date} onChange={(e) => setAddForm((p) => ({ ...p, refill_date: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refill Time</label>
                                        <input type="time" value={addForm.refill_time} onChange={(e) => setAddForm((p) => ({ ...p, refill_time: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm" required />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refilled By <span className="text-red-500">*</span></label>
                                        <select value={addForm.refilled_by} onChange={(e) => setAddForm((p) => ({ ...p, refilled_by: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm bg-white" required>
                                            <option value="">Select user</option>
                                            {users.map((u) => (
                                                <option key={u.user_id} value={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                    <input type="text" value={addForm.description} onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm" />
                                </div>
                                {addError && <div className="text-sm text-red-600">{addError}</div>}
                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => !addSubmitting && setIsAddRefillOpen(false)} className="px-4 h-9 rounded-lg border border-[#E7E1E1] text-sm text-gray-700">Cancel</button>
                                    <button type="submit" disabled={addSubmitting} className="px-4 h-9 rounded-lg bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0e63] disabled:opacity-60">
                                        {addSubmitting ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Reservoir form */}
                        {addModalTab === "reservoir" && (
                            <form onSubmit={submitReservoirLog} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Reservoir <span className="text-red-500">*</span></label>
                                    <select value={reservoirForm.reservoir_id} onChange={(e) => setReservoirForm((p) => ({ ...p, reservoir_id: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm bg-white" required>
                                        <option value="">Select reservoir</option>
                                        {reservoirs.map((r) => (
                                            <option key={r.reservoir_id} value={r.reservoir_id}>
                                                {r.reservoir_name}{r.branch_name ? ` — ${r.branch_name}` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">LN2 Ordered Date</label>
                                        <input type="date" value={reservoirForm.ln2_ordered_date} onChange={(e) => setReservoirForm((p) => ({ ...p, ln2_ordered_date: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">LN2 Received Date</label>
                                        <input type="date" value={reservoirForm.ln2_received_date} onChange={(e) => setReservoirForm((p) => ({ ...p, ln2_received_date: e.target.value }))} className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm" />
                                    </div>
                                </div>
                                {reservoirError && <div className="text-sm text-red-600">{reservoirError}</div>}
                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => !reservoirSubmitting && setIsAddRefillOpen(false)} className="px-4 h-9 rounded-lg border border-[#E7E1E1] text-sm text-gray-700">Cancel</button>
                                    <button type="submit" disabled={reservoirSubmitting} className="px-4 h-9 rounded-lg bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0e63] disabled:opacity-60">
                                        {reservoirSubmitting ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* View Modal */}
            {viewContainer && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-8 py-5 border-b border-[#E7E1E1]">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-xl bg-[#F7ECFF] flex items-center justify-center shrink-0">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b1176" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="3" />
                                        <path d="M9 9h6M9 12h6M9 15h4" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">
                                        {viewContainer.tankCode}
                                        <span className="ml-2 text-sm font-normal text-gray-400">#{viewContainer.tankId}</span>
                                    </h3>
                                    <p className="text-sm text-gray-500">{viewContainer.branch}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewContainer(null)}
                                className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Info cards */}
                        <div className="px-8 py-5 bg-[#FAFAFA] border-b border-[#E7E1E1] flex gap-4">
                            <div className="flex-1 bg-white rounded-xl border border-[#E7E1E1] px-5 py-4">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Last Refill</p>
                                <p className="text-base font-semibold text-[#6b1176]">{formatDaysAgo(viewContainer.lastRefillDate)}</p>
                            </div>
                            <div className="flex-1 bg-white rounded-xl border border-[#E7E1E1] px-5 py-4">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                                <p className="text-base font-semibold text-gray-800">{viewContainer.lastRefillDate}</p>
                            </div>
                        </div>

                        {/* Section label */}
                        <div className="px-8 pt-6 pb-3 shrink-0">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Refill History</h4>
                        </div>

                        {/* Logs table */}
                        <div className="flex-1 overflow-auto min-h-0 pb-6">
                            {viewLoading && (
                                <div className="py-12 text-sm text-gray-400 text-center">Loading logs...</div>
                            )}
                            {viewError && (
                                <div className="py-12 text-sm text-red-500 text-center">{viewError}</div>
                            )}
                            {!viewLoading && !viewError && viewLogs.length === 0 && (
                                <div className="py-12 text-sm text-gray-400 text-center">No refill logs found.</div>
                            )}
                            {!viewLoading && !viewError && viewLogs.length > 0 && (
                                <table className="w-full text-sm border-collapse">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="border-b border-[#E7E1E1]">
                                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-8 py-3 pr-4">Date</th>
                                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest py-3 pr-4">Time</th>
                                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest py-3 pr-4">Refilled By</th>
                                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest py-3 pr-8">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {viewLogs.map((log) => (
                                            <tr key={log.log_id} className="hover:bg-[#FBF5FF] transition-colors">
                                                <td className="px-8 py-4 pr-4 text-gray-800 font-medium whitespace-nowrap">{log.refill_date || "—"}</td>
                                                <td className="py-4 pr-4 text-gray-500 whitespace-nowrap">{log.refill_time || "—"}</td>
                                                <td className="py-4 pr-4">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="w-7 h-7 rounded-full bg-[#F7ECFF] text-[#6b1176] text-[11px] font-bold flex items-center justify-center shrink-0">
                                                            {(log.refilled_by || "?")[0].toUpperCase()}
                                                        </span>
                                                        <span className="text-gray-700">{log.refilled_by || "—"}</span>
                                                    </span>
                                                </td>
                                                <td className="py-4 pr-8 text-gray-500 max-w-[200px] truncate">{log.description || "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};

export default RefillLog;
