import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import PageLayout from "../../components/PageLayout";


import { useAuth } from "../../contexts/AuthContext";
import { userService } from "../../services/userService";
import { shipmentService } from "../../services/shipmentService";
import MultiSelectDropdown from "../../components/MultiSelectDropdown";
import {
    ivfReportsService,
    type CriticalAlertReportRow,
    type MonthlySummaryRow,
    type RefillLogReportRow,
} from "../../services/ivfReportsService";
import {
    activityLogService,
    type ActivityLogRecord,
} from "../../services/activityLogService";

const REPORT_TYPES = [
    { value: "monthly-summary", label: "Monthly Summary Report" },
    { value: "critical-alerts", label: "Critical Alert Report" },
    { value: "refill-logs", label: "Refill Logs Report" },
    { value: "activity-logs", label: "Activity Logs" },
] as const;

type ReportType = (typeof REPORT_TYPES)[number]["value"];

type FilterState = {
    reportType: ReportType;
    month: string;
    dateFrom: string;
    dateTo: string;
    alertStatus: string;
    severity: string;
    refillStatus: string;
    tankCodes: string[];
    actionPrefix: string;
    action: string;
    outcome: string;
    actorType: string;
    metadataKey: string;
    metadataValue: string;
};

const ALERT_STATUS_OPTIONS = ["All", "Active", "Acknowledged"] as const;
const REFILL_STATUS_OPTIONS = ["All", "Not started", "In progress", "Done"] as const;
const SEVERITY_OPTIONS = ["All", "High", "Medium", "Low"] as const;
const ACTIVITY_OUTCOME_OPTIONS = ["All", "success", "failure", "partial"] as const;
const ACTOR_TYPE_OPTIONS = ["All", "user", "system", "scheduler", "webhook", "integration"] as const;

const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const getLocaleDateTimeParts = (value: string) => {
    if (!value) return { date: "", time: "" };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: value, time: "" };
    return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString(),
    };
};

const formatLocaleDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
};

const formatLocaleTime = (value?: string | null) => {
    if (!value) return "";
    const time = new Date(`1970-01-01T${value}`);
    if (Number.isNaN(time.getTime())) return value;
    return time.toLocaleTimeString();
};

const truncateText = (value: string, maxLength: number = 120) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
};

const formatActorLabel = (row: ActivityLogRecord) => {
    if (row.actor_label) return row.actor_label;
    const details = row.actor_details || {};
    const name = `${details.first_name || ""} ${details.last_name || ""}`.trim();
    return name || details.email || row.actor_id || row.actor_type;
};

const formatTargetLabel = (row: ActivityLogRecord) => {
    if (row.target_label) return row.target_label;
    const details = row.target_details || {};
    return details.tank_code || details.branch_name || details.hospital_name || row.target_id || "-";
};

const formatMetadataSummary = (metadata?: Record<string, any> | null) => {
    if (!metadata) return "-";
    try {
        return truncateText(JSON.stringify(metadata));
    } catch {
        return "-";
    }
};

const getRefillStatusStyles = (status?: string | null) => {
    if (status === "Done") return "bg-green-100 text-green-700";
    if (status === "In progress") return "bg-amber-100 text-amber-700";
    return "bg-gray-200 text-gray-700";
};

