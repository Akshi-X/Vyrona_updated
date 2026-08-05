import { useEffect, useMemo, useRef, useState } from "react";
import { useOnboardingMode } from "../../contexts/OnboardingModeContext";
import PageLayout from "../../components/PageLayout";
import Modal from "../../components/Modal";
import RefillIcon from "../../components/RefillIcon";
import { useAuth } from "../../contexts/AuthContext";
import { ivfService, type IvfBranch, type RefillLogItem } from "../../services/ivfService";
import { userService, type UserListItem } from "../../services/userService";

type ContainerItem = {
    id: string;
    tankId: string;
    tankCode: string;
    containerNo: string;
    branch: string;
    branchId?: number | null;
    lastRefillDate: string;
    lastRefilledBy?: string;
    lastDescription?: string;
    lastLogDate?: string;
    lastLogTime?: string;
    kpiConfigId?: number | null;   // kpi_config_id for ln2_level
    kpiStatus?: boolean | null;    // status of ln2_level kpi_config
    ln2LevelKg?: number | null;   // raw kg from ln2_mass_kg
    ln2ConfigMin?: number | null;
    tankMaxCapacity?: number | null;
    tankMinCapacity?: number | null;
};

type RefillLogCreateForm = {
    refill_date: string;
    refill_time: string;
    refilled_by: string;
    description: string;
    status: string;
    reservoir_id: string;
    refill_weight: string;
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
    const { isAuthenticated, userRole } = useAuth();
    const isOnboarding = useOnboardingMode();
    const isOnboardingRef = useRef(isOnboarding);
    isOnboardingRef.current = isOnboarding;
    const [selectedBranch] = useState<string>("All");
    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [containers, setContainers] = useState<ContainerItem[]>([]);
    const [containersLoading, setContainersLoading] = useState(false);

    const [activityBranch, setActivityBranch] = useState<string>("All");
    const [isActivityBranchOpen, setIsActivityBranchOpen] = useState(false);
    const activityBranchRef = useRef<HTMLDivElement>(null);
    const [pendingDetections, setPendingDetections] = useState<{
        id: number;
        tank_id: number;
        tank_code: string | null;
        branch_name: string | null;
        detected_at: string | null;
        refill_weight: number | null;
    }[]>([]);
    const [dismissingId, setDismissingId] = useState<number | null>(null);
    const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [rejectSubmitting, setRejectSubmitting] = useState(false);
    const [pendingAddDetectionId, setPendingAddDetectionId] = useState<number | null>(null);
    const [detectionsLoading, setDetectionsLoading] = useState(true);
    const [showAllDetectionsModal, setShowAllDetectionsModal] = useState(false);
    const [detectionsModalBranch, setDetectionsModalBranch] = useState<string>("All");
    const detectionScrollRef = useRef<HTMLDivElement>(null);
    const scrollDetections = (dir: "left" | "right") => {
        if (!detectionScrollRef.current) return;
        detectionScrollRef.current.scrollBy({ left: dir === "right" ? 280 : -280, behavior: "smooth" });
    };
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
        refillWeight?: number | null;
    }[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [reservoirs, setReservoirs] = useState<{ reservoir_id: number; reservoir_name: string; hospital_id: number | null; branch_id: number | null; branch_name: string | null; current_weight: number | null; max_weight: number | null }[]>([]);
    const [selectedReservoirId, setSelectedReservoirId] = useState<number | null>(null);
    const [isReservoirDropdownOpen, setIsReservoirDropdownOpen] = useState(false);
    const reservoirDropdownRef = useRef<HTMLDivElement>(null);
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
        refill_weight: "",
    });

    useEffect(() => {
        const loadPendingDetections = async () => {
            setDetectionsLoading(true);
            try {
                const res = await ivfService.getPendingRefillDetections();
                setPendingDetections(Array.isArray(res?.detections) ? res.detections : []);
            } catch {
                setPendingDetections([]);
            } finally {
                setDetectionsLoading(false);
            }
        };
        if (isAuthenticated) loadPendingDetections();
    }, [isAuthenticated]);

    const dismissDetection = async (id: number, isConfirmed: boolean, notes?: string) => {
        setDismissingId(id);
        try {
            await ivfService.reviewRefillDetection(id, isConfirmed, notes);
        } catch {
            // best-effort — still remove from UI
        }
        setTimeout(() => {
            setPendingDetections((prev) => prev.filter((d) => d.id !== id));
            setDismissingId(null);
        }, 300);
    };

    const submitReject = async () => {
        if (!rejectDialogId) return;
        setRejectSubmitting(true);
        await dismissDetection(rejectDialogId, false, rejectReason.trim() || undefined);
        setRejectDialogId(null);
        setRejectReason("");
        setRejectSubmitting(false);
    };

    const branchDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
                // dropdown closed via click outside
            }
            if (activityBranchRef.current && !activityBranchRef.current.contains(e.target as Node)) {
                setIsActivityBranchOpen(false);
            }
            if (reservoirDropdownRef.current && !reservoirDropdownRef.current.contains(e.target as Node)) {
                if (!isOnboardingRef.current) setIsReservoirDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const loadPageData = async () => {
            setContainersLoading(true);
            setActivityLoading(true);
            try {
                const pageData = await ivfService.getRefillLogPageData();

                // Map tanks to containers
                const containers: ContainerItem[] = (pageData?.tanks ?? []).map((tank) => ({
                    id: String(tank.tank_id),
                    tankId: String(tank.tank_id),
                    tankCode: tank.tank_code ?? "-",
                    containerNo: tank.tank_code ?? "-",
                    branch: tank.branch_name ?? "N/A",
                    branchId: tank.branch_id ?? null,
                    lastRefillDate: tank.last_refill_date ? new Date(tank.last_refill_date).toLocaleDateString("en-GB") : "NA",
                    lastRefilledBy: tank.last_refilled_by ?? "-",
                    lastDescription: tank.last_description ?? "-",
                    lastLogDate: tank.last_refill_date ?? "-",
                    lastLogTime: tank.last_refill_time ?? "-",
                    kpiConfigId: tank.kpi_config_id ?? null,
                    kpiStatus: tank.kpi_status ?? null,
                    ln2LevelKg: tank.ln2_mass_kg ?? null,
                    ln2ConfigMin: tank.ln2_config_min ?? null,
                    tankMaxCapacity: tank.tank_max_capacity ?? null,
                    tankMinCapacity: tank.tank_min_capacity ?? null,
                }));
                setContainers(containers);

                // Map logs to activity logs
                const activityLogs = (pageData?.logs ?? []).map((log) => ({
                    timestamp: (() => {
                        if (!log.refill_date) return "-";
                        const dt = new Date(`${log.refill_date}T${log.refill_time ?? "00:00:00"}`);
                        const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                        const time = log.refill_time ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;
                        return time ? `${date}, ${time}` : date;
                    })(),
                    sortKey: `${log.refill_date ?? ""}T${log.refill_time ?? ""}`,
                    tankCode: log.tank_code ?? "-",
                    branch: log.branch_name ?? "-",
                    operator: log.refilled_by ?? "-",
                    description: log.description ?? "-",
                    status: log.status ?? "-",
                    refillWeight: log.refill_weight ?? null,
                }));
                setAllActivityLogs(activityLogs);
            } catch {
                setContainers([]);
                setAllActivityLogs([]);
            } finally {
                setContainersLoading(false);
                setActivityLoading(false);
            }
        };
        if (isAuthenticated) loadPageData();
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
                const profile = await userService.getProfile();
                const res = profile?.hospital_id
                    ? await userService.getUsersByHospital(profile.hospital_id)
                    : await userService.getAllUsersInCompany();
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
            const allReservoirs = Array.isArray(resRes?.reservoirs) ? resRes.reservoirs : [];
            const filtered = allReservoirs;
            setReservoirs(filtered);
            if (filtered.length > 0) setSelectedReservoirId((prev) => prev ?? filtered[0].reservoir_id);
            setReservoirLogs(Array.isArray(logsRes?.logs) ? logsRes.logs : []);
        } finally {
            setReservoirLogsLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated && userRole !== undefined) loadReservoirData();
    }, [isAuthenticated, userRole]);

    useEffect(() => {
        const handler = () => {
            setAddForm((p) => ({ ...p, reservoir_id: "16", refilled_by: "Avery Morgan" }));
        };
        document.addEventListener("onboarding:prefill-add-refill-log", handler);
        return () => document.removeEventListener("onboarding:prefill-add-refill-log", handler);
    }, []);

    useEffect(() => {
        const handler = () => {
            setEditingLogId(7);
            setEditLogForm({ ln2_ordered_date: "2026-04-20", ln2_received_date: "2026-04-25" });
        };
        document.addEventListener("onboarding:prefill-reservoir-received-date", handler);
        return () => document.removeEventListener("onboarding:prefill-reservoir-received-date", handler);
    }, []);

    useEffect(() => {
        const handler = () => setIsReservoirDropdownOpen(true);
        document.addEventListener("onboarding:open-reservoir-dropdown", handler);
        return () => document.removeEventListener("onboarding:open-reservoir-dropdown", handler);
    }, []);

    const branchOptions = useMemo(() => {
        const options = new Set<string>();
        branches.forEach((b) => { if (b?.branch_name?.trim()) options.add(b.branch_name.trim()); });
        return ["All", ...Array.from(options)];
    }, [branches]);

    const filteredContainers = useMemo(() => {
        if (selectedBranch === "All") return containers;
        return containers.filter((c) => c.branch === selectedBranch);
    }, [containers, selectedBranch]);

    const sortedDetections = useMemo(() => {
        return [...pendingDetections].sort((a, b) => {
            if (!a.detected_at) return 1;
            if (!b.detected_at) return -1;
            return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
        });
    }, [pendingDetections]);

    const visibleDetections = useMemo(() => {
        return sortedDetections.slice(0, 10);
    }, [sortedDetections]);

    const detectionBranchOptions = useMemo(() => {
        const options = new Set<string>();
        sortedDetections.forEach((d) => { if (d?.branch_name?.trim()) options.add(d.branch_name.trim()); });
        return ["All", ...Array.from(options)];
    }, [sortedDetections]);

    const filteredDetectionsForModal = useMemo(() => {
        if (detectionsModalBranch === "All") return sortedDetections;
        return sortedDetections.filter((d) => d.branch_name === detectionsModalBranch);
    }, [sortedDetections, detectionsModalBranch]);

    const getDateLabel = (isoStr: string | null): string => {
        if (!isoStr) return "Unknown";
        const parsed = new Date(isoStr);
        const today = new Date();
        const itemDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        if (itemDate.getTime() === todayDate.getTime()) return "Today";
        if (itemDate.getTime() === yesterdayDate.getTime()) return "Yesterday";
        return itemDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    };

    const groupedDetectionsForModal = useMemo(() => {
        const grouped: Record<string, typeof filteredDetectionsForModal> = {};
        filteredDetectionsForModal.forEach((d) => {
            const label = getDateLabel(d.detected_at);
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push(d);
        });
        return grouped;
    }, [filteredDetectionsForModal]);

    const formatDetectedAt = (isoStr: string | null): string => {
        if (!isoStr) return "—";
        const dt = new Date(isoStr);
        const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
        const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        return `${date} ${time}`;
    };

    const resetAddForm = (prefillDate?: string, prefillTime?: string, prefillWeight?: number | null) => {
        setAddForm({
            refill_date: prefillDate ?? new Date().toISOString().slice(0, 10),
            refill_time: prefillTime ?? "09:00",
            refilled_by: "",
            description: "",
            status: "Not started",
            reservoir_id: "",
            refill_weight: prefillWeight != null ? String(prefillWeight) : "",
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
        if (!addForm.reservoir_id) { setAddError("Reservoir is required."); return; }
        if (!addForm.refill_weight) { setAddError("Refill Weight is required."); return; }
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
                ...(addForm.refill_weight !== "" ? { refill_weight: Number(addForm.refill_weight) } : {}),
            });
            if (pendingAddDetectionId !== null) {
                dismissDetection(pendingAddDetectionId, true);
                setPendingAddDetectionId(null);
            }
            setIsAddRefillOpen(false);
            loadReservoirData();
            // Reload activity log so the new entry appears immediately
            try {
                const tankIdList = containers.map((c) => Number(c.tankId));
                const logsRes = await ivfService.getAllTanksRefillLogs(tankIdList).catch(() => null);
                const merged = (logsRes?.logs ?? []).map((log) => ({
                    timestamp: (() => {
                        if (!log.refill_date) return "-";
                        const dt = new Date(`${log.refill_date}T${log.refill_time ?? "00:00:00"}`);
                        const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                        const time = log.refill_time ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;
                        return time ? `${date}, ${time}` : date;
                    })(),
                    sortKey: `${log.refill_date ?? ""}T${log.refill_time ?? ""}`,
                    tankCode: log.tank_code ?? "-",
                    branch: log.branch_name ?? "-",
                    operator: log.refilled_by ?? "-",
                    description: log.description ?? "-",
                    status: log.status ?? "-",
                    refillWeight: log.refill_weight ?? null,
                }));
                setAllActivityLogs(merged);
            } catch { /* non-critical */ }
        } catch (error) {
            setAddError((error as Error)?.message || "Failed to create refill log");
        } finally {
            setAddSubmitting(false);
        }
    };

    return (
        <>
        <PageLayout
                title="Refill Logs"
                description="Track LN2 refill activities and reservoir inventory."
                lucideIcon={RefillIcon}
                actions={
                    <button
                        type="button"
                        onClick={() => { resetAddForm(); setAddModalTab("refill"); setIsAddRefillOpen(true); }}
                        className="px-5 h-9 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary-bg transition-colors"
                    >
                        Add Logs
                    </button>
                }
            >

                {/* Refill Detection Tiles — shimmer while loading */}
                {detectionsLoading && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary-bg text-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                </svg>
                            </div>
                            <span className="text-sm font-semibold text-gray-800">Refill Detected</span>
                        </div>
                        <div className="flex gap-3 overflow-hidden">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="flex-none w-[460px] rounded-xl border-2 border-gray-100 bg-gray-50 p-4 flex flex-col gap-3">
                                    <div className="flex items-start justify-between">
                                        <div className="w-20 h-6 rounded-lg bg-gray-200 animate-pulse" />
                                        <div className="w-6 h-6 rounded-md bg-gray-200 animate-pulse" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex gap-2">
                                            <div className="w-16 h-3 rounded bg-gray-200 animate-pulse" />
                                            <div className="w-24 h-3 rounded bg-gray-200 animate-pulse" />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="w-16 h-3 rounded bg-gray-200 animate-pulse" />
                                            <div className="w-28 h-3 rounded bg-gray-200 animate-pulse" />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="w-16 h-3 rounded bg-gray-200 animate-pulse" />
                                            <div className="w-16 h-3 rounded bg-gray-200 animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="w-full h-8 rounded-lg bg-gray-200 animate-pulse mt-auto" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Refill Detection Tiles */}
                {!detectionsLoading && pendingDetections.length > 0 && (
                        <div id="onboarding-refill-detected" className="relative">
                            {/* Header row */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary-bg text-primary">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                        </svg>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-800">Refill Detected</span>
                                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold">
                                        {pendingDetections.length}
                                    </span>
                                    {pendingDetections.length > 10 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllDetectionsModal(true)}
                                            className="text-xs font-medium text-primary hover:text-[#5a0e63] transition-colors underline"
                                        >
                                            View All
                                        </button>
                                    )}
                                </div>
                                {/* Scroll arrows */}
                                {pendingDetections.length > 1 && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => scrollDetections("left")}
                                            className="w-7 h-7 rounded-lg border border-[#E7D4F0] bg-white flex items-center justify-center text-primary hover:bg-primary-bg transition-colors"
                                            aria-label="Scroll left"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => scrollDetections("right")}
                                            className="w-7 h-7 rounded-lg border border-[#E7D4F0] bg-white flex items-center justify-center text-primary hover:bg-primary-bg transition-colors"
                                            aria-label="Scroll right"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Scrollable tile row */}
                            <div
                                ref={detectionScrollRef}
                                className="flex gap-3 overflow-x-auto pb-1 w-fit max-w-full"
                                style={{ scrollbarWidth: "none" }}
                            >
                                {visibleDetections.map((detection, detIdx) => {
                                    const isDismissing = dismissingId === detection.id;
                                    const detectedAtParts = detection.detected_at
                                        ? (() => {
                                            const dt = new Date(detection.detected_at);
                                            return {
                                                date: dt.toISOString().slice(0, 10),
                                                time: dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
                                            };
                                          })()
                                        : null;
                                    return (
                                        <div
                                            key={detection.id}
                                            id={detIdx === 0 ? "onboarding-refill-first-card" : undefined}
                                            className="flex-none w-[380px] rounded-xl border-2 border-[#E7D4F0] bg-gradient-to-br from-primary-bg/60 to-white p-4 flex flex-col gap-3"
                                            style={{
                                                transition: "opacity 0.25s ease, transform 0.25s ease",
                                                opacity: isDismissing ? 0 : 1,
                                                transform: isDismissing ? "scale(0.95)" : "scale(1)",
                                            }}
                                        >
                                            {/* Tile top row: tank badge + dismiss */}
                                            <div className="flex items-start justify-between">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-bg text-primary text-xs font-semibold">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                                    </svg>
                                                    {detection.tank_code ?? "—"}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setRejectDialogId(detection.id); setRejectReason(""); }}
                                                    className="w-6 h-6 rounded-md flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                                                    aria-label="Reject detection"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                                    </svg>
                                                </button>
                                            </div>

                                            {/* Info + Add Logs */}
                                            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                                                {/* Info rows */}
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] text-gray-400 w-20 shrink-0">Branch</span>
                                                        <span className="text-[12px] font-medium text-gray-800 truncate">{detection.branch_name ?? "—"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] text-gray-400 w-20 shrink-0">Date & Time</span>
                                                        <span className="text-[12px] font-medium text-gray-800">{formatDetectedAt(detection.detected_at)}</span>
                                                    </div>
                                                    {detection.refill_weight !== null && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] text-gray-400 w-20 shrink-0">Weight</span>
                                                            <span className="text-[12px] font-medium text-gray-800">{detection.refill_weight} kg</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Add Logs button */}
                                                <button
                                                    id={detIdx === 0 ? "onboarding-refill-add-logs-btn" : undefined}
                                                    type="button"
                                                    onClick={() => {
                                                        setPendingAddDetectionId(detection.id);
                                                        resetAddForm(detectedAtParts?.date, detectedAtParts?.time, detection.refill_weight);
                                                        setSelectedTankId(String(detection.tank_id));
                                                        setAddModalTab("refill");
                                                        setIsAddRefillOpen(true);
                                                    }}
                                                    className="w-full md:w-auto md:shrink-0 flex items-center justify-center gap-1.5 px-5 h-9 rounded-lg bg-primary text-white text-xs font-medium hover:bg-[#5a0e63] transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M12 5v14M5 12h14" />
                                                    </svg>
                                                    Add Logs
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {pendingDetections.length > 10 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllDetectionsModal(true)}
                                        className="flex-none w-[180px] rounded-xl border-2 border-dashed border-[#E7D4F0] flex flex-col items-center justify-center gap-2 text-primary text-xs font-medium hover:bg-primary-bg transition-colors"
                                    >
                                        <span>View All</span>
                                        <span className="text-[10px] text-gray-400">{pendingDetections.length} detections</span>
                                    </button>
                                )}
                            </div>
                        </div>
                )}

                {/* Two panels */}
                <div className="grid grid-cols-1 min-[1436px]:grid-cols-2 min-[1436px]:h-[400px] gap-6">

                    {/* Left: Active Tank Status */}
                    <div id="onboarding-refill-tank-status" className="bg-white border border-line rounded-lg flex flex-col overflow-hidden max-h-[420px]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
                            <h2 className="font-semibold text-black text-base">Active Tank Status</h2>
                        </div>

                        {/* Table header */}
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,110px)_minmax(0,80px)] px-4 py-2 bg-primary-bg text-xs font-semibold text-primary shrink-0">
                            <div>Container #</div>
                            <div className="text-center">LN2 Level</div>
                            <div className="text-center">View</div>
                            <div className="text-center">Last Refill</div>
                        </div>

                        {/* Container list */}
                        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-100">
                            {containersLoading && (
                                [0,1,2,3].map((i) => (
                                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,110px)_minmax(0,80px)] px-4 py-2.5 items-center gap-x-2">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="relative overflow-hidden h-3 w-24 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                            <div className="relative overflow-hidden h-2.5 w-16 rounded bg-gray-100"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        </div>
                                        <div className="px-2"><div className="relative overflow-hidden h-2.5 w-full rounded-full bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></div>
                                        <div className="relative overflow-hidden h-3 w-10 rounded bg-gray-200 mx-auto"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        <div className="relative overflow-hidden h-3 w-14 rounded bg-gray-200 mx-auto"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                    </div>
                                ))
                            )}
                            {!containersLoading && filteredContainers.length === 0 && (
                                <div className="p-4 text-xs text-gray-500">No containers found.</div>
                            )}
                            {!containersLoading && filteredContainers.map((container, cIdx) => (
                                <div
                                    key={container.id}
                                    id={cIdx === 0 ? "onboarding-refill-tank-first-row" : undefined}
                                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,110px)_minmax(0,80px)] px-4 py-2.5 items-center"
                                >
                                    <div className="min-w-0">
                                        <span className="text-primary text-xs font-bold block truncate">
                                            {container.tankCode} ({container.tankId})
                                        </span>
                                        <span className="text-xs text-gray-500 truncate block">{container.branch}</span>
                                    </div>
                                    {/* LN2 Level progress bar */}
                                    <div className="px-2 flex flex-col items-stretch gap-0.5">
                                        {container.ln2LevelKg != null && container.kpiStatus === true ? (() => {
                                            const usableCapacity = container.tankMaxCapacity != null && container.tankMinCapacity != null
                                                ? container.tankMaxCapacity - container.tankMinCapacity
                                                : null;
                                            const ln2Pct = container.ln2LevelKg != null && usableCapacity != null && usableCapacity > 0
                                                ? Math.min(100, Math.max(0, Math.floor((container.ln2LevelKg / usableCapacity) * 100)))
                                                : null;
                                            const l2Pct = container.ln2ConfigMin != null && usableCapacity != null && usableCapacity > 0
                                                ? Math.floor((container.ln2ConfigMin / usableCapacity) * 100)
                                                : null;
                                            return (
                                                <>
                                                    {/* Bar */}
                                                    <div className="relative h-2.5 rounded-full bg-[#E7D4F0] overflow-visible">
                                                        {ln2Pct != null && (
                                                            <div
                                                                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                                                                style={{ width: `${ln2Pct}%` }}
                                                            />
                                                        )}
                                                        {/* L2 threshold marker */}
                                                        {l2Pct != null && (
                                                            <div
                                                                className="absolute top-0 w-0.5 h-full bg-orange-400 -translate-x-1/2"
                                                                style={{ left: `${Math.min(100, Math.max(0, l2Pct))}%` }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <span className="text-[10px] text-primary font-medium">{ln2Pct != null ? `LN2 - ${ln2Pct}%` : '—'}</span>
                                                        {l2Pct != null && (
                                                            <span className="text-[10px] text-orange-500 font-medium">L2 - {l2Pct}%</span>
                                                        )}
                                                    </div>
                                                </>
                                            );
                                        })() : (
                                            <span className="text-xs text-gray-400 self-center">—</span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-center gap-1.5">
                                        <button
                                            id={cIdx === 0 ? "onboarding-refill-tank-view-btn" : undefined}
                                            type="button"
                                            onClick={() => openView(container)}
                                            className="px-2 h-6 rounded-md border border-primary text-primary text-[10px] font-medium hover:bg-primary-bg transition-colors"
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
                    <div id="onboarding-refill-reservoir-logs" className="bg-white border border-line rounded-lg flex flex-col overflow-hidden max-h-[420px]">
                        <div className="px-4 py-3 border-b border-line shrink-0">
                            <h2 className="font-semibold text-black text-base">Reservoir Logs</h2>
                        </div>
                        <div className="flex flex-1 min-h-0 overflow-hidden max-[880px]:flex-col">
                            {/* Left: Cryocan SVG + reservoir dropdown */}
                            <div id="onboarding-refill-reservoir-svg-panel" className="relative flex flex-col items-center justify-center shrink-0 px-3 py-3 gap-3 border-r border-line max-[880px]:border-r-0 max-[880px]:border-b">
                                {/* Coming Soon overlay — hidden during onboarding */}
                                {!isOnboarding && (
                                    <div className="absolute inset-0 backdrop-blur-3xl bg-white/40 rounded z-10 flex items-center justify-center">
                                        <img src="/res.png" alt="Coming Soon" className="max-w-[90%] max-h-[90%] object-contain" />
                                    </div>
                                )}
                                {(() => {
                                    const selected = reservoirs.find(r => r.reservoir_id === selectedReservoirId);
                                    const cur = selected?.current_weight ?? 0;
                                    const max = selected?.max_weight ?? 0;
                                    const pct = max > 0 ? Math.min(100, Math.floor((cur / max) * 100)) : 0;
                                    const tankBodyTop = 50;
                                    const tankBodyHeight = 220;
                                    const tankBodyBottom = tankBodyTop + tankBodyHeight;
                                    const fillHeight = (tankBodyHeight * pct) / 100;
                                    const fillY = tankBodyBottom - fillHeight;
                                    const fillColor = pct <= 20 ? "#EF4444" : pct <= 50 ? "#F59E0B" : "#9B72B0";
                                    const fillColorEnd = pct <= 20 ? "#FCA5A5" : pct <= 50 ? "#FCD34D" : "#B58BC6";
                                    return (
                                        <>
                                            <svg width="200" height="320" viewBox="0 0 200 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Reservoir tank">
                                                <defs>
                                                    <linearGradient id="res-fill-gradient" x1="0" x2="0" y1="1" y2="0">
                                                        <stop offset="0%" stopColor={fillColor} />
                                                        <stop offset="100%" stopColor={fillColorEnd} />
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
                                                {/* LN2 fill — dynamic */}
                                                <g clipPath="url(#res-body-clip)">
                                                    {pct > 0 && (
                                                        <>
                                                            <rect x="30" y={fillY} width="140" height={fillHeight} fill="url(#res-fill-gradient)" />
                                                            <path d={`M30 0 Q55 -6 80 0 T130 0 T170 0`} fill={fillColorEnd} opacity="0.9" transform={`translate(0,${fillY})`}>
                                                                <animate attributeName="d" values="M30 0 Q55 -6 80 0 T130 0 T170 0;M30 0 Q55 6 80 0 T130 0 T170 0;M30 0 Q55 -6 80 0 T130 0 T170 0" dur="3s" repeatCount="indefinite" />
                                                            </path>
                                                            <ellipse cx="100" cy={fillY} rx="40" ry="3" fill="white" opacity="0.3">
                                                                <animate attributeName="opacity" values="0.3;0.5;0.3" dur="2s" repeatCount="indefinite" />
                                                            </ellipse>
                                                        </>
                                                    )}
                                                </g>
                                                {/* Inner shadow */}
                                                <rect x="30" y="50" width="140" height="220" rx="30" fill="none" stroke="var(--color-primary)" strokeWidth="1" opacity="0.1" />
                                                {/* Percentage */}
                                                <text x="100" y="163" textAnchor="middle" fontSize="24" fontWeight="bold" fill="var(--color-primary)" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{pct}%</text>
                                                {/* Reservoir name — one word per line */}
                                                {(selected?.reservoir_name ?? "").split(" ").map((word, i) => (
                                                    <text key={i} x="100" y={183 + i * 14} textAnchor="middle" fontSize="11" fill="var(--color-primary)" opacity="0.7" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{word}</text>
                                                ))}
                                            </svg>
                                            {/* Reservoir dropdown — custom UI */}
                                            <div className="relative w-full" ref={reservoirDropdownRef}>
                                                <button
                                                    id="onboarding-refill-reservoir-dropdown-btn"
                                                    type="button"
                                                    onClick={() => setIsReservoirDropdownOpen(!isReservoirDropdownOpen)}
                                                    className="w-full flex items-center justify-between gap-2 px-3 h-8 rounded-lg border border-line text-xs text-gray-700 hover:bg-gray-50 transition-colors bg-white"
                                                >
                                                    <span className="truncate text-primary font-medium">
                                                        {reservoirs.find(r => r.reservoir_id === selectedReservoirId)?.branch_name
                                                            ?? reservoirs.find(r => r.reservoir_id === selectedReservoirId)?.reservoir_name
                                                            ?? "Select reservoir"}
                                                    </span>
                                                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform text-gray-400 ${isReservoirDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                {isReservoirDropdownOpen && (
                                                    <div id="onboarding-refill-reservoir-dropdown" className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                                                        {reservoirs.length === 0 && (
                                                            <div className="px-3 py-2 text-xs text-gray-400">No reservoirs</div>
                                                        )}
                                                        {[...reservoirs].sort((a, b) => (a.branch_name ?? a.reservoir_name).localeCompare(b.branch_name ?? b.reservoir_name)).map((r) => (
                                                            <button
                                                                key={r.reservoir_id}
                                                                id={r.reservoir_id === 13 ? "onboarding-refill-reservoir-delhi-btn" : undefined}
                                                                type="button"
                                                                onClick={() => { setSelectedReservoirId(r.reservoir_id); setIsReservoirDropdownOpen(false); }}
                                                                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                                                                    selectedReservoirId === r.reservoir_id
                                                                        ? "bg-primary text-white"
                                                                        : "text-primary hover:bg-gray-50"
                                                                }`}
                                                            >
                                                                {r.branch_name ?? r.reservoir_name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Right: table */}
                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                {/* Table header */}
                                <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_20px] gap-x-2 px-4 py-2 bg-primary-bg text-xs font-semibold text-primary shrink-0">
                                    <div>Reservoir</div>
                                    <div>LN2 Ordered</div>
                                    <div>LN2 Received</div>
                                    <div />
                                </div>
                                <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-100">
                                    {reservoirLogsLoading && (
                                        [0,1,2,3].map((i) => (
                                            <div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_90px_20px] gap-x-2 px-4 py-2.5 items-center">
                                                <div className="relative overflow-hidden h-3 w-28 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                                <div className="relative overflow-hidden h-3 w-16 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                                <div className="relative overflow-hidden h-3 w-16 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                                <div />
                                            </div>
                                        ))
                                    )}
                                    {!reservoirLogsLoading && reservoirLogs.length === 0 && (
                                        <div className="p-4 text-xs text-gray-400">No reservoir logs found.</div>
                                    )}
                                    {!reservoirLogsLoading && reservoirLogs.map((log, rIdx) => {
                                        const isEditing = editingLogId === log.log_id;
                                        return (
                                            <div
                                                key={log.log_id}
                                                id={rIdx === 0 ? "onboarding-refill-reservoir-first-row" : undefined}
                                                className="grid grid-cols-[minmax(0,1fr)_90px_90px_20px] gap-x-2 px-4 py-2 items-center hover:bg-gray-50"
                                            >
                                                <div className="flex items-center min-w-0">
                                                    <span className="text-sm font-medium text-gray-800 break-words">{log.reservoir_name}</span>
                                                </div>
                                                {isEditing ? (
                                                    <input
                                                        type="date"
                                                        value={editLogForm.ln2_ordered_date}
                                                        onChange={(e) => setEditLogForm(f => ({ ...f, ln2_ordered_date: e.target.value }))}
                                                        className="text-xs border border-primary rounded px-1 py-0.5 w-full focus:outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-600 truncate text-center">{log.ln2_ordered_date ?? "—"}</span>
                                                )}
                                                <div id={rIdx === 0 ? "onboarding-refill-reservoir-date-input" : undefined} className="flex items-center">
                                                    {isEditing ? (
                                                        <input
                                                            type="date"
                                                            value={editLogForm.ln2_received_date}
                                                            onChange={(e) => setEditLogForm(f => ({ ...f, ln2_received_date: e.target.value }))}
                                                            className="text-xs border border-primary rounded px-1 py-0.5 w-full focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="text-xs text-gray-600 truncate text-center">{log.ln2_received_date ?? "—"}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-end">
                                                    {isEditing ? (
                                                        <button
                                                            id={rIdx === 0 ? "onboarding-refill-reservoir-save-btn" : undefined}
                                                            type="button"
                                                            disabled={editLogSaving}
                                                            onClick={() => saveEditLog(log.log_id)}
                                                            className="text-primary hover:text-[#5a0e63] disabled:opacity-50"
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
                                                            id={rIdx === 0 ? "onboarding-refill-reservoir-edit-btn" : undefined}
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingLogId(log.log_id);
                                                                setEditLogForm({
                                                                    ln2_ordered_date: log.ln2_ordered_date ?? "",
                                                                    ln2_received_date: log.ln2_received_date ?? "",
                                                                });
                                                            }}
                                                            className="text-primary hover:text-[#5a0e63] transition-colors"
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
                <div id="onboarding-refill-activity-log" className="flex-1 min-h-0 bg-white border border-line rounded-xl overflow-hidden flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
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
                                className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-line text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                <span className={activityBranch !== "All" ? "text-primary font-medium" : ""}>
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
                                                activityBranch === option ? "bg-primary text-white" : "text-primary hover:bg-gray-50"
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
                        {/* Header */}
                        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,120px)_minmax(0,110px)_minmax(0,110px)_minmax(0,140px)_minmax(0,100px)] px-4 py-2 bg-primary-bg text-xs font-semibold text-primary shrink-0 sticky top-0 z-10">
                            <div>Timestamp</div>
                            <div>Tank</div>
                            <div>Branch</div>
                            <div>Operator</div>
                            <div>Description</div>
                            <div className="text-right">Refill Weight</div>
                        </div>

                        {/* Rows */}
                        <div className="divide-y divide-gray-100">
                            {activityLoading && (
                                [0,1,2,3,4].map((i) => (
                                    <div key={i} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,120px)_minmax(0,110px)_minmax(0,110px)_minmax(0,140px)_minmax(0,100px)] px-4 py-2.5 items-center gap-x-2">
                                        <div className="relative overflow-hidden h-3 w-32 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        <div className="relative overflow-hidden h-3 w-12 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        <div className="relative overflow-hidden h-3 w-20 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        <div className="relative overflow-hidden h-3 w-24 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        <div className="relative overflow-hidden h-3 w-36 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                        <div className="relative overflow-hidden h-3 w-16 rounded bg-gray-200"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div>
                                    </div>
                                ))
                            )}
                            {!activityLoading && allActivityLogs.filter((r) => activityBranch === "All" || r.branch === activityBranch).map((row, i) => (
                                <div key={i} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,120px)_minmax(0,110px)_minmax(0,110px)_minmax(0,140px)_minmax(0,100px)] px-4 py-2.5 items-center hover:bg-gray-50">
                                    <div className="text-xs text-gray-600">{row.timestamp}</div>
                                    <div className="text-xs font-semibold text-primary">{row.tankCode}</div>
                                    <div className="text-xs text-gray-600">{row.branch}</div>
                                    <div className="text-xs text-gray-600">{row.operator}</div>
                                    <div className="text-xs text-gray-500 truncate">{row.description}</div>
                                    <div className="text-right text-xs text-gray-600">{row.refillWeight != null ? `${row.refillWeight} kg` : "-"}</div>
                                </div>
                            ))}
                            {!activityLoading && allActivityLogs.filter((r) => activityBranch === "All" || r.branch === activityBranch).length === 0 && (
                                <div className="px-5 py-6 text-center text-sm text-gray-400">No recent activity.</div>
                            )}
                        </div>
                    </div>
                </div>
            </PageLayout>

            {/* Add Refill / Reservoir Modal */}
            {isAddRefillOpen && (
                <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
                    <div id="onboarding-refill-add-modal" className="w-full max-w-xl bg-white rounded-lg border border-line p-5">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-black">Add Log</h3>
                            <button type="button" onClick={() => { if (!(addSubmitting || reservoirSubmitting)) { setIsAddRefillOpen(false); setPendingAddDetectionId(null); } }} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        {/* Toggle */}
                        <div className="flex items-center gap-1 p-1 bg-primary-bg rounded-lg mb-4 w-fit">
                            <button
                                type="button"
                                onClick={() => setAddModalTab("refill")}
                                className={`px-4 h-8 rounded-md text-sm font-medium transition-colors ${addModalTab === "refill" ? "bg-primary text-white" : "text-primary hover:bg-white/60"}`}
                            >
                                Refill Logs
                            </button>
                            <button
                                type="button"
                                onClick={() => setAddModalTab("reservoir")}
                                className={`px-4 h-8 rounded-md text-sm font-medium transition-colors ${addModalTab === "reservoir" ? "bg-primary text-white" : "text-primary hover:bg-white/60"}`}
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
                                                const branchReservoirs = tank
                                                    ? reservoirs.filter((r) => r.branch_id === tank.branchId)
                                                    : [];
                                                const firstReservoir = branchReservoirs[0] ?? reservoirs[0];
                                                setAddForm((p) => ({ ...p, reservoir_id: firstReservoir ? String(firstReservoir.reservoir_id) : "" }));
                                            }} className="w-full h-10 px-3 border border-line rounded-lg text-sm bg-white" required>
                                            <option value="">Select tank</option>
                                            {containers.map((c) => (
                                                <option key={c.tankId} value={c.tankId}>{c.tankCode} ({c.tankId})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                                        <input type="text" value={containers.find((c) => c.tankId === selectedTankId)?.branch ?? ""} readOnly className="w-full h-10 px-3 border border-line rounded-lg text-sm bg-gray-50 text-gray-500" placeholder="Auto-filled" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Reservoir <span className="text-red-500">*</span></label>
                                    <select
                                        value={addForm.reservoir_id}
                                        onChange={(e) => setAddForm((p) => ({ ...p, reservoir_id: e.target.value }))}
                                        className="w-full h-10 px-3 border border-line rounded-lg text-sm bg-white"
                                        required
                                    >
                                        <option value="">Select reservoir</option>
                                        {(selectedTankId
                                            ? reservoirs.filter((r) => r.branch_id === containers.find((c) => c.tankId === selectedTankId)?.branchId)
                                            : reservoirs
                                        ).map((r) => (
                                            <option key={r.reservoir_id} value={r.reservoir_id}>
                                                {r.reservoir_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refill Date <span className="text-red-500">*</span></label>
                                        <input type="date" value={addForm.refill_date} onChange={(e) => setAddForm((p) => ({ ...p, refill_date: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refill Time <span className="text-red-500">*</span></label>
                                        <input type="time" value={addForm.refill_time} onChange={(e) => setAddForm((p) => ({ ...p, refill_time: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm" required />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refilled By <span className="text-red-500">*</span></label>
                                        <select value={addForm.refilled_by} onChange={(e) => setAddForm((p) => ({ ...p, refilled_by: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm bg-white" required>
                                            <option value="">Select user</option>
                                            {users.map((u) => (
                                                <option key={u.user_id} value={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Refill Weight (kg) <span className="text-red-500">*</span></label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={addForm.refill_weight}
                                            onChange={(e) => setAddForm((p) => ({ ...p, refill_weight: e.target.value }))}
                                            placeholder="e.g. 12.5"
                                            className="w-full h-10 px-3 border border-line rounded-lg text-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                        <input type="text" value={addForm.description} onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm" />
                                    </div>
                                </div>
                                {addError && <div className="text-sm text-red-600">{addError}</div>}
                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => { if (!addSubmitting) { setIsAddRefillOpen(false); setPendingAddDetectionId(null); } }} className="px-4 h-9 rounded-lg border border-line text-sm text-gray-700">Cancel</button>
                                    <button id="onboarding-refill-add-save-btn" type="submit" disabled={addSubmitting} className="px-4 h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-[#5a0e63] disabled:opacity-60">
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
                                    <select value={reservoirForm.reservoir_id} onChange={(e) => setReservoirForm((p) => ({ ...p, reservoir_id: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm bg-white" required>
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
                                        <input type="date" value={reservoirForm.ln2_ordered_date} onChange={(e) => setReservoirForm((p) => ({ ...p, ln2_ordered_date: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">LN2 Received Date</label>
                                        <input type="date" value={reservoirForm.ln2_received_date} onChange={(e) => setReservoirForm((p) => ({ ...p, ln2_received_date: e.target.value }))} className="w-full h-10 px-3 border border-line rounded-lg text-sm" />
                                    </div>
                                </div>
                                {reservoirError && <div className="text-sm text-red-600">{reservoirError}</div>}
                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => { if (!reservoirSubmitting) { setIsAddRefillOpen(false); setPendingAddDetectionId(null); } }} className="px-4 h-9 rounded-lg border border-line text-sm text-gray-700">Cancel</button>
                                    <button type="submit" disabled={reservoirSubmitting} className="px-4 h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-[#5a0e63] disabled:opacity-60">
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
                    <div id="onboarding-refill-view-modal" className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-8 py-5 border-b border-line">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-xl bg-primary-bg flex items-center justify-center shrink-0">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                id="onboarding-refill-view-modal-close"
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
                        <div className="px-8 py-5 bg-[#FAFAFA] border-b border-line flex gap-4">
                            <div className="flex-1 bg-white rounded-xl border border-line px-5 py-4">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Last Refill</p>
                                <p className="text-base font-semibold text-primary">{formatDaysAgo(viewContainer.lastRefillDate)}</p>
                            </div>
                            <div className="flex-1 bg-white rounded-xl border border-line px-5 py-4">
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
                                        <tr className="border-b border-line">
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
                                                        <span className="w-7 h-7 rounded-full bg-primary-bg text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
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
            {/* Rejection reason dialog */}
            {rejectDialogId !== null && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => { setRejectDialogId(null); setRejectReason(""); }}
                >
                    <div
                        className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-gray-200 p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-[15px] font-semibold text-gray-900">Reject Detection</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Provide a reason for rejecting this refill detection.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setRejectDialogId(null); setRejectReason(""); }}
                                className="p-1 hover:bg-gray-100 rounded-full transition-colors ml-3"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Reason textarea */}
                        <textarea
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                            rows={3}
                            placeholder="e.g. False positive, sensor malfunction…"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            autoFocus
                        />

                        {/* Actions */}
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => { setRejectDialogId(null); setRejectReason(""); }}
                                className="px-4 h-9 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitReject}
                                disabled={rejectSubmitting}
                                className="px-4 h-9 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                            >
                                {rejectSubmitting ? "Rejecting…" : "Reject"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* All Detections Modal */}
            <Modal
                isOpen={showAllDetectionsModal}
                onClose={() => setShowAllDetectionsModal(false)}
                title="Refill Detected"
                description={`${pendingDetections.length} pending detections`}
                containerClassName="max-w-[700px]"
                headerAction={
                    <select
                        value={detectionsModalBranch}
                        onChange={(e) => setDetectionsModalBranch(e.target.value)}
                        className="h-8 px-2 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                    >
                        {detectionBranchOptions.map((branch) => (
                            <option key={branch} value={branch}>
                                {branch === "All" ? "All Branches" : branch}
                            </option>
                        ))}
                    </select>
                }
            >
                <div className="space-y-4">
                    {Object.entries(groupedDetectionsForModal).map(([dateLabel, detections]) => (
                        <div key={dateLabel} className="space-y-2">
                            <div className="inline-flex items-center rounded-full bg-[#f0f0f0] px-3 py-1 text-sm font-medium text-[#3a3a3a]">
                                {dateLabel}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {detections.map((detection) => {
                                    const isDismissing = dismissingId === detection.id;
                                    const detectedAtParts = detection.detected_at
                                        ? (() => {
                                            const dt = new Date(detection.detected_at);
                                            return {
                                                date: dt.toISOString().slice(0, 10),
                                                time: dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
                                            };
                                          })()
                                        : null;
                                    return (
                                        <div
                                            key={detection.id}
                                            className="rounded-xl border-2 border-[#E7D4F0] bg-gradient-to-br from-primary-bg/60 to-white p-3 flex flex-col gap-3"
                                            style={{
                                                transition: "opacity 0.25s ease, transform 0.25s ease",
                                                opacity: isDismissing ? 0 : 1,
                                                transform: isDismissing ? "scale(0.95)" : "scale(1)",
                                            }}
                                        >
                                            {/* Tile top row: tank badge + dismiss */}
                                            <div className="flex items-start justify-between">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-bg text-primary text-xs font-semibold">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                                                    </svg>
                                                    {detection.tank_code ?? "—"}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setRejectDialogId(detection.id); setRejectReason(""); }}
                                                    className="w-6 h-6 rounded-md flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                                                    aria-label="Reject detection"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                                    </svg>
                                                </button>
                                            </div>

                                            {/* Info */}
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] text-gray-400 w-20 shrink-0">Branch</span>
                                                    <span className="text-[12px] font-medium text-gray-800 truncate">{detection.branch_name ?? "—"}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] text-gray-400 w-20 shrink-0">Date & Time</span>
                                                    <span className="text-[12px] font-medium text-gray-800">{formatDetectedAt(detection.detected_at)}</span>
                                                </div>
                                                {detection.refill_weight !== null && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] text-gray-400 w-20 shrink-0">Weight</span>
                                                        <span className="text-[12px] font-medium text-gray-800">{detection.refill_weight} kg</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Add Logs button */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPendingAddDetectionId(detection.id);
                                                    resetAddForm(detectedAtParts?.date, detectedAtParts?.time, detection.refill_weight);
                                                    setSelectedTankId(String(detection.tank_id));
                                                    setAddModalTab("refill");
                                                    setIsAddRefillOpen(true);
                                                }}
                                                className="w-full flex items-center justify-center gap-1.5 px-5 h-9 rounded-lg bg-primary text-white text-xs font-medium hover:bg-[#5a0e63] transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M12 5v14M5 12h14" />
                                                </svg>
                                                Add Logs
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {Object.keys(groupedDetectionsForModal).length === 0 && (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-400">No detections found for this branch.</p>
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default RefillLog;
