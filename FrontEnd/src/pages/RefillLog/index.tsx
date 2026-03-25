import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { ivfService, type IvfBranch } from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";

type ContainerItem = {
    id: string;
    tankId: string;
    tankCode: string;
    containerNo: string;
    branch: string;
    lastRefillDate: string;
};

type RefillLogItem = {
    id: string;
    tankId: string;
    refilledDate: string;
    refillTime: string;
    refilledBy: string;
    description: string;
    reservoir: string;
    ln2OrderedDate: string;
    ln2ReceivedDate: string;
    status: string;
};

type RefillLogCreateForm = {
    refill_date: string;
    refill_time: string;
    refilled_by: string;
    description: string;
    status: string;
    reservoir: string;
    ln2_ordered_date: string;
    ln2_received_date: string;
};

const RefillLog = () => {
    const { isAuthenticated } = useAuth();
    const [selectedBranch, setSelectedBranch] = useState<string>("All");
    const [selectedStatus, setSelectedStatus] = useState<string>("All");
    const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [containers, setContainers] = useState<ContainerItem[]>([]);
    const [refillLogs, setRefillLogs] = useState<RefillLogItem[]>([]);
    const [containersLoading, setContainersLoading] = useState(false);
    const [refillLogsLoading, setRefillLogsLoading] = useState(false);
    const [refillLogsError, setRefillLogsError] = useState<string | null>(null);
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [reloadRefillLogsToken, setReloadRefillLogsToken] = useState(0);
    const [addForm, setAddForm] = useState<RefillLogCreateForm>({
        refill_date: new Date().toISOString().slice(0, 10),
        refill_time: "09:00",
        refilled_by: "",
        description: "",
        status: "Not started",
        reservoir: "",
        ln2_ordered_date: "",
        ln2_received_date: "",
    });

    const branchDropdownRef = useRef<HTMLDivElement>(null);
    const statusDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadContainers = async () => {
            setContainersLoading(true);
            try {
                const data = await shipmentService.getActiveCanisters();
                const buildContainer = (
                    c: { tank_id: number; tank_code: string; updated_at: string | null; status?: string; deviations?: number },
                    idx: number,
                    branchNameFallback?: string,
                ): ContainerItem => {
                    const tankIdValue = String(c.tank_id ?? idx + 1);
                    const tankCodeValue = String(c.tank_code ?? `T${idx + 1}`);
                    return {
                        id: tankIdValue,
                        tankId: tankIdValue,
                        tankCode: tankCodeValue,
                        containerNo: String(c.tank_code ?? `Container ${idx + 1}`),
                        branch: branchNameFallback ?? "N/A",
                        lastRefillDate: c.updated_at
                            ? new Date(c.updated_at).toLocaleDateString("en-GB")
                            : "NA",
                    };
                };

                if (data?.branches && Array.isArray(data.branches)) {
                    const flattened = data.branches.flatMap(
                        (branch, branchIndex: number) => {
                            const list = branch.tanks || [];
                            return (Array.isArray(list) ? list : []).map(
                                (c, idx: number) =>
                                    buildContainer(
                                        c,
                                        branchIndex * 1000 + idx,
                                        branch.branch_name,
                                    ),
                            );
                        },
                    );
                    setContainers(flattened);
                } else {
                    setContainers([]);
                }
            } catch {
                setContainers([]);
            } finally {
                setContainersLoading(false);
            }
        };

        if (isAuthenticated) {
            loadContainers();
        }
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

        if (isAuthenticated) {
            loadBranches();
        }
    }, [isAuthenticated]);

    const branchOptions = useMemo(() => {
        const options = new Set<string>();

        if (branches.length > 0) {
            branches.forEach((branch) => {
                if (branch?.branch_name?.trim()) {
                    options.add(branch.branch_name.trim());
                }
            });
        }

        return ["All", ...Array.from(options)];
    }, [branches]);

    const statusOptions = useMemo(() => {
        const options = new Set<string>();
        refillLogs.forEach((item) => {
            if (item.status) {
                options.add(item.status);
            }
        });
        if (options.size === 0) {
            return ["All", "Not started", "In progress", "Done"];
        }
        return ["All", ...Array.from(options)];
    }, [refillLogs]);

    const allContainers = useMemo(() => containers, [containers]);

    const filteredLogs = useMemo(() => {
        if (!selectedTankId) {
            return [];
        }
        return refillLogs.filter((item) =>
            selectedStatus === "All" ? true : item.status === selectedStatus,
        );
    }, [refillLogs, selectedStatus, selectedTankId]);

    const resetAddForm = () => {
        setAddForm({
            refill_date: new Date().toISOString().slice(0, 10),
            refill_time: "09:00",
            refilled_by: "",
            description: "",
            status: "Not started",
            reservoir: "",
            ln2_ordered_date: "",
            ln2_received_date: "",
        });
        setAddError(null);
    };

    const openAddDialog = () => {
        if (!selectedTankId) {
            return;
        }
        resetAddForm();
        setIsAddDialogOpen(true);
    };

    const closeAddDialog = () => {
        if (addSubmitting) {
            return;
        }
        setIsAddDialogOpen(false);
        setAddError(null);
    };

    const submitAddRefillLog = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedTankId) {
            setAddError("Select a container before adding log.");
            return;
        }
        if (!addForm.refilled_by.trim()) {
            setAddError("Refilled By is required.");
            return;
        }

        setAddSubmitting(true);
        setAddError(null);

        try {
            await ivfService.createRefillLog(selectedTankId, {
                refill_date: addForm.refill_date,
                refill_time: addForm.refill_time,
                refilled_by: addForm.refilled_by.trim(),
                description: addForm.description.trim(),
                status: addForm.status,
                reservoir: addForm.reservoir.trim() || null,
                ln2_ordered_date: addForm.ln2_ordered_date || null,
                ln2_received_date: addForm.ln2_received_date || null,
            });
            setIsAddDialogOpen(false);
            setReloadRefillLogsToken((value) => value + 1);
        } catch (error) {
            setAddError((error as Error)?.message || "Failed to create refill log");
        } finally {
            setAddSubmitting(false);
        }
    };

    useEffect(() => {
        if (allContainers.length === 0) {
            setSelectedTankId(null);
            return;
        }

        const isSelectedStillVisible = allContainers.some(
            (item) => item.tankId === selectedTankId,
        );

        if (!isSelectedStillVisible) {
            setSelectedTankId(allContainers[0].tankId);
        }
    }, [allContainers, selectedTankId]);

    useEffect(() => {
        if (!isAuthenticated || !selectedTankId) {
            setRefillLogs([]);
            setRefillLogsError(null);
            return;
        }

        let cancelled = false;

        const loadRefillLogs = async () => {
            setRefillLogsLoading(true);
            setRefillLogsError(null);
            try {
                const response = await ivfService.getCanisterRefillLogs(
                    selectedTankId,
                );
                const mappedLogs: RefillLogItem[] = Array.isArray(
                    response?.refill_logs,
                )
                    ? response.refill_logs.map((log) => ({
                          id: String(log.log_id ?? `${selectedTankId}-${log.log_id}`),
                          tankId: String(selectedTankId),
                          refilledDate: log.refill_date || "-",
                          refillTime: log.refill_time || "-",
                          refilledBy: log.refilled_by || "-",
                          description: log.description || "-",
                          reservoir: log.reservoir || "-",
                          ln2OrderedDate: log.ln2_ordered_date || "-",
                          ln2ReceivedDate: log.ln2_received_date || "-",
                          status: log.status || "-",
                      }))
                    : [];

                if (!cancelled) {
                    setRefillLogs(mappedLogs);
                }
            } catch (e) {
                if (!cancelled) {
                    setRefillLogs([]);
                    setRefillLogsError(
                        (e as Error)?.message || "Failed to load refill logs",
                    );
                }
            } finally {
                if (!cancelled) {
                    setRefillLogsLoading(false);
                }
            }
        };

        loadRefillLogs();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, selectedTankId, reloadRefillLogsToken]);

    return (
        <main className="flex flex-col h-screen overflow-hidden">
            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0 pt-10">
                <div className="flex items-center justify-between">
                    <h1 className="font-semibold text-black text-2xl">Refill log</h1>
                </div>

                <div className="flex-1 h-full grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 min-h-0 items-stretch">
                    <div className="order-2 lg:order-1 flex flex-col gap-6 min-w-0 h-full min-h-0 overflow-hidden">
                        <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-[380px] shrink-0 flex flex-col justify-center">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Branch
                                    </label>
                                    <div className="relative" ref={branchDropdownRef}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsBranchDropdownOpen(
                                                    !isBranchDropdownOpen,
                                                );
                                            }}
                                            className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                        >
                                            <span
                                                className={
                                                    selectedBranch !== "All"
                                                        ? "text-[#6b1176]"
                                                        : "text-gray-700"
                                                }
                                            >
                                                {selectedBranch === "All"
                                                    ? "All Branches"
                                                    : selectedBranch}
                                            </span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 9l-7 7-7-7"
                                                />
                                            </svg>
                                        </button>
                                        {isBranchDropdownOpen && (
                                            <div className="absolute top-full mt-1 left-0 right-0 z-9999 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                {branchOptions.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedBranch(
                                                                option,
                                                            );
                                                            setIsBranchDropdownOpen(
                                                                false,
                                                            );
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                            selectedBranch ===
                                                            option
                                                                ? "bg-[#6b1176] text-white"
                                                                : "text-[#6b1176] hover:bg-gray-100"
                                                        }`}
                                                    >
                                                        {option === "All"
                                                            ? "All Branches"
                                                            : option}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Status
                                    </label>
                                    <div className="relative" ref={statusDropdownRef}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsStatusDropdownOpen(
                                                    !isStatusDropdownOpen,
                                                );
                                            }}
                                            className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                        >
                                            <span
                                                className={
                                                    selectedStatus !== "All"
                                                        ? "text-[#6b1176]"
                                                        : "text-gray-700"
                                                }
                                            >
                                                {selectedStatus === "All"
                                                    ? "All Status"
                                                    : selectedStatus}
                                            </span>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${isStatusDropdownOpen ? "rotate-180" : ""}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 9l-7 7-7-7"
                                                />
                                            </svg>
                                        </button>
                                        {isStatusDropdownOpen && (
                                            <div className="absolute top-full mt-1 left-0 right-0 z-9999 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                {statusOptions.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedStatus(
                                                                option,
                                                            );
                                                            setIsStatusDropdownOpen(
                                                                false,
                                                            );
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                            selectedStatus ===
                                                            option
                                                                ? "bg-[#6b1176] text-white"
                                                                : "text-[#6b1176] hover:bg-gray-100"
                                                        }`}
                                                    >
                                                        {option === "All"
                                                            ? "All Status"
                                                            : option}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 w-[380px] flex-1 min-h-0 max-h-full flex flex-col overflow-hidden">
                            <h2 className="font-bold text-black text-base mb-2 shrink-0">
                                Active Containers
                            </h2>
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,90px)] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-3 shrink-0">
                                <div className="text-left">Containers #</div>
                                <div className="text-center">Last Refill Date</div>
                            </div>

                            <div className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100 min-h-0">
                                {containersLoading && (
                                    <div className="p-4 text-xs text-gray-500">
                                        Loading containers...
                                    </div>
                                )}
                                {!containersLoading && allContainers.map((container) => (
                                    <div
                                        key={container.id}
                                        onClick={() =>
                                            setSelectedTankId(container.tankId)
                                        }
                                        className={`grid grid-cols-[minmax(0,1fr)_minmax(0,90px)] pl-2 pr-2 py-2 items-center overflow-hidden gap-3 cursor-pointer ${
                                            selectedTankId === container.tankId
                                                ? "bg-[#F7ECFF]"
                                                : "hover:bg-gray-50"
                                        }`}
                                    >
                                        <div className="min-w-0 text-left overflow-hidden">
                                            <span className="text-[#6b1176] text-xs font-bold block truncate">
                                                {container.tankCode} ({container.tankId})
                                            </span>
                                            <div className="text-xs text-gray-900 leading-snug truncate">
                                                {container.branch}
                                            </div>
                                        </div>
                                        <div className="text-center text-xs font-bold text-gray-600 truncate">
                                            {container.lastRefillDate}
                                        </div>
                                    </div>
                                ))}
                                {!containersLoading && allContainers.length === 0 && (
                                    <div className="p-4 text-xs text-gray-500">
                                        No active containers found.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="order-1 lg:order-2 min-w-0 h-full min-h-0 bg-white border border-[#E7E1E1] rounded-lg p-4 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-semibold text-black text-lg">
                                Refill Log
                            </h2>
                            <button
                                type="button"
                                onClick={openAddDialog}
                                disabled={!selectedTankId}
                                className="px-4 h-9 rounded-lg bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0e63] transition-colors"
                            >
                                ADD
                            </button>
                        </div>
                        <div className="overflow-auto min-h-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-[#F7ECFF] text-[#6b1176]">
                                        <th className="text-left font-semibold px-3 py-2">
                                            Refilled Date
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            Refill Time
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            Refilled By
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            Description
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            Reservoir
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            LN2 Ordered Date
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            LN2 Received Date
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            Status
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            Edit
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedTankId && refillLogsLoading && (
                                        <tr>
                                            <td
                                                colSpan={9}
                                                className="px-3 py-6 text-center text-gray-500"
                                            >
                                                Loading refill logs...
                                            </td>
                                        </tr>
                                    )}
                                    {selectedTankId &&
                                        !refillLogsLoading &&
                                        refillLogsError && (
                                            <tr>
                                                <td
                                                    colSpan={9}
                                                    className="px-3 py-6 text-center text-red-600"
                                                >
                                                    {refillLogsError}
                                                </td>
                                            </tr>
                                        )}
                                    {!selectedTankId && (
                                        <tr>
                                            <td
                                                colSpan={9}
                                                className="px-3 py-6 text-center text-gray-500"
                                            >
                                                Select a container to view logs.
                                            </td>
                                        </tr>
                                    )}
                                    {!refillLogsLoading &&
                                        !refillLogsError &&
                                        filteredLogs.map((log) => (
                                        <tr
                                            key={log.id}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                        >
                                            <td className="px-3 py-2 text-gray-800 font-medium">
                                                {log.refilledDate}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {log.refillTime}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {log.refilledBy}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {log.description}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {log.reservoir}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {log.ln2OrderedDate}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {log.ln2ReceivedDate}
                                            </td>
                                            <td className="px-3 py-2 text-[#027A48] font-semibold">
                                                {log.status}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                -
                                            </td>
                                        </tr>
                                        ))}
                                    {selectedTankId &&
                                        !refillLogsLoading &&
                                        !refillLogsError &&
                                        filteredLogs.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={9}
                                                    className="px-3 py-6 text-center text-gray-500"
                                                >
                                                    No logs found for the selected container.
                                                </td>
                                            </tr>
                                        )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {isAddDialogOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="w-full max-w-xl bg-white rounded-lg border border-[#E7E1E1] p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-black">
                                Add Refill Log
                            </h3>
                            <button
                                type="button"
                                onClick={closeAddDialog}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={submitAddRefillLog} className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="refill_date" className="block text-xs font-medium text-gray-700 mb-1">Refill Date</label>
                                    <input
                                        id="refill_date"
                                        type="date"
                                        value={addForm.refill_date}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, refill_date: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="refill_time" className="block text-xs font-medium text-gray-700 mb-1">Refill Time</label>
                                    <input
                                        id="refill_time"
                                        type="time"
                                        value={addForm.refill_time}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, refill_time: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="refilled_by" className="block text-xs font-medium text-gray-700 mb-1">Refilled By</label>
                                    <input
                                        id="refilled_by"
                                        type="text"
                                        value={addForm.refilled_by}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, refilled_by: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="status" className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                                    <select
                                        id="status"
                                        value={addForm.status}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, status: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm bg-white"
                                    >
                                        <option>Not started</option>
                                        <option>In progress</option>
                                        <option>Done</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    id="description"
                                    type="text"
                                    value={addForm.description}
                                    onChange={(e) =>
                                        setAddForm((prev) => ({ ...prev, description: e.target.value }))
                                    }
                                    className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label htmlFor="reservoir" className="block text-xs font-medium text-gray-700 mb-1">Reservoir</label>
                                    <input
                                        id="reservoir"
                                        type="text"
                                        value={addForm.reservoir}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, reservoir: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="ln2_ordered_date" className="block text-xs font-medium text-gray-700 mb-1">LN2 Ordered Date</label>
                                    <input
                                        id="ln2_ordered_date"
                                        type="date"
                                        value={addForm.ln2_ordered_date}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, ln2_ordered_date: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="ln2_received_date" className="block text-xs font-medium text-gray-700 mb-1">LN2 Received Date</label>
                                    <input
                                        id="ln2_received_date"
                                        type="date"
                                        value={addForm.ln2_received_date}
                                        onChange={(e) =>
                                            setAddForm((prev) => ({ ...prev, ln2_received_date: e.target.value }))
                                        }
                                        className="w-full h-10 px-3 border border-[#E7E1E1] rounded-lg text-sm"
                                    />
                                </div>
                            </div>

                            {addError && (
                                <div className="text-sm text-red-600">{addError}</div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={closeAddDialog}
                                    className="px-4 h-9 rounded-lg border border-[#E7E1E1] text-sm text-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addSubmitting}
                                    className="px-4 h-9 rounded-lg bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0e63] disabled:opacity-60"
                                >
                                    {addSubmitting ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
};

export default RefillLog;