export default function ReportsPage() {
    const { isAuthenticated, userRole } = useAuth();
    const today = new Date();
    const startOfMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
    );
    const defaultMonth = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
    ).padStart(2, "0")}`;
    const defaultStartDate = startOfMonth.toISOString().slice(0, 10);
    const defaultEndDate = today.toISOString().slice(0, 10);
    const [, setUserInitials] = useState<string>("");
    const [department, setDepartment] = useState<string | null>(() => {
        try {
            const dept = localStorage.getItem("department");
            return dept ? dept.toUpperCase() : null;
        } catch {
            return null;
        }
    });
    const defaultFilters: FilterState = {
        reportType: "monthly-summary",
        month: defaultMonth,
        dateFrom: defaultStartDate,
        dateTo: defaultEndDate,
        alertStatus: "All",
        severity: "All",
        refillStatus: "All",
        tankCodes: [],
        actionPrefix: "",
        action: "",
        outcome: "All",
        actorType: "All",
        metadataKey: "",
        metadataValue: "",
    };
    const [filters, setFilters] = useState<FilterState>(defaultFilters);

    const [monthlySummaryRows, setMonthlySummaryRows] = useState<
        MonthlySummaryRow[]
    >([]);
    const [alertRows, setAlertRows] = useState<CriticalAlertReportRow[]>([]);
    const [refillLogRows, setRefillLogRows] = useState<RefillLogReportRow[]>([]);
    const [activityLogRows, setActivityLogRows] = useState<ActivityLogRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reportMonthLabel, setReportMonthLabel] = useState<string>("");
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [tankOptions, setTankOptions] = useState<string[]>([]);

    const isIvfUser = (department || "").toUpperCase() === "IVF";
    const canViewActivityLogs = ["admin", "manager"].includes(
        (userRole || "").toLowerCase(),
    );

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const profile = await userService.getProfile();
                const first = profile.first_name?.trim?.() || "";
                const last = profile.last_name?.trim?.() || "";
                const initials = `${first.charAt(0)}${last.charAt(0)}`
                    .toUpperCase()
                    .trim();
                setUserInitials(initials || "U");
                if (!department) {
                    setDepartment(profile.department?.toUpperCase() || null);
                }
            } catch {
                setUserInitials("U");
            }
        };

        if (isAuthenticated) {
            fetchUserProfile();
        }
    }, [isAuthenticated, department]);

    useEffect(() => {
        if (!isAuthenticated || !isIvfUser) {
            setTankOptions([]);
            return;
        }

        const loadTankOptions = async () => {
            try {
                const response = await shipmentService.getActiveCanisters();
                const tankCodes = new Set<string>();
                response.branches.forEach((branch) => {
                    branch.tanks.forEach((tank) => {
                        if (tank.tank_code) {
                            tankCodes.add(tank.tank_code);
                        }
                    });
                });
                setTankOptions(Array.from(tankCodes).sort());
            } catch {
                setTankOptions([]);
            }
        };

        loadTankOptions();
    }, [isAuthenticated, isIvfUser]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const isActivityLogReport = filters.reportType === "activity-logs";
        const canViewReport = isActivityLogReport
            ? canViewActivityLogs
            : isIvfUser;

        if (!canViewReport) {
            setMonthlySummaryRows([]);
            setAlertRows([]);
            setRefillLogRows([]);
            setActivityLogRows([]);
            setLoading(false);
            setError(
                isActivityLogReport
                    ? "Activity logs are available for Admin and Manager roles only."
                    : "Reports are available for IVF users only.",
            );
            return;
        }

        const loadReportData = async () => {
            setLoading(true);
            setError(null);

            try {
                if (filters.reportType === "monthly-summary") {
                    const response = await ivfReportsService.getMonthlySummary({
                        month: filters.month || undefined,
                        page,
                        page_size: pageSize,
                    });
                    setMonthlySummaryRows(response.rows || []);
                    setReportMonthLabel(response.month || filters.month);
                    setTotalCount(response.total_count ?? response.total_kpis ?? 0);
                    return;
                }

                if (filters.reportType === "critical-alerts") {
                    const response =
                        await ivfReportsService.getCriticalAlertsReport({
                            start_date: filters.dateFrom || undefined,
                            end_date: filters.dateTo || undefined,
                            status:
                                filters.alertStatus === "All"
                                    ? undefined
                                    : filters.alertStatus,
                            severity:
                                filters.severity === "All"
                                    ? undefined
                                    : filters.severity,
                            tank_codes: filters.tankCodes,
                            page,
                            page_size: pageSize,
                        });
                    setAlertRows(response.alerts || []);
                    setTotalCount(response.total_count ?? 0);
                    return;
                }

                if (filters.reportType === "activity-logs") {
                    const response = await activityLogService.getActivityLogs({
                        action_prefix: filters.actionPrefix || undefined,
                        action: filters.action || undefined,
                        outcome:
                            filters.outcome === "All"
                                ? undefined
                                : filters.outcome,
                        actor_type:
                            filters.actorType === "All"
                                ? undefined
                                : filters.actorType,
                        metadata_key: filters.metadataKey || undefined,
                        metadata_value: filters.metadataValue || undefined,
                        date_from: filters.dateFrom || undefined,
                        date_to: filters.dateTo || undefined,
                        page,
                        page_size: pageSize,
                    });
                    setActivityLogRows(response.logs || []);
                    setTotalCount(response.total_count ?? 0);
                    return;
                }

                if (filters.reportType === "refill-logs") {
                    const response = await ivfReportsService.getRefillLogsReport(
                        {
                            start_date: filters.dateFrom || undefined,
                            end_date: filters.dateTo || undefined,
                            status:
                                filters.refillStatus === "All"
                                    ? undefined
                                    : filters.refillStatus,
                            tank_codes: filters.tankCodes,
                            page,
                            page_size: pageSize,
                        },
                    );
                    setRefillLogRows(response.logs || []);
                    setTotalCount(response.total_count ?? 0);
                    return;
                }

                setAlertRows([]);
                setMonthlySummaryRows([]);
                setRefillLogRows([]);
                setActivityLogRows([]);
                setTotalCount(0);
            } catch (err) {
                const message = (err as Error)?.message || "Failed to load report";
                setError(message);
                setAlertRows([]);
                setMonthlySummaryRows([]);
                setRefillLogRows([]);
                setActivityLogRows([]);
                setTotalCount(0);
            } finally {
                setLoading(false);
            }
        };

        loadReportData();
    }, [
        filters,
        isAuthenticated,
        isIvfUser,
        canViewActivityLogs,
        page,
        pageSize,
    ]);

    useEffect(() => {
        setPage(1);
    }, [
        filters.reportType,
        filters.month,
        filters.dateFrom,
        filters.dateTo,
        filters.alertStatus,
        filters.severity,
        filters.refillStatus,
        filters.tankCodes.join(","),
        filters.actionPrefix,
        filters.action,
        filters.outcome,
        filters.actorType,
        filters.metadataKey,
        filters.metadataValue,
    ]);

    useEffect(() => {
        setPage(1);
    }, [pageSize]);

    const activeRowsCount = useMemo(() => {
        if (filters.reportType === "monthly-summary") {
            return monthlySummaryRows.length;
        }
        if (filters.reportType === "critical-alerts") {
            return alertRows.length;
        }
        if (filters.reportType === "refill-logs") {
            return refillLogRows.length;
        }
        if (filters.reportType === "activity-logs") {
            return activityLogRows.length;
        }
        return 0;
    }, [filters.reportType, monthlySummaryRows, alertRows, refillLogRows, activityLogRows]);

    const totalPages = useMemo(() => {
        if (totalCount <= 0) return 1;
        return Math.max(1, Math.ceil(totalCount / pageSize));
    }, [totalCount, pageSize]);

    const sortedAlertRows = useMemo(() => {
        return [...alertRows].sort((a, b) => {
            const aTime = new Date(a.occurred_at).getTime();
            const bTime = new Date(b.occurred_at).getTime();
            return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
        });
    }, [alertRows]);

    const sortedRefillLogRows = useMemo(() => {
        return [...refillLogRows].sort((a, b) => {
            const aKey = `${a.refill_date ?? ""}T${a.refill_time ?? ""}`;
            const bKey = `${b.refill_date ?? ""}T${b.refill_time ?? ""}`;
            return bKey.localeCompare(aKey);
        });
    }, [refillLogRows]);

    const handleResetFilters = () => {
        setFilters((prev) => ({
            ...defaultFilters,
            reportType: prev.reportType,
        }));
    };

    const downloadCsv = () => {
        if (activeRowsCount === 0) return;

        let headers: string[] = [];
        let rows: Array<Array<string | number | null | undefined>> = [];
        let filename = "report.csv";
        let reportTypeForLog = "unknown";
        const filtersForLog: Record<string, any> = {};

        if (filters.reportType === "monthly-summary") {
            headers = ["KPI Config", "Alerts Sent", "KPI Deviations"];
            rows = monthlySummaryRows.map((row) => [
                row.kpi_name,
                row.alerts_sent,
                row.deviations_found,
            ]);
            const monthLabel = reportMonthLabel || "summary";
            filename = `monthly-summary-${monthLabel}.csv`;
            reportTypeForLog = "ivf.monthly_summary";
            filtersForLog.month = filters.month;
        } else if (filters.reportType === "critical-alerts") {
            headers = [
                "Occurred Date",
                "Occurred Time",
                "Severity",
                "Status",
                "Tank Code",
                "Message",
            ];
            rows = sortedAlertRows.map((row) => [
                getLocaleDateTimeParts(row.occurred_at).date,
                getLocaleDateTimeParts(row.occurred_at).time,
                row.severity,
                row.status,
                row.tank_code || row.branch_name || "N/A",
                row.message,
            ]);
            filename = "critical-alerts.csv";
            reportTypeForLog = "ivf.critical_alerts";
            filtersForLog.start_date = filters.dateFrom;
            filtersForLog.end_date = filters.dateTo;
            if (filters.alertStatus !== "All") {
                filtersForLog.status = filters.alertStatus;
            }
            if (filters.severity !== "All") {
                filtersForLog.severity = filters.severity;
            }
            if (filters.tankCodes.length > 0) {
                filtersForLog.tank_codes = filters.tankCodes;
            }
        } else if (filters.reportType === "refill-logs") {
            headers = [
                "Refill Date",
                "Refill Time",
                "Tank Code",
                "Branch",
                "Refilled By",
                "Status",
                "Description",
                "Reservoir",
                "LN2 Ordered Date",
                "LN2 Received Date",
            ];
            rows = sortedRefillLogRows.map((row) => [
                formatLocaleDate(row.refill_date) || "-",
                formatLocaleTime(row.refill_time) || "-",
                row.tank_code || "-",
                row.branch_name || "-",
                row.refilled_by || "-",
                row.status || "-",
                row.description || "-",
                row.reservoir || "-",
                formatLocaleDate(row.ln2_ordered_date) || "-",
                formatLocaleDate(row.ln2_received_date) || "-",
            ]);
            filename = "refill-logs.csv";
            reportTypeForLog = "ivf.refill_logs";
            filtersForLog.start_date = filters.dateFrom;
            filtersForLog.end_date = filters.dateTo;
            if (filters.refillStatus !== "All") {
                filtersForLog.status = filters.refillStatus;
            }
            if (filters.tankCodes.length > 0) {
                filtersForLog.tank_codes = filters.tankCodes;
            }
        } else if (filters.reportType === "activity-logs") {
            headers = [
                "Timestamp",
                "Action",
                "Actor",
                "Actor Type",
                "Target",
                "Outcome",
                "Metadata",
            ];
            rows = activityLogRows.map((row) => [
                row.created_at,
                row.action,
                formatActorLabel(row),
                row.actor_type,
                formatTargetLabel(row),
                row.outcome,
                formatMetadataSummary(row.metadata),
            ]);
            filename = "activity-logs.csv";
            reportTypeForLog = "activity_logs";
            if (filters.dateFrom) filtersForLog.date_from = filters.dateFrom;
            if (filters.dateTo) filtersForLog.date_to = filters.dateTo;
            if (filters.actionPrefix) filtersForLog.action_prefix = filters.actionPrefix;
            if (filters.action) filtersForLog.action = filters.action;
            if (filters.outcome !== "All") filtersForLog.outcome = filters.outcome;
            if (filters.actorType !== "All") filtersForLog.actor_type = filters.actorType;
            if (filters.metadataKey) filtersForLog.metadata_key = filters.metadataKey;
            if (filters.metadataValue) filtersForLog.metadata_value = filters.metadataValue;
        }

        ivfReportsService
            .logReportDownload({
                report_type: reportTypeForLog,
                filters: filtersForLog,
            })
            .catch(() => {
                // Avoid blocking user download if audit logging fails.
            });

        const csvLines = [
            headers.map(escapeCsvValue).join(","),
            ...rows.map((row) => row.map(escapeCsvValue).join(",")),
        ];
        const blob = new Blob([csvLines.join("\n")], {
            type: "text/csv;charset=utf-8;",
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-red-600">Please login to access reports.</p>
            </div>
        );
    }

    return (
                <PageLayout title="Reports" lucideIcon={Download}>

                    <section className="bg-white border border-[#E7E1E1] rounded-lg p-5">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div>
                                <h2 className="text-base font-semibold text-black">
                                    Report Filters
                                </h2>
                                <p className="text-xs text-gray-500">
                                    Choose a report type and apply filters before downloading.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    disabled={
                                        !isIvfUser &&
                                        !(
                                            filters.reportType === "activity-logs" &&
                                            canViewActivityLogs
                                        )
                                    }
                                    className="px-3 py-2 border border-[#E7E1E1] rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    Reset Filters
                                </button>
                                <span className="text-xs text-gray-400">
                                    Updates automatically when filters change.
                                </span>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-gray-600">
                                    Report Type
                                </label>
                                <select
                                    className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                    value={filters.reportType}
                                    onChange={(event) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            reportType: event.target
                                                .value as ReportType,
                                        }))
                                    }
                                    disabled={!isIvfUser && !canViewActivityLogs}
                                >
                                    {REPORT_TYPES.map((option) => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {filters.reportType === "monthly-summary" && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-gray-600">
                                        Month
                                    </label>
                                    <input
                                        type="month"
                                        className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                        value={filters.month}
                                        onChange={(event) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                month: event.target.value,
                                            }))
                                        }
                                        disabled={!isIvfUser}
                                    />
                                </div>
                            )}

                            {filters.reportType === "critical-alerts" && (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.dateFrom}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    dateFrom: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.dateTo}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    dateTo: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Status
                                        </label>
                                        <select
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.alertStatus}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    alertStatus: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        >
                                            {ALERT_STATUS_OPTIONS.map((status) => (
                                                <option key={status} value={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Severity
                                        </label>
                                        <select
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.severity}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    severity: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        >
                                            {SEVERITY_OPTIONS.map((severity) => (
                                                <option key={severity} value={severity}>
                                                    {severity}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <MultiSelectDropdown
                                            label="Tank Codes"
                                            options={tankOptions}
                                            selected={filters.tankCodes}
                                            placeholder="All tanks"
                                            disabled={!isIvfUser}
                                            onChange={(selected) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    tankCodes: selected,
                                                }))
                                            }
                                        />
                                    </div>
                                </>
                            )}

                            {filters.reportType === "refill-logs" && (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.dateFrom}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    dateFrom: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.dateTo}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    dateTo: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Status
                                        </label>
                                        <select
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.refillStatus}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    refillStatus: event.target.value,
                                                }))
                                            }
                                            disabled={!isIvfUser}
                                        >
                                            {REFILL_STATUS_OPTIONS.map((status) => (
                                                <option key={status} value={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <MultiSelectDropdown
                                            label="Tank Codes"
                                            options={tankOptions}
                                            selected={filters.tankCodes}
                                            placeholder="All tanks"
                                            disabled={!isIvfUser}
                                            onChange={(selected) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    tankCodes: selected,
                                                }))
                                            }
                                        />
                                    </div>
                                </>
                            )}

                            {filters.reportType === "activity-logs" && (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.dateFrom}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    dateFrom: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.dateTo}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    dateTo: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Action Prefix
                                        </label>
                                        <input
                                            type="text"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            placeholder="config."
                                            value={filters.actionPrefix}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    actionPrefix: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Action
                                        </label>
                                        <input
                                            type="text"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            placeholder="user.login"
                                            value={filters.action}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    action: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Outcome
                                        </label>
                                        <select
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.outcome}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    outcome: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        >
                                            {ACTIVITY_OUTCOME_OPTIONS.map((option) => (
                                                <option key={option} value={option}>
                                                    {option === "All" ? "All" : option}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Actor Type
                                        </label>
                                        <select
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            value={filters.actorType}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    actorType: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        >
                                            {ACTOR_TYPE_OPTIONS.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Metadata Key
                                        </label>
                                        <input
                                            type="text"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            placeholder="template"
                                            value={filters.metadataKey}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    metadataKey: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-gray-600">
                                            Metadata Value
                                        </label>
                                        <input
                                            type="text"
                                            className="border border-[#E7E1E1] rounded-md px-3 py-2 text-sm"
                                            placeholder="tank_alert"
                                            value={filters.metadataValue}
                                            onChange={(event) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    metadataValue: event.target.value,
                                                }))
                                            }
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    <section className="bg-white border border-[#E7E1E1] rounded-lg p-5">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div>
                                <h2 className="text-base font-semibold text-black">
                                    Report Results
                                </h2>
                                <p className="text-xs text-gray-500">
                                    {loading
                                        ? "Loading report data..."
                                        : `Showing ${activeRowsCount} of ${totalCount} records`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={downloadCsv}
                                disabled={
                                    activeRowsCount === 0 ||
                                    (filters.reportType === "activity-logs"
                                        ? !canViewActivityLogs
                                        : !isIvfUser)
                                }
                                className="px-4 py-2 bg-[#6b1176] text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Download CSV
                            </button>
                        </div>

                        {error && (
                            <div className="mt-4 text-sm text-red-500">
                                {error}
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
                            <span className="text-gray-500">
                                Page {page} of {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                                <label className="text-gray-500" htmlFor="pageSize">
                                    Rows
                                </label>
                                <select
                                    id="pageSize"
                                    className="border border-[#E7E1E1] rounded-md px-2 py-1 text-sm"
                                    value={pageSize}
                                    onChange={(event) =>
                                        setPageSize(Number(event.target.value))
                                    }
                                    disabled={loading}
                                >
                                    {[10, 20, 50, 100].map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="px-3 py-1.5 rounded-md border border-[#E7E1E1] text-gray-700 disabled:opacity-50"
                                    onClick={() =>
                                        setPage((prev) => Math.max(1, prev - 1))
                                    }
                                    disabled={page <= 1 || loading}
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-1.5 rounded-md border border-[#E7E1E1] text-gray-700 disabled:opacity-50"
                                    onClick={() =>
                                        setPage((prev) =>
                                            Math.min(totalPages, prev + 1),
                                        )
                                    }
                                    disabled={page >= totalPages || loading}
                                >
                                    Next
                                </button>
                            </div>
                        </div>

                        {!loading && filters.reportType !== "activity-logs" && !isIvfUser && (
                            <div className="mt-4 text-sm text-gray-500">
                                Reports are available for IVF users only.
                            </div>
                        )}
                        {!loading && filters.reportType === "activity-logs" && !canViewActivityLogs && (
                            <div className="mt-4 text-sm text-gray-500">
                                Activity logs are available for Admin and Manager roles only.
                            </div>
                        )}

                        <div className="mt-4 overflow-x-auto">
                            {filters.reportType === "monthly-summary" && (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#fdeeff]">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                KPI Config
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Alerts Sent
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                KPI Deviations
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <tr key={i} className="border-b border-[#F1E8F2] bg-white">
                                                    {[140, 75, 90].map((w, col) => (
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
                                            ))
                                            : monthlySummaryRows.map((row) => (
                                                <tr
                                                    key={row.kpi_name}
                                                    className="border-b border-[#F1E8F2]"
                                                >
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {row.kpi_name}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {row.alerts_sent}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {row.deviations_found}
                                                    </td>
                                                </tr>
                                            ))}
                                        {!loading && monthlySummaryRows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={3}
                                                    className="px-4 py-6 text-center text-gray-400"
                                                >
                                                    No KPI deviations found for the
                                                    selected month.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {filters.reportType === "critical-alerts" && (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#fdeeff]">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Occurred Date
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Occurred Time
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Severity
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Tank Code
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Message
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <tr key={i} className="border-b border-[#F1E8F2] bg-white">
                                                    {[85, 85, 65, 80, 80, 160].map((w, col) => (
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
                                            ))
                                            : sortedAlertRows.map((row) => (
                                            <tr
                                                key={row.alert_id}
                                                className="border-b border-[#F1E8F2]"
                                            >
                                                <td className="px-4 py-3 text-gray-700">
                                                    {
                                                        getLocaleDateTimeParts(
                                                            row.occurred_at,
                                                        ).date
                                                    }
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {
                                                        getLocaleDateTimeParts(
                                                            row.occurred_at,
                                                        ).time
                                                    }
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.severity === "High" ? "bg-red-100 text-red-600" : row.severity === "Medium" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                                        {row.severity}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "Active" ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-700"}`}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.tank_code ||
                                                        row.branch_name ||
                                                        "N/A"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.message}
                                                </td>
                                            </tr>
                                        ))}
                                        {!loading && alertRows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="px-4 py-6 text-center text-gray-400"
                                                >
                                                    No alerts found for the selected
                                                    range.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {filters.reportType === "refill-logs" && (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#fdeeff]">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Refill Date
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Refill Time
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Tank Code
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Branch
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Refilled By
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Description
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Reservoir
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                LN2 Ordered
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                LN2 Received
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <tr key={i} className="border-b border-[#F1E8F2] bg-white">
                                                    {[85, 85, 80, 90, 90, 75, 120, 80, 85, 85].map((w, col) => (
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
                                            ))
                                            : sortedRefillLogRows.map((row) => (
                                            <tr
                                                key={row.log_id}
                                                className="border-b border-[#F1E8F2]"
                                            >
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatLocaleDate(row.refill_date) || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatLocaleTime(row.refill_time) || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.tank_code || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.branch_name || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.refilled_by || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getRefillStatusStyles(
                                                            row.status,
                                                        )}`}
                                                    >
                                                        {row.status || "-"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.description || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.reservoir || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatLocaleDate(
                                                        row.ln2_ordered_date,
                                                    ) || "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatLocaleDate(
                                                        row.ln2_received_date,
                                                    ) || "-"}
                                                </td>
                                            </tr>
                                        ))}
                                        {!loading && refillLogRows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={10}
                                                    className="px-4 py-6 text-center text-gray-400"
                                                >
                                                    No refill logs found for the
                                                    selected range.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {filters.reportType === "activity-logs" && (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#fdeeff]">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Timestamp
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Action
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Actor
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Target
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Outcome
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-[#6b1176]">
                                                Metadata
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <tr key={i} className="border-b border-[#F1E8F2] bg-white">
                                                    {[140, 160, 120, 120, 80, 160].map((w, col) => (
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
                                            ))
                                            : activityLogRows.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="border-b border-[#F1E8F2]"
                                            >
                                                <td className="px-4 py-3 text-gray-700">
                                                    {getLocaleDateTimeParts(row.created_at).date} {getLocaleDateTimeParts(row.created_at).time}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.action}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatActorLabel(row)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatTargetLabel(row)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.outcome === "success" ? "bg-green-100 text-green-700" : row.outcome === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}
                                                    >
                                                        {row.outcome}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatMetadataSummary(row.metadata)}
                                                </td>
                                            </tr>
                                        ))}
                                        {!loading && activityLogRows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-4 py-6 text-center text-gray-400"
                                                >
                                                    No activity logs found for the selected filters.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>
                </PageLayout>
    );
}
