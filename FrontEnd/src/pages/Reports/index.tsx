import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import PageLayout from "../../components/PageLayout";


import { useAuth } from "../../contexts/AuthContext";
import { userService } from "../../services/userService";
import { shipmentService } from "../../services/shipmentService";
import MultiSelectDropdown from "../../components/MultiSelectDropdown";
import { FilterSelect } from "../../components/FilterPanel";
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
    { value: "embryo-tracking", label: "Embryo Tracking Report" },
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
    actions: string[];
    outcome: string;
    actorType: string;
    search: string;
};

const ALERT_STATUS_OPTIONS = ["All", "Active", "Acknowledged"] as const;
const REFILL_STATUS_OPTIONS = ["All", "Not started", "In progress", "Done"] as const;
const SEVERITY_OPTIONS = ["All", "High", "Medium", "Low"] as const;
const ACTIVITY_OUTCOME_OPTIONS = ["All", "success", "failure", "partial"];
const ACTOR_TYPE_OPTIONS = ["All", "user", "system", "scheduler", "webhook", "integration"];

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

const formatActorSubLabel = (row: ActivityLogRecord) => {
    const details = row.actor_details || {};
    return details.branch_name || "";
};

const formatTargetLabel = (row: ActivityLogRecord) => {
    if (row.target_label) return row.target_label;
    const details = row.target_details || {};
    return details.tank_code || details.branch_name || details.hospital_name || row.target_id || "-";
};

const formatTargetName = (row: ActivityLogRecord) => {
    const details = row.target_details || {};
    const name = `${details.first_name || ""} ${details.last_name || ""}`.trim();
    return name || row.target_label || details.email || row.target_id || "-";
};

const formatTargetSubLabel = (row: ActivityLogRecord) => {
    const details = row.target_details || {};
    return details.branch_name || row.metadata?.branch_name || "";
};

const formatMetadataSummary = (metadata?: Record<string, any> | null) => {
    if (!metadata) return "-";
    try {
        return truncateText(JSON.stringify(metadata));
    } catch {
        return "-";
    }
};

const ACTION_LABELS: Record<string, string> = {
    "user.login_requested": "Login Requested",
    "user.login": "Login Successful",
    "user.logout": "Logged Out",
    "user.registered": "User Registered",
    "user.invited": "User Invited",
    "user.invite_registered": "User Registered via Invite",
    "user.approved": "User Approved",
    "user.rejected": "User Rejected",
    "user.profile_updated": "Profile Updated",
    "user.password_reset_completed": "Password Reset Completed",
    "email.otp_sent": "OTP Email Sent",
    "email.password_reset_sent": "Password Reset Email Sent",
    "email.user_approval_requested": "Approval Email Sent",
    "email.user_approved_sent": "Approval Confirmation Sent",
    "support_ticket.created": "Support Ticket Created",
    "support_ticket.comment_added": "Support Ticket Commented",
    "support_ticket.status_updated": "Support Ticket Status Updated",
    "email.support_ticket_created": "Support Ticket Email Sent",
    "email.support_ticket_comment_queued": "Support Ticket Comment Queued",
    "email.support_ticket_comment_sent": "Support Ticket Comment Sent",
    "email.support_ticket_status_queued": "Support Ticket Status Queued",
    "email.support_ticket_status_sent": "Support Ticket Status Email Sent",
    "task.created": "Task Created",
    "task.updated": "Task Updated",
    "task.status_updated": "Task Status Updated",
    "task.deleted": "Task Deleted",
    "alert.acknowledged": "Alert Acknowledged",
    "alert.acknowledged_all": "All Alerts Acknowledged",
    "alert.created": "Critical Alert Created",
    "email.critical_alert_sent": "Critical Alert Email Sent",
    "email.escalation_sent": "Escalation Email Sent",
    "refill_detection.created": "Refill Detection Created",
    "refill_detection.reviewed": "Refill Detection Reviewed",
    "alert_configuration.notification_settings_updated": "Alert Notification Settings Updated",
    "alert_configuration.kpi_config_created": "Alert Configuration Created",
    "alert_configuration.kpi_config_updated": "Alert Configuration Updated",
    "alert_configuration.kpi_config_deleted": "Alert Configuration Deleted",
    "alert_configuration.kpi_config_bulk_upserted": "Alert Configuration Bulk Updated",
    "integration.auth.login": "Integration Login",
    "integration.auth.token_revoked": "Integration Token Revoked",
    "patient_crylock.hms_update": "Patient Crylock HMS Updated",
    "ivf_cycle.created": "IVF Cycle Created",
    "ivf_cycle.updated": "IVF Cycle Updated",
    "ivf_cycle.oocyte_log.d0_saved": "Oocyte Day 0 Saved",
    "ivf_cycle.oocyte_log.d1_updated": "Oocyte Day 1 Updated",
    "ivf_cycle.oocyte_log.d3_updated": "Oocyte Day 3 Updated",
    "ivf_cycle.oocyte_log.d5_updated": "Oocyte Day 5 Updated",
    "ivf_cycle.oocyte_log.d6_updated": "Oocyte Day 6 Updated",
    "ivf_cycle.oocyte_log.fate_set": "Oocyte Fate Set",
    "report.ivf.monthly_summary.downloaded": "Monthly Summary Downloaded",
    "report.ivf.critical_alerts.downloaded": "Critical Alerts Downloaded",
    "report.ivf.refill_logs.downloaded": "Refill Logs Downloaded",
    "report.activity_logs.downloaded": "Activity Logs Downloaded",
};

const ACTIVITY_ACTION_OPTIONS = Object.keys(ACTION_LABELS)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ label: ACTION_LABELS[key], value: key }));

const EMBRYO_ACTION_OPTIONS = Object.keys(ACTION_LABELS)
    .filter((key) => key.startsWith("ivf_cycle."))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ label: ACTION_LABELS[key], value: key }));

const formatActionLabel = (action: string) => {
    if (ACTION_LABELS[action]) return ACTION_LABELS[action];
    const cleaned = action.replace(/_/g, " ").replace(/\./g, " ");
    return cleaned
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

const formatMetadataLines = (action: string, metadata?: Record<string, any> | null) => {
    if (!metadata) return [] as string[];
    const lines: string[] = [];
    const formatValue = (value: any) => {
        if (value === null || value === undefined || value === "") return "-";
        return String(value);
    };
    const pushDelta = (label: string, beforeValue: any, afterValue: any) => {
        if (beforeValue === undefined && afterValue === undefined) return;
        const beforeText = formatValue(beforeValue);
        const afterText = formatValue(afterValue);
        if (beforeText === afterText) return;
        lines.push(`${label}: ${beforeText} → ${afterText}`);
    };

    if (action.startsWith("task.")) {
        if (metadata.status) lines.push(`Status: ${metadata.status}`);
        if (metadata.priority) lines.push(`Priority: ${metadata.priority}`);
        if (metadata.assignee_id) lines.push(`Assignee: ${metadata.assignee_id}`);
        if (metadata.patient_id) lines.push(`Patient: ${metadata.patient_id}`);
        if (metadata.tank_id) lines.push(`Tank: ${metadata.tank_id}`);
        return lines;
    }

    if (action.startsWith("support_ticket.")) {
        if (metadata.new_status || metadata.old_status) {
            lines.push(`Status: ${metadata.old_status || ""} → ${metadata.new_status || ""}`.trim());
        }
        if (metadata.priority) lines.push(`Priority: ${metadata.priority}`);
        if (metadata.department) lines.push(`Department: ${metadata.department}`);
        if (metadata.feedback_type) lines.push(`Type: ${metadata.feedback_type}`);
        if (metadata.comment_id) lines.push(`Comment: ${metadata.comment_id}`);
        return lines;
    }

    if (action.startsWith("email.")) {
        if (metadata.recipient_email) lines.push(`To: ${metadata.recipient_email}`);
        if (action === "email.critical_alert_sent") {
            if (metadata.email_message) lines.push(`Email: ${truncateText(String(metadata.email_message), 80)}`);
            if (metadata.occurred_at) lines.push(`Occurred: ${metadata.occurred_at}`);
        }
        return lines;
    }

    if (action.startsWith("user.")) {
        if (metadata.role) lines.push(`Role: ${metadata.role}`);
        if (metadata.department) lines.push(`Department: ${metadata.department}`);
        if (metadata.approval_sent_to) lines.push(`Approval Sent To: ${metadata.approval_sent_to}`);
        if (metadata.remember_me !== undefined) lines.push(`Remember Me: ${metadata.remember_me ? "Yes" : "No"}`);
        if (metadata.recipient_email) lines.push(`Email: ${metadata.recipient_email}`);
        if (metadata.branch_name) lines.push(`Branch: ${metadata.branch_name}`);
        return lines;
    }

    if (action.startsWith("refill_detection.")) {
        if (metadata.is_confirmed !== undefined) lines.push(`Confirmed: ${metadata.is_confirmed ? "Yes" : "No"}`);
        if (metadata.tank_id) lines.push(`Tank: ${metadata.tank_id}`);
        if (metadata.refill_weight !== undefined && metadata.refill_weight !== null) {
            lines.push(`Refill Weight: ${metadata.refill_weight}`);
        }
        if (metadata.notes) lines.push(`Notes: ${truncateText(String(metadata.notes), 80)}`);
        return lines;
    }

    if (action.startsWith("alert_configuration.")) {
        if (metadata.hospital_id) lines.push(`Hospital: ${metadata.hospital_id}`);
        if (metadata.branch_id) lines.push(`Branch: ${metadata.branch_id}`);
        if (metadata.tank_id) lines.push(`Tank: ${metadata.tank_id}`);

        if (action === "alert_configuration.notification_settings_updated") {
            const before = metadata.before || {};
            const after = metadata.after || {};
            pushDelta(
                "Email Alerts",
                before.is_email_notifify !== undefined ? (before.is_email_notifify ? "On" : "Off") : undefined,
                after.is_email_notifify !== undefined ? (after.is_email_notifify ? "On" : "Off") : undefined,
            );
            pushDelta(
                "WhatsApp Alerts",
                before.is_whatsapp_notify !== undefined ? (before.is_whatsapp_notify ? "On" : "Off") : undefined,
                after.is_whatsapp_notify !== undefined ? (after.is_whatsapp_notify ? "On" : "Off") : undefined,
            );
            return lines;
        }

        if (metadata.before || metadata.after) {
            const before = metadata.before || {};
            const after = metadata.after || {};
            pushDelta("KPI", before.kpi_name, after.kpi_name);
            pushDelta("Alert Name", before.alert_name, after.alert_name);
            pushDelta("Min", before.min, after.min);
            pushDelta("Max", before.max, after.max);
            pushDelta("Unit", before.unit, after.unit);
            pushDelta("Alert Type", before.alert_type, after.alert_type);
            pushDelta("Cooldown", before.cooldown_minutes, after.cooldown_minutes);
            pushDelta("Status", before.status, after.status);
            if (!lines.some((line) => line.startsWith("Alert Name:"))) {
                const value = after.alert_name ?? before.alert_name;
                if (value) lines.push(`Alert Name: ${value}`);
            }
            if (!lines.some((line) => line.startsWith("Unit:"))) {
                const value = after.unit ?? before.unit;
                if (value) lines.push(`Unit: ${value}`);
            }
            return lines;
        }

        if (metadata.kpi_name) lines.push(`KPI: ${metadata.kpi_name}`);
        if (metadata.alert_name) lines.push(`Alert Name: ${metadata.alert_name}`);
        if (metadata.min !== undefined && metadata.min !== null) lines.push(`Min: ${metadata.min}`);
        if (metadata.max !== undefined && metadata.max !== null) lines.push(`Max: ${metadata.max}`);
        if (metadata.unit) lines.push(`Unit: ${metadata.unit}`);
        if (metadata.alert_type) lines.push(`Alert Type: ${metadata.alert_type}`);
        if (metadata.cooldown_minutes !== undefined && metadata.cooldown_minutes !== null) {
            lines.push(`Cooldown: ${metadata.cooldown_minutes}`);
        }
        if (metadata.status !== undefined) lines.push(`Status: ${metadata.status ? "Active" : "Inactive"}`);
        if (metadata.updated !== undefined) lines.push(`Updated: ${metadata.updated}`);
        if (metadata.created !== undefined) lines.push(`Created: ${metadata.created}`);
        if (metadata.config_count !== undefined) lines.push(`Configs: ${metadata.config_count}`);
        if (Array.isArray(metadata.kpi_names) && metadata.kpi_names.length) {
            lines.push(`KPIs: ${metadata.kpi_names.join(", ")}`);
        }
        if (Array.isArray(metadata.tank_ids) && metadata.tank_ids.length) {
            lines.push(`Tanks: ${metadata.tank_ids.join(", ")}`);
        }
        return lines;
    }

    if (action.startsWith("alert.")) {
        if (action === "alert.created") {
            if (metadata.message) lines.push(`Message: ${truncateText(String(metadata.message), 80)}`);
            return lines;
        }
        if (metadata.alert_id) lines.push(`Alert ID: ${metadata.alert_id}`);
        if (metadata.tank_code || metadata.tank_id) {
            lines.push(`Tank: ${metadata.tank_code || metadata.tank_id}`);
        }
        if (metadata.branch_name || metadata.branch_id) {
            lines.push(`Branch: ${metadata.branch_name || metadata.branch_id}`);
        }
        if (metadata.alert_type) lines.push(`Alert Type: ${metadata.alert_type}`);
        if (metadata.severity) lines.push(`Severity: ${metadata.severity}`);
        if (metadata.message) lines.push(`Message: ${truncateText(String(metadata.message), 80)}`);
        if (metadata.status) lines.push(`Status: ${metadata.status}`);
        return lines;
    }

    if (action.startsWith("report.")) {
        if (metadata.month) lines.push(`Month: ${metadata.month}`);
        if (metadata.start_date || metadata.end_date) {
            lines.push(`Range: ${metadata.start_date || ""} → ${metadata.end_date || ""}`.trim());
        }
        if (metadata.status) lines.push(`Status: ${metadata.status}`);
        if (metadata.severity) lines.push(`Severity: ${metadata.severity}`);
        if (metadata.tank_codes?.length) lines.push(`Tanks: ${metadata.tank_codes.join(", ")}`);
        if (action === "report.activity_logs.downloaded") {
            if (metadata.search) lines.push(`Search: ${metadata.search}`);
            if (metadata.actions?.length) lines.push(`Actions: ${metadata.actions.join(", ")}`);
            if (metadata.outcome) lines.push(`Outcome: ${metadata.outcome}`);
            if (metadata.actor_type) lines.push(`Actor: ${metadata.actor_type}`);
            if (metadata.date_from || metadata.date_to) {
                lines.push(`Range: ${metadata.date_from || ""} → ${metadata.date_to || ""}`.trim());
            }
        }
        return lines;
    }

    if (action.startsWith("ivf_cycle.")) {
        if (metadata.patient_name) lines.push(`Patient: ${metadata.patient_name}`);
        if (metadata.his_id) lines.push(`HIS ID: ${metadata.his_id}`);

        if (action === "ivf_cycle.created") {
            if (metadata.injection_method) lines.push(`Method: ${metadata.injection_method}`);
            const parts: string[] = [];
            if (metadata.oocyte_m2 != null) parts.push(`MII: ${metadata.oocyte_m2}`);
            if (metadata.oocyte_m1 != null) parts.push(`MI: ${metadata.oocyte_m1}`);
            if (metadata.oocyte_others != null) parts.push(`Others: ${metadata.oocyte_others}`);
            if (parts.length) lines.push(`Oocytes: ${parts.join(", ")}`);
            return lines;
        }

        if (action === "ivf_cycle.updated") {
            if (Array.isArray(metadata.fields_updated) && metadata.fields_updated.length) {
                lines.push(`Updated: ${metadata.fields_updated.join(", ")}`);
            }
            return lines;
        }

        if (metadata.oocyte_no != null) lines.push(`Oocyte #${metadata.oocyte_no}`);

        if (action === "ivf_cycle.oocyte_log.d0_saved") {
            if (metadata.d0_maturity) lines.push(`Maturity: ${metadata.d0_maturity}`);
        } else if (action === "ivf_cycle.oocyte_log.d1_updated") {
            if (metadata.d1_pn) lines.push(`PN: ${metadata.d1_pn}`);
            if (metadata.d1_zygote_status) lines.push(`Zygote: ${metadata.d1_zygote_status}`);
        } else if (action === "ivf_cycle.oocyte_log.d3_updated") {
            if (metadata.d3_grade) lines.push(`Grade: ${metadata.d3_grade}`);
            if (metadata.d3_symmetry) lines.push(`Symmetry: ${metadata.d3_symmetry}`);
        } else if (action === "ivf_cycle.oocyte_log.d5_updated") {
            if (metadata.d5_grade) lines.push(`Grade: ${metadata.d5_grade}`);
            if (metadata.d5_stage) lines.push(`Stage: ${metadata.d5_stage}`);
        } else if (action === "ivf_cycle.oocyte_log.d6_updated") {
            if (metadata.d6_grade) lines.push(`Grade: ${metadata.d6_grade}`);
            if (metadata.d6_progression) lines.push(`Progression: ${metadata.d6_progression}`);
        } else if (action === "ivf_cycle.oocyte_log.fate_set") {
            if (metadata.fate) lines.push(`Fate: ${metadata.fate}`);
        }

        return lines;
    }

    return [formatMetadataSummary(metadata)];
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
        actions: [],
        outcome: "All",
        actorType: "All",
        search: "",
    };
    const [filters, setFilters] = useState<FilterState>(defaultFilters);
    const [activitySearchInput, setActivitySearchInput] = useState("");


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
        const isActivityLogReport = filters.reportType === "activity-logs" || filters.reportType === "embryo-tracking";
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
                        actions: filters.actions.length > 0 ? filters.actions : undefined,
                        outcome:
                            filters.outcome === "All"
                                ? undefined
                                : filters.outcome,
                        actor_type:
                            filters.actorType === "All"
                                ? undefined
                                : filters.actorType,
                        search: filters.search || undefined,
                        date_from: filters.dateFrom || undefined,
                        date_to: filters.dateTo || undefined,
                        page,
                        page_size: pageSize,
                    });
                    setActivityLogRows(response.logs || []);
                    setTotalCount(response.total_count ?? 0);
                    return;
                }

                if (filters.reportType === "embryo-tracking") {
                    const response = await activityLogService.getActivityLogs({
                        action_prefix: filters.actions.length === 0 ? "ivf_cycle." : undefined,
                        actions: filters.actions.length > 0 ? filters.actions : undefined,
                        actor_type:
                            filters.actorType === "All"
                                ? undefined
                                : filters.actorType,
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
        filters.actions.join(","),
        filters.outcome,
        filters.actorType,
        filters.search,
    ]);

    useEffect(() => {
        setPage(1);
    }, [pageSize]);

    useEffect(() => {
        setActivitySearchInput(filters.search);
    }, [filters.search]);

    // Onboarding tour events — each report-type step fires one of these to auto-select that type
    useEffect(() => {
        const handlers: Array<[string, () => void]> = [
            ["onboarding:report-type:monthly-summary",  () => setFilters((p) => ({ ...p, reportType: "monthly-summary" }))],
            ["onboarding:report-type:critical-alerts",  () => setFilters((p) => ({ ...p, reportType: "critical-alerts" }))],
            ["onboarding:report-type:refill-logs",      () => setFilters((p) => ({ ...p, reportType: "refill-logs" }))],
            ["onboarding:report-type:activity-logs",    () => setFilters((p) => ({ ...p, reportType: "activity-logs" }))],
        ];
        handlers.forEach(([event, fn]) => document.addEventListener(event, fn));
        return () => { handlers.forEach(([event, fn]) => document.removeEventListener(event, fn)); };
    }, []);

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
        if (filters.reportType === "activity-logs" || filters.reportType === "embryo-tracking") {
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
        setActivitySearchInput("");
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
            if (filters.actions.length > 0) filtersForLog.actions = filters.actions;
            if (filters.outcome !== "All") filtersForLog.outcome = filters.outcome;
            if (filters.actorType !== "All") filtersForLog.actor_type = filters.actorType;
            if (filters.search) filtersForLog.search = filters.search;
        } else if (filters.reportType === "embryo-tracking") {
            headers = [
                "Timestamp",
                "Event",
                "Cycle ID",
                "HIS ID",
                "Actor",
                "Outcome",
                "Details",
            ];
            rows = activityLogRows.map((row) => [
                row.created_at,
                ACTION_LABELS[row.action] || row.action,
                row.metadata?.cycle_id ?? row.target_id ?? "-",
                row.metadata?.his_id ?? row.target_label ?? "-",
                formatActorLabel(row),
                row.outcome,
                formatMetadataSummary(row.metadata),
            ]);
            filename = "embryo-tracking.csv";
            reportTypeForLog = "ivf.embryo_tracking";
            if (filters.dateFrom) filtersForLog.date_from = filters.dateFrom;
            if (filters.dateTo) filtersForLog.date_to = filters.dateTo;
            if (filters.actions.length > 0) filtersForLog.actions = filters.actions;
            if (filters.actorType !== "All") filtersForLog.actor_type = filters.actorType;
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

                    <section id="onboarding-reports-filters" className="bg-white border border-[#E7E1E1] rounded-lg p-5">
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
                                <span className="text-xs text-gray-400">
                                    Updates automatically when filters change.
                                </span>
                                 <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    disabled={
                                        !isIvfUser &&
                                        !(
                                            (filters.reportType === "activity-logs" || filters.reportType === "embryo-tracking") &&
                                            canViewActivityLogs
                                        )
                                    }
                                    className="px-3 py-2 border border-[#E7E1E1] rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    Reset Filters
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div id="onboarding-reports-report-type">
                                <FilterSelect
                                    label="Report Type"
                                    value={filters.reportType}
                                    onChange={(val) =>
                                        setFilters((prev) => ({ ...prev, reportType: val as ReportType }))
                                    }
                                    options={REPORT_TYPES.map((r) => ({ label: r.label, value: r.value }))}
                                />
                            </div>

                            {filters.reportType === "monthly-summary" && (
                                <div id="onboarding-filter-month" className="flex flex-col">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Month
                                    </label>
                                    <input
                                        type="month"
                                        className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-date-from" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-date-to" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-status">
                                        <FilterSelect
                                            label="Status"
                                            value={filters.alertStatus}
                                            onChange={(val) =>
                                                setFilters((prev) => ({ ...prev, alertStatus: val }))
                                            }
                                            options={[...ALERT_STATUS_OPTIONS]}
                                        />
                                    </div>
                                    <div id="onboarding-filter-severity">
                                        <FilterSelect
                                            label="Severity"
                                            value={filters.severity}
                                            onChange={(val) =>
                                                setFilters((prev) => ({ ...prev, severity: val }))
                                            }
                                            options={[...SEVERITY_OPTIONS]}
                                        />
                                    </div>
                                    <div id="onboarding-filter-tank-codes">
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
                                    <div id="onboarding-filter-date-from" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-date-to" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-status">
                                        <FilterSelect
                                            label="Status"
                                            value={filters.refillStatus}
                                            onChange={(val) =>
                                                setFilters((prev) => ({ ...prev, refillStatus: val }))
                                            }
                                            options={[...REFILL_STATUS_OPTIONS]}
                                        />
                                    </div>
                                    <div id="onboarding-filter-tank-codes">
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
                                    <div id="onboarding-filter-date-from" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-date-to" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div id="onboarding-filter-actions">
                                        <MultiSelectDropdown
                                            label="Actions"
                                            options={ACTIVITY_ACTION_OPTIONS}
                                            selected={filters.actions}
                                            placeholder="All actions"
                                            disabled={!canViewActivityLogs}
                                            onChange={(selected) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    actions: selected,
                                                }))
                                            }
                                        />
                                    </div>
                                    <div id="onboarding-filter-outcome">
                                        <FilterSelect
                                            label="Outcome"
                                            value={filters.outcome}
                                            onChange={(val) =>
                                                setFilters((prev) => ({ ...prev, outcome: val }))
                                            }
                                            options={ACTIVITY_OUTCOME_OPTIONS}
                                        />
                                    </div>
                                    <div id="onboarding-filter-actor-type">
                                        <FilterSelect
                                            label="Actor Type"
                                            value={filters.actorType}
                                            onChange={(val) =>
                                                setFilters((prev) => ({ ...prev, actorType: val }))
                                            }
                                            options={ACTOR_TYPE_OPTIONS}
                                        />
                                    </div>
                                    <div id="onboarding-filter-search" className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Search
                                        </label>
                                        <input
                                            type="text"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
                                            placeholder="Press Enter to apply"
                                            value={activitySearchInput}
                                            onChange={(event) =>
                                                setActivitySearchInput(event.target.value)
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    setFilters((prev) => ({
                                                        ...prev,
                                                        search: activitySearchInput.trim(),
                                                    }));
                                                }
                                            }}
                                            disabled={!canViewActivityLogs}
                                        />
                                    </div>
                                </>
                            )}

                            {filters.reportType === "embryo-tracking" && (
                                <>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            className="border border-[#E7E1E1] rounded-lg px-3 h-12 text-sm"
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
                                    <div>
                                        <MultiSelectDropdown
                                            label="Actions"
                                            options={EMBRYO_ACTION_OPTIONS}
                                            selected={filters.actions}
                                            placeholder="All actions"
                                            disabled={!canViewActivityLogs}
                                            onChange={(selected) =>
                                                setFilters((prev) => ({
                                                    ...prev,
                                                    actions: selected,
                                                }))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <FilterSelect
                                            label="Actor Type"
                                            value={filters.actorType}
                                            onChange={(val) =>
                                                setFilters((prev) => ({ ...prev, actorType: val }))
                                            }
                                            options={ACTOR_TYPE_OPTIONS}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    <section id="onboarding-reports-results" className="bg-white border border-[#E7E1E1] rounded-lg p-5">
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
                                    (filters.reportType === "activity-logs" || filters.reportType === "embryo-tracking"
                                        ? !canViewActivityLogs
                                        : !isIvfUser)
                                }
                                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

                        {!loading && filters.reportType !== "activity-logs" && filters.reportType !== "embryo-tracking" && !isIvfUser && (
                            <div className="mt-4 text-sm text-gray-500">
                                Reports are available for IVF users only.
                            </div>
                        )}
                        {!loading && (filters.reportType === "activity-logs" || filters.reportType === "embryo-tracking") && !canViewActivityLogs && (
                            <div className="mt-4 text-sm text-gray-500">
                                Activity logs are available for Admin and Manager roles only.
                            </div>
                        )}

                        <div className="mt-4 overflow-x-auto">
                            {filters.reportType === "monthly-summary" && (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#fdeeff]">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                KPI Config
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Alerts Sent
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
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
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Occurred Date
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Occurred Time
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Severity
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Tank Code
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
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
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Refill Date
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Refill Time
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Tank Code
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Branch
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Refilled By
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Description
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Reservoir
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                LN2 Ordered
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                LN2 Received
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <tr key={i} className="border-b border-[#F1E8F2] bg-white">
                                                    {[85, 85, 80, 90, 90, 120, 80, 85, 85].map((w, col) => (
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

                            {(filters.reportType === "activity-logs" || filters.reportType === "embryo-tracking") && (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#fdeeff]">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Action
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Actor
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Target
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Outcome
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-primary">
                                                Details
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <tr key={i} className="border-b border-[#F1E8F2] bg-white">
                                                    {[200, 140, 140, 90, 200].map((w, col) => (
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
                                                    <div className="font-semibold text-[#1f2937]">
                                                        {formatActionLabel(row.action)}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        {getLocaleDateTimeParts(row.created_at).date} {getLocaleDateTimeParts(row.created_at).time}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    <div className="flex flex-col">
                                                        <span>{formatActorLabel(row)}</span>
                                                        {formatActorSubLabel(row) ? (
                                                            <span className="text-xs text-gray-400">
                                                                {formatActorSubLabel(row)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {row.action === "alert.acknowledged" ? (
                                                        <div className="flex flex-col">
                                                            {row.metadata?.tank_id ? (
                                                                <Link
                                                                    to={`/ivf-track-shipment/${row.metadata.tank_id}`}
                                                                    className="text-primary hover:underline"
                                                                >
                                                                    {row.metadata?.tank_code || row.metadata?.tank_id}
                                                                </Link>
                                                            ) : (
                                                                <span>
                                                                    {row.metadata?.tank_code || row.metadata?.tank_id || "-"}
                                                                </span>
                                                            )}
                                                            {row.metadata?.branch_name ? (
                                                                <span className="text-xs text-gray-400">
                                                                    {row.metadata?.branch_name}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    ) : row.target_type === "tank" && row.target_id ? (
                                                        <div className="flex flex-col">
                                                            <Link
                                                                to={`/ivf-track-shipment/${row.target_id}`}
                                                                className="text-primary hover:underline"
                                                            >
                                                                {formatTargetLabel(row)}
                                                            </Link>
                                                            {formatTargetSubLabel(row) ? (
                                                                <span className="text-xs text-gray-400">
                                                                    {formatTargetSubLabel(row)}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    ) : row.action === "email.critical_alert_sent" ? (
                                                        <div className="flex flex-col">
                                                            <span>{formatTargetName(row)}</span>
                                                            {(row.target_details?.email || row.metadata?.recipient_email) ? (
                                                                <span className="text-xs text-gray-400">
                                                                    {row.target_details?.email || row.metadata?.recipient_email}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <span>{formatTargetLabel(row)}</span>
                                                            {formatTargetSubLabel(row) ? (
                                                                <span className="text-xs text-gray-400">
                                                                    {formatTargetSubLabel(row)}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.outcome === "success" ? "bg-green-100 text-green-700" : row.outcome === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}
                                                    >
                                                        {row.outcome}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {formatMetadataLines(row.action, row.metadata).length > 0 ? (
                                                        <div className="flex flex-col gap-1">
                                                            {formatMetadataLines(row.action, row.metadata).map((line, index) => (
                                                                <div key={index} className="text-xs text-gray-600">
                                                                    {line}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {!loading && activityLogRows.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
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
