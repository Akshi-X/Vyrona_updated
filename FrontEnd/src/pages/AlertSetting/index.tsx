import React, {
    useEffect,
    useState,
    useMemo,
    useRef,
    useCallback,
} from "react";
import { toast } from "react-toastify";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
    ivfService,
    type IvfBranch,
    type HospitalNotificationSettings,
    type KpiConfigRow,
    type KpiConfigPayload,
} from "../../services/ivfService";
import { shipmentService } from "../../services/shipmentService";
import CriticalAlertsIcon from "../../assets/DashBoardIcons/Critical_Alerts.svg";
import PageLayout from "../../components/PageLayout";
import FilterPanel, { FilterSelect } from "../../components/FilterPanel";
import {
    Thermometer,
    Droplets,
    TrendingUp,
    Zap,
    Battery,
    DoorOpen,
    Info,
    X,
    Bell,
    Mail,
    ThermometerSun,
    Minus,
    ChevronDown,
    Loader2,
    Clock,
    Settings,
    Wind,
    CloudFog,
    CloudRain,
    FlaskConical,
    Gauge,
} from "lucide-react";
import { Switch } from "../../components/ui/switch";

interface ContainerRow {
    tank_id: number;
    canisterId: string;
    branchName: string;
    branch_id: number;
    status: string;
    date: string;
    is_incubator: boolean;
    incubator_id?: number | null;
    chamber_r?: number | null;
    chamber_c?: number | null;
}

const KPI_NAMES = {
    IVF_TEMPERATURE_INTERNAL: "temp_internal",
    IVF_TEMPERATURE_EXTERNAL: "temp_external",
    IVF_LN2_LEVEL: "ln2_level",
    IVF_LN2_EVAPORATION_RATE: "ln2_evaporation_rate",
    IVF_SHOCK: "shock",
    IVF_TIVE_BATTERY_PERCENTAGE: "tive_battery_percentage",
    IVF_LN2_LID_STATE: "ln2_lid_state",
    INCUBATOR_O2: "incubator_o2",
    INCUBATOR_CO2: "incubator_co2",
    INCUBATOR_TEMP: "incubator_temp",
    INCUBATOR_HUMIDITY: "incubator_humidity",
    INCUBATOR_PH: "incubator_ph",
    INCUBATOR_VOC: "incubator_voc",
    INCUBATOR_LID_STATE: "incubator_lid_state",
} as const;

const isActiveAlertType = (alertType?: string | null) =>
    alertType === "critical" || alertType === "soft";

// ─── KPI Form Config ──────────────────────────────────────────────────────────

interface LidStateOption {
    value: string;           // stored in draft.lid_state ("closed" | "open")
    label: string;
    set_min: number | null;
    set_max: number | null;
}

interface KpiFormConfig {
    kpi_name: string;
    alert_name: string | null;
    label: string;
    description: string;
    icon: React.ReactNode;
    unit: string | null;
    min_available: boolean;
    max_available: boolean;
    both_required: boolean;      // temp: both min+max must be set together
    min_label: string | null;
    max_label: string | null;
    min_bound: number | null;    // HTML min= on the input
    max_bound: number | null;    // HTML max= on the input
    cooldown_available: boolean;
    custom_dropdown: LidStateOption[] | null;  // non-null only for lid_state
    default_alert_type: "soft" | "critical" | "no_alert" | null;
    tank_type: "cryotank" | "incubator";
}

const KPI_FORM_CONFIG: KpiFormConfig[] = [
    {
        kpi_name: KPI_NAMES.IVF_LN2_EVAPORATION_RATE,
        alert_name: null,
        label: "Evaporation Rate",
        description: "Track LN2 evaporation rate to predict refill schedules",
        icon: <TrendingUp size={20} />,
        unit: "kg/hr",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "no_alert",
        tank_type: "cryotank",
    },
    {
        kpi_name: KPI_NAMES.IVF_LN2_LEVEL,
        alert_name: null,
        label: "LN2",
        description: "Liquid nitrogen level monitoring for cryogenic safety",
        icon: <Droplets size={20} />,
        unit: "Ln2 in kg",
        min_available: true,
        max_available: false,
        both_required: false,
        min_label: "Min",
        max_label: null,
        min_bound: 0,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "no_alert",
        tank_type: "cryotank",
    },
    {
        kpi_name: KPI_NAMES.IVF_LN2_LID_STATE,
        alert_name: null,
        label: "Lid State",
        description: "Alert triggers after lid change persists for the configured duration; repeats at the same interval if it continues.",
        icon: <DoorOpen size={20} />,
        unit: null,
        min_available: false,
        max_available: false,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: [
            { value: "",        label: "Select State",              set_min: null, set_max: null },
            { value: "closed",  label: "Closed (Alert when opened)", set_min: 0,    set_max: 0 },
            { value: "open",    label: "Open (Alert when closed)",   set_min: 1,    set_max: 1 },
        ],
        default_alert_type: "soft",
        tank_type: "cryotank",
    },
    {
        kpi_name: KPI_NAMES.IVF_SHOCK,
        alert_name: null,
        label: "Shock Detection",
        description: "Alert for physical impacts or sudden movements",
        icon: <Zap size={20} />,
        unit: "g",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "no_alert",
        tank_type: "cryotank",
    },
    {
        kpi_name: KPI_NAMES.IVF_TEMPERATURE_EXTERNAL,
        alert_name: null,
        label: "External Temperature",
        description: "Track ambient temperature around the storage container",
        icon: <ThermometerSun size={20} />,
        unit: "°C",
        min_available: true,
        max_available: true,
        both_required: true,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "cryotank",
    },
    {
        kpi_name: KPI_NAMES.IVF_TEMPERATURE_INTERNAL,
        alert_name: null,
        label: "Internal Temperature",
        description: "Monitor the internal tank temperature for safe storage conditions",
        icon: <Thermometer size={20} />,
        unit: "°C",
        min_available: true,
        max_available: true,
        both_required: true,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "cryotank",
    },
    {
        kpi_name: KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE,
        alert_name: null,
        label: "Battery Level",
        description: "Monitor device battery to ensure continuous tracking",
        icon: <Battery size={20} />,
        unit: "%",
        min_available: true,
        max_available: false,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: 0,
        max_bound: 100,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "cryotank",
    },
    // ── Incubator KPIs ────────────────────────────────────────────────────────
    {
        kpi_name: KPI_NAMES.INCUBATOR_O2,
        alert_name: null,
        label: "O₂ Level",
        description: "Monitor oxygen concentration inside the incubator",
        icon: <Wind size={20} />,
        unit: "%",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: 0,
        max_bound: 100,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "incubator",
    },
    {
        kpi_name: KPI_NAMES.INCUBATOR_CO2,
        alert_name: null,
        label: "CO₂ Level",
        description: "Monitor carbon dioxide concentration inside the incubator",
        icon: <CloudFog size={20} />,
        unit: "%",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: 0,
        max_bound: 100,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "incubator",
    },
    {
        kpi_name: KPI_NAMES.INCUBATOR_TEMP,
        alert_name: null,
        label: "Temperature",
        description: "Monitor incubator chamber temperature for optimal conditions",
        icon: <Thermometer size={20} />,
        unit: "°C",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "incubator",
    },
    {
        kpi_name: KPI_NAMES.INCUBATOR_HUMIDITY,
        alert_name: null,
        label: "Humidity",
        description: "Monitor relative humidity inside the incubator",
        icon: <CloudRain size={20} />,
        unit: "%",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: 0,
        max_bound: 100,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "incubator",
    },
    {
        kpi_name: KPI_NAMES.INCUBATOR_PH,
        alert_name: null,
        label: "pH Level",
        description: "Monitor pH level of the incubator culture media",
        icon: <FlaskConical size={20} />,
        unit: "pH",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: 0,
        max_bound: 14,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "incubator",
    },
    {
        kpi_name: KPI_NAMES.INCUBATOR_VOC,
        alert_name: null,
        label: "VOC",
        description: "Monitor volatile organic compound levels inside the incubator",
        icon: <Gauge size={20} />,
        unit: "ppb",
        min_available: true,
        max_available: true,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: 0,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: null,
        default_alert_type: "soft",
        tank_type: "incubator",
    },
    {
        kpi_name: KPI_NAMES.INCUBATOR_LID_STATE,
        alert_name: null,
        label: "Lid State",
        description: "Alert triggers after lid change persists for the configured duration; repeats at the same interval if it continues.",
        icon: <DoorOpen size={20} />,
        unit: null,
        min_available: false,
        max_available: false,
        both_required: false,
        min_label: null,
        max_label: null,
        min_bound: null,
        max_bound: null,
        cooldown_available: true,
        custom_dropdown: [
            { value: "",        label: "Select State",              set_min: null, set_max: null },
            { value: "closed",  label: "Closed (Alert when opened)", set_min: 0,    set_max: 0 },
            { value: "open",    label: "Open (Alert when closed)",   set_min: 1,    set_max: 1 },
        ],
        default_alert_type: "soft",
        tank_type: "incubator",
    },
];

const DEFAULT_KPI_FORM_CONFIG: KpiFormConfig = {
    kpi_name: "",
    alert_name: null,
    label: "Custom Alert",
    description: "Custom monitoring parameter",
    icon: <Info size={20} />,
    unit: null,
    min_available: true,
    max_available: true,
    both_required: false,
    min_label: null,
    max_label: null,
    min_bound: null,
    max_bound: null,
    cooldown_available: true,
    custom_dropdown: null,
    default_alert_type: null,
    tank_type: "cryotank",
};

const getKpiFormConfig = (kpiName: string): KpiFormConfig =>
    KPI_FORM_CONFIG.find((c) => c.kpi_name === kpiName) ?? DEFAULT_KPI_FORM_CONFIG;

// Backward-compat helpers derived from KPI_FORM_CONFIG
interface KpiMetadata {
    label: string;
    description: string;
    icon: React.ReactNode;
    unit?: string;
}

const getKpiMetadata = (kpiName: string): KpiMetadata => {
    const cfg = getKpiFormConfig(kpiName);
    return { label: cfg.label, description: cfg.description, icon: cfg.icon, unit: cfg.unit ?? undefined };
};

const CRYOTANK_KPI_NAMES = KPI_FORM_CONFIG
    .filter((c) => c.tank_type === "cryotank")
    .map((c) => c.kpi_name);

const INCUBATOR_KPI_NAMES = KPI_FORM_CONFIG
    .filter((c) => c.tank_type === "incubator")
    .map((c) => c.kpi_name);

// Lid state helpers (kept for draft ↔ min/max conversion)
const lidStateToValues = (state: string | null): { min: number | null; max: number | null } => {
    const cfg = getKpiFormConfig(KPI_NAMES.IVF_LN2_LID_STATE);
    const opt = cfg.custom_dropdown?.find((o) => o.value === state);
    if (opt) return { min: opt.set_min, max: opt.set_max };
    return { min: null, max: null };
};

const valuesToLidState = (min: number | null, max: number | null): string => {
    const cfg = getKpiFormConfig(KPI_NAMES.IVF_LN2_LID_STATE);
    const opt = cfg.custom_dropdown?.find((o) => o.set_min === min && o.set_max === max && o.value !== "");
    return opt?.value ?? "";
};

// Validation helpers
const validateMinMax = (
    min: number | null,
    max: number | null,
): { valid: boolean; error?: string } => {
    if (min !== null && max !== null && min > max) {
        return { valid: false, error: "Min must be ≤ Max" };
    }
    return { valid: true };
};

const validateTemperature = (
    min: number | null,
    max: number | null,
): { valid: boolean; error?: string } => {
    // Both must be set or both must be null
    if ((min !== null && max === null) || (min === null && max !== null)) {
        return { valid: false, error: "Both min and max are required" };
    }
    return validateMinMax(min, max);
};

const validatePercentage = (
    min: number | null,
    max: number | null,
): { valid: boolean; error?: string } => {
    if (min !== null && min < 0) {
        return { valid: false, error: "Min cannot be negative" };
    }
    if (max !== null && max < 0) {
        return { valid: false, error: "Max cannot be negative" };
    }
    return validateMinMax(min, max);
};

const validateBattery = (
    min: number | null,
): { valid: boolean; error?: string } => {
    if (min !== null && min < 0) {
        return { valid: false, error: "Min cannot be negative" };
    }
    if (min !== null && min > 100) {
        return { valid: false, error: "Min cannot exceed 100" };
    }
    return { valid: true };
};

// Check if alert type should be enabled based on KPI form config
const isAlertTypeEnabled = (
    kpiName: string,
    min: number | null,
    max: number | null,
    lidState?: string,
): boolean => {
    const cfg = getKpiFormConfig(kpiName);
    if (cfg.custom_dropdown) return !!lidState && lidState !== "";
    if (!cfg.max_available) return min !== null;           // battery or ln2_level
    if (cfg.both_required) return min !== null && max !== null;  // temperature
    return min !== null || max !== null;                   // standard
};

// Get validation for a specific KPI
const getKpiValidation = (
    kpiName: string,
    min: number | null,
    max: number | null,
): { valid: boolean; error?: string } => {
    const cfg = getKpiFormConfig(kpiName);
    if (cfg.custom_dropdown) return { valid: true };       // handled by dropdown selection
    if (!cfg.max_available) {
        if (cfg.max_bound !== null) return validateBattery(min); // battery
        return validatePercentage(min, null);               // ln2_level
    }
    if (cfg.both_required) return validateTemperature(min, max);
    if (cfg.min_bound === 0) return validatePercentage(min, max);
    return validateMinMax(min, max);
};

const AlertStatusBadge = ({
    isAlertEnabled,
    isCritical,
    hasAnyValue,
    onClear,
    showUnset,
    className = "",
}: {
    isAlertEnabled: boolean;
    isCritical: boolean;
    hasAnyValue?: boolean;
    onClear?: () => void;
    showUnset?: boolean;
    className?: string;
}) => (
    <div className={`flex items-center gap-2 flex-shrink-0 ${className}`}>
        {showUnset && (
            <div className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                <Minus size={10} />
                Unset
            </div>
        )}
        {isAlertEnabled ? (
            <div className={`w-auto pl-1.5 pr-1.5 h-6 rounded-lg flex items-center justify-center ${isCritical ? "bg-red-100" : "bg-[#F2E4FF]"}`}>
                {isCritical ? (
                    <Mail size={16} className="text-red-500" />
                ) : (
                    <Bell size={16} className="text-[#6b1176]" />
                )}
                <span className="mx-1.5 text-[10px]">
                    {isCritical ? "Email Alert Enabled" : "Notification only"}
                </span>
            </div>
        ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 relative">
                <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C10.9 2 10 2.9 10 4V5.29C7.12 6.14 5 8.82 5 12V17L3 19V20H21V19L19 17V12C19 8.82 16.88 6.14 14 5.29V4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-7 h-0.5 bg-red-400 transform rotate-45 rounded"></div>
                </div>
            </div>
        )}
        {hasAnyValue && onClear && (
            <button
                type="button"
                onClick={onClear}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
                title="Clear configuration"
            >
                <X size={18} className="text-gray-500" />
            </button>
        )}
    </div>
);

export default function AlertSetting() {
    const { isAuthenticated } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const directionFilter: "cryotanks" | "incubators" =
        searchParams.get("direction") === "incubators" ? "incubators" : "cryotanks";

    const activeKpiNames = directionFilter === "incubators" ? INCUBATOR_KPI_NAMES : CRYOTANK_KPI_NAMES;

    const setDirectionFilter = (d: "cryotanks" | "incubators") => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (d === "incubators") next.set("direction", "incubators");
            else next.delete("direction");
            return next;
        }, { replace: true });
    };

    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [branchFilter, setBranchFilter] = useState<string>("All");
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
    const branchDropdownRef = useRef<HTMLDivElement>(null);
    const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>(
        {},
    );

    // Sync URL branch_id (numeric) → branchFilter (name) once branches are loaded
    useEffect(() => {
        const branchIdFromUrl = searchParams.get("branch_id");
        if (!branchIdFromUrl || branches.length === 0) return;
        const branch = branches.find((b) => String(b.branch_id) === branchIdFromUrl);
        if (branch && branch.branch_name !== branchFilter) setBranchFilter(branch.branch_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams.get("branch_id"), branches]);

    // Sync branchFilter → URL branch_id (direction is managed directly via setDirectionFilter)
    useEffect(() => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (branchFilter !== "All") {
                const branch = branches.find((b) => b.branch_name === branchFilter);
                if (branch) next.set("branch_id", String(branch.branch_id));
                else next.delete("branch_id");
            } else {
                next.delete("branch_id");
            }
            return next;
        }, { replace: true });
    }, [branchFilter, branches, setSearchParams]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            const isInsideDropdown =
                target.closest(".dropdown-button") ||
                target.closest(".dropdown-menu");
            if (!isInsideDropdown) {
                setOpenDropdowns({});
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    const [containers, setContainers] = useState<ContainerRow[]>([]);
    const [containersLoading, setContainersLoading] = useState(false);
    const [containersError, setContainersError] = useState<string | null>(null);

    const [selectedContainers, setSelectedContainers] = useState<
        ContainerRow[]
    >([]);
    const primaryContainer = selectedContainers[0] ?? null;
    const [selectedChamberId, setSelectedChamberId] = useState<string | null>(null);
    const [showBranchDropdown, setShowBranchDropdown] = useState(false);
    const [selectedTankIds, setSelectedTankIds] = useState<number[]>([]);
    const [savingToBranches, setSavingToBranches] = useState(false);
    const [configList, setConfigList] = useState<KpiConfigRow[]>([]);
    const [configLoading, setConfigLoading] = useState(false);
    const [configError, setConfigError] = useState<string | null>(null);
    const [configLoadedTankId, setConfigLoadedTankId] = useState<number | null>(
        null,
    );
    const [tankContext, setTankContext] = useState<{
        hospital_id: number | null;
        branch_id: number | null;
    }>({ hospital_id: null, branch_id: null });

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formPayload, setFormPayload] = useState<Partial<KpiConfigPayload>>(
        {},
    );
    const [formError, setFormError] = useState<string | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [configToDeleteId, setConfigToDeleteId] = useState<number | null>(
        null,
    );
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [showUnsetConfirm, setShowUnsetConfirm] = useState(false);
    const [pendingContainerSelection, setPendingContainerSelection] = useState<
        ContainerRow[] | null
    >(null);
    const [selectionConflictCheckLoading, setSelectionConflictCheckLoading] =
        useState(false);
    const [showNotifySettings, setShowNotifySettings] = useState(false);
    const [showKpiPanel, setShowKpiPanel] = useState(false);
    const [notifySettingsLoading, setNotifySettingsLoading] = useState(false);
    const [notifySettingsSaving, setNotifySettingsSaving] = useState(false);
    const [notifySettingsError, setNotifySettingsError] = useState<
        string | null
    >(null);
    const [notifySettings, setNotifySettings] =
        useState<HospitalNotificationSettings>({
            hospital_id: 0,
            is_email_notifify: true,
            is_whatsapp_notify: false,
        });

    /** Inline edit draft for KPI table: min, max, alert_type, lid_state per config id */
    const [draftConfig, setDraftConfig] = useState<
        Record<
            number,
            {
                min?: number | null;
                max?: number | null;
                alert_type?: string | null;
                lid_state?: string;
                cooldown_minutes?: number;
            }
        >
    >({});
    /** Multi-container draft: keyed by kpi_name instead of id */
    const [multiDraftConfig, setMultiDraftConfig] = useState<
        Record<
            string,
            {
                min?: number | null;
                max?: number | null;
                alert_type?: string | null;
                lid_state?: string;
                cooldown_minutes?: number;
            }
        >
    >({});
    const [saveAllLoading, setSaveAllLoading] = useState(false);

    // Refs for focus management - use a map to store refs by KPI identifier
    const inputRefsMap = useRef<
        Map<
            string,
            {
                min?: HTMLInputElement | HTMLSelectElement | null;
                max?: HTMLInputElement | null;
                alertType?: HTMLSelectElement | null;
            }
        >
    >(new Map());

    // Get or create ref entry for a KPI
    const getInputRefs = useCallback((key: string) => {
        if (!inputRefsMap.current.has(key)) {
            inputRefsMap.current.set(key, {});
        }
        return inputRefsMap.current.get(key)!;
    }, []);

    const refetchKpiConfig = useCallback(
        async (id: number, options?: { showLoading?: boolean; isIncubator?: boolean }) => {
            if (options?.showLoading) setConfigLoading(true);
            try {
                const type = options?.isIncubator ? "incubator" : "tank";
                const res = await ivfService.getKpiConfigList(id, type);
                setConfigList(res?.config ?? []);
                setTankContext({
                    hospital_id: res?.hospital_id ?? null,
                    branch_id: res?.branch_id ?? null,
                });
                setConfigLoadedTankId(id);
                return res;
            } finally {
                if (options?.showLoading) setConfigLoading(false);
            }
        },
        [],
    );

    // Handle Enter key to move focus to next input
    const handleKeyDown = useCallback(
        (
            e: React.KeyboardEvent,
            kpiKey: string,
            currentField: "min" | "max" | "alertType" | "lidState",
        ) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const refs = getInputRefs(kpiKey);
                const kpiName = kpiKey.includes("-")
                    ? kpiKey.split("-").pop()
                    : kpiKey;
                const cfg = getKpiFormConfig(kpiName || "");

                switch (currentField) {
                    case "min":
                        // If max is not available (battery, ln2_level) or it's a dropdown, go straight to alert type
                        if (!cfg.max_available || cfg.custom_dropdown) {
                            refs.alertType?.focus();
                        } else {
                            refs.max?.focus();
                        }
                        break;
                    case "max":
                        refs.alertType?.focus();
                        break;
                    case "lidState":
                        refs.alertType?.focus();
                        break;
                    case "alertType":
                        break;
                }
            }
        },
        [getInputRefs],
    );

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
        if (!isAuthenticated) return;
        setContainersLoading(true);
        setContainersError(null);
        setSelectedContainers([]);
        setSelectedChamberId(null);

        const fetchPromise = directionFilter === "incubators"
            ? shipmentService.getActiveIncubators({}).then((data) => {
                return data.branches.flatMap((branch) =>
                    branch.incubators.map((inc) => ({
                        tank_id: inc.incubator_id,
                        canisterId: inc.incubator_code ?? String(inc.incubator_id),
                        branchName: branch.branch_name,
                        branch_id: branch.branch_id,
                        status: "Safe" as const,
                        date: inc.updated_at ? new Date(inc.updated_at).toLocaleDateString("en-GB") : "-",
                        is_incubator: true,
                        incubator_id: inc.incubator_id,
                        chamber_r: inc.chamber_r,
                        chamber_c: inc.chamber_c,
                    }))
                );
            })
            : shipmentService.getActiveCanisters({}).then((data: any) => {
                let list: ContainerRow[] = [];
                if (data?.branches && Array.isArray(data.branches)) {
                    list = data.branches.flatMap((branch: any) => {
                        const tanks = branch.tanks || branch.canisters || [];
                        return tanks.map((t: any) => {
                            const status = (t.status || t.canister_status || "safe").toString();
                            return {
                                tank_id: t.tank_id ?? t.canister_id ?? 0,
                                canisterId: String(t.tank_code ?? t.canister_number ?? t.canister_id ?? ""),
                                branchName: branch.branch_name || "N/A",
                                branch_id: branch.branch_id ?? 0,
                                status: status === "critical" ? "Critical" : status === "risk" ? "Risk" : "Safe",
                                date: t.updated_at ? new Date(t.updated_at).toLocaleDateString("en-GB") : "-",
                                is_incubator: false,
                                incubator_id: null,
                                chamber_r: null,
                                chamber_c: null,
                            };
                        });
                    });
                }
                return list;
            });

        fetchPromise
            .then((list) => setContainers(list))
            .catch((e: any) => {
                setContainersError(e?.message || "Failed to fetch");
                setContainers([]);
            })
            .finally(() => setContainersLoading(false));
    }, [isAuthenticated, directionFilter]);

    useEffect(() => {
        if (!primaryContainer?.tank_id) {
            setConfigList([]);
            setTankContext({ hospital_id: null, branch_id: null });
            setConfigLoadedTankId(null);
            return;
        }
        setConfigLoading(true);
        setConfigError(null);
        setConfigLoadedTankId(null);
        refetchKpiConfig(
            primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id,
            { isIncubator: primaryContainer.is_incubator },
        ).catch((e: any) => {
                setConfigError(e?.message || "Failed to fetch KPI config");
                setConfigList([]);
            })
            .finally(() => setConfigLoading(false));
    }, [primaryContainer?.tank_id, refetchKpiConfig]);

    useEffect(() => {
        setDraftConfig({});
        setMultiDraftConfig({});
    }, [primaryContainer?.tank_id]);

    useEffect(() => {
        if (primaryContainer) {
            setShowKpiPanel(true);
        }
    }, [primaryContainer?.tank_id]);

    const closeUnsetConfirm = () => {
        setShowUnsetConfirm(false);
        setPendingContainerSelection(null);
    };

    const buildMultiDraftFromConfigList = (
        rows: KpiConfigRow[],
    ): Record<
        string,
        {
            min?: number | null;
            max?: number | null;
            alert_type?: string | null;
            lid_state?: string;
            cooldown_minutes?: number;
        }
    > => {
        const next: Record<
            string,
            {
                min?: number | null;
                max?: number | null;
                alert_type?: string | null;
                lid_state?: string;
                cooldown_minutes?: number;
            }
        > = {};

        for (const row of rows) {
            const cfg = getKpiFormConfig(row.kpi_name);
            const baseDraft = {
                min: row.min ?? null,
                max: row.max ?? null,
                alert_type: row.alert_type ?? null,
                cooldown_minutes: row.cooldown_minutes ?? 60,
            };

            if (cfg.custom_dropdown) {
                next[row.kpi_name] = {
                    ...baseDraft,
                    lid_state: valuesToLidState(row.min, row.max),
                };
            } else {
                next[row.kpi_name] = baseDraft;
            }
        }

        return next;
    };

    const handleContinueWithOldSetting = () => {
        if (pendingContainerSelection) {
            setMultiDraftConfig(buildMultiDraftFromConfigList(configList));
            setSelectedContainers(pendingContainerSelection);
        }
        closeUnsetConfirm();
    };

    const handleConfirmUnsetAndApply = () => {
        if (pendingContainerSelection) {
            setSelectedContainers(pendingContainerSelection);
        }
        closeUnsetConfirm();
    };

    const hasConfigConflict = (
        baseRows: KpiConfigRow[],
        candidateRows: KpiConfigRow[],
    ) => {
        const toComparableMap = (rows: KpiConfigRow[]) => {
            const map = new Map<
                string,
                {
                    min: number | null;
                    max: number | null;
                    alert_type: string | null;
                    cooldown_minutes: number;
                    lid_state: string | null;
                }
            >();

            rows.forEach((row) => {
                map.set(row.kpi_name, {
                    min: row.min ?? null,
                    max: row.max ?? null,
                    alert_type: row.alert_type ?? null,
                    cooldown_minutes: row.cooldown_minutes ?? 60,
                    lid_state:
                        row.kpi_name === KPI_NAMES.IVF_LN2_LID_STATE
                            ? valuesToLidState(row.min, row.max)
                            : null,
                });
            });

            return map;
        };

        const baseMap = toComparableMap(baseRows);
        const candidateMap = toComparableMap(candidateRows);
        const allKpiNames = new Set([
            ...Array.from(baseMap.keys()),
            ...Array.from(candidateMap.keys()),
        ]);

        for (const kpiName of allKpiNames) {
            const base = baseMap.get(kpiName);
            const candidate = candidateMap.get(kpiName);
            if (!base && !candidate) continue;
            if (!base || !candidate) return true;

            if (
                base.min !== candidate.min ||
                base.max !== candidate.max ||
                base.alert_type !== candidate.alert_type ||
                base.cooldown_minutes !== candidate.cooldown_minutes ||
                base.lid_state !== candidate.lid_state
            ) {
                return true;
            }
        }

        return false;
    };

    const applyContainerSelection = async (nextSelection: ContainerRow[]) => {
        if (selectionConflictCheckLoading) return;

        if (
            selectedContainers.length === 1 &&
            nextSelection.length > 1 &&
            configLoadedTankId !== selectedContainers[0]?.tank_id
        ) {
            return;
        }

        const switchingToMultiFromSingle =
            selectedContainers.length === 1 && nextSelection.length > 1;

        if (switchingToMultiFromSingle) {
            const newlyAddedContainers = nextSelection.filter(
                (next) =>
                    !selectedContainers.some(
                        (selected) => selected.tank_id === next.tank_id,
                    ),
            );

            if (newlyAddedContainers.length > 0) {
                setSelectionConflictCheckLoading(true);
                try {
                    const addedConfigs = await Promise.all(
                        newlyAddedContainers.map(async (container) => {
                            const response = await ivfService.getKpiConfigList(
                                container.tank_id,
                            );
                            return response?.config ?? [];
                        }),
                    );

                    const hasAnyConflict = addedConfigs.some((rows) =>
                        hasConfigConflict(configList, rows),
                    );

                    if (hasAnyConflict) {
                        setPendingContainerSelection(nextSelection);
                        setShowUnsetConfirm(true);
                        return;
                    }
                } catch (e: any) {
                    setConfigError(
                        e?.message ||
                            "Failed to compare alert settings between containers",
                    );
                    return;
                } finally {
                    setSelectionConflictCheckLoading(false);
                }
            }
        }

        setSelectedContainers(nextSelection);
        setSelectedChamberId(null);
    };

    const branchOptions = useMemo(
        () => ["All", ...branches.map((b) => b.branch_name)],
        [branches],
    );
    const filteredContainers = useMemo(() => {
        return containers.filter((c) => {
            const matchBranch = branchFilter === "All" || c.branchName === branchFilter;
            const matchDevice = directionFilter === "incubators" ? c.is_incubator : !c.is_incubator;
            return matchBranch && matchDevice;
        });
    }, [containers, branchFilter, directionFilter]);
    const activeFilterCount = useMemo(
        () => (branchFilter !== "All" ? 1 : 0),
        [branchFilter],
    );
    const lockContainerSelection =
        selectedContainers.length === 1 &&
        (configLoadedTankId !== selectedContainers[0]?.tank_id ||
            selectionConflictCheckLoading);
    const configuredKpiNames = useMemo(
        () => new Set(configList.map((r) => r.kpi_name)),
        [configList],
    );
    const missingKpiNames = useMemo(
        () =>
            activeKpiNames.filter((kpiName) => !configuredKpiNames.has(kpiName)),
        [configuredKpiNames, activeKpiNames],
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                branchDropdownRef.current &&
                !branchDropdownRef.current.contains(event.target as Node)
            ) {
                setIsBranchDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Onboarding: pre-fill draft values for Evaporation Rate and Lid State so the
    // Save Changes button becomes active for the final tour step.
    useEffect(() => {
        const handler = () => {
            setMultiDraft("ln2_evaporation_rate", { min: 0.5, max: 2.0, alert_type: "soft", cooldown_minutes: 60 });
            setMultiDraft("ln2_lid_state", { lid_state: "closed", alert_type: "soft", cooldown_minutes: 30 });
        };
        document.addEventListener("onboarding:prefill-alert-evap-lid", handler);
        return () => document.removeEventListener("onboarding:prefill-alert-evap-lid", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormPayload({});
        setFormError(null);
    };

    const validateForm = (): boolean => {
        const name = (formPayload.kpi_name ?? "").trim();
        if (!name) {
            setFormError("KPI name is required");
            return false;
        }
        setFormError(null);
        return true;
    };

    const handleCreate = async () => {
        if (
            !primaryContainer ||
            tankContext.hospital_id == null ||
            tankContext.branch_id == null
        ) {
            setFormError("Missing tank context");
            return;
        }
        if (!validateForm()) return;
        setSubmitLoading(true);
        try {
            const payload: KpiConfigPayload = {
                hospital_id: tankContext.hospital_id,
                branch_id: tankContext.branch_id,
                tank_id: primaryContainer.is_incubator ? null : primaryContainer.tank_id,
                incubator_id: primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? null) : null,
                chamber_id: primaryContainer.is_incubator ? (selectedChamberId ?? null) : null,
                kpi_name: (formPayload.kpi_name ?? "").trim(),
                alert_name: formPayload.alert_name ?? null,
                min: formPayload.min ?? null,
                max: formPayload.max ?? null,
                unit: formPayload.unit ?? null,
                alert_type: formPayload.alert_type ?? null,
                cooldown_minutes: formPayload.cooldown_minutes ?? 60,
                status: isActiveAlertType(formPayload.alert_type ?? null),
            };
            await ivfService.createKpiConfig(payload);
            closeForm();
            await refetchKpiConfig(primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id, { isIncubator: primaryContainer.is_incubator,
                showLoading: true,
            });
        } catch (e: any) {
            setFormError(e?.message || "Create failed");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (editingId == null || !validateForm()) return;
        setSubmitLoading(true);
        try {
            await ivfService.updateKpiConfig(editingId, {
                kpi_name: (formPayload.kpi_name ?? "").trim(),
                alert_name: formPayload.alert_name ?? null,
                min: formPayload.min ?? null,
                max: formPayload.max ?? null,
                unit: formPayload.unit ?? null,
                alert_type: formPayload.alert_type ?? null,
                cooldown_minutes: formPayload.cooldown_minutes ?? undefined,
                status: isActiveAlertType(formPayload.alert_type ?? null),
            });
            closeForm();
            if (primaryContainer) {
                await refetchKpiConfig(primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id, { isIncubator: primaryContainer.is_incubator,
                    showLoading: true,
                });
            }
        } catch (e: any) {
            setFormError(e?.message || "Update failed");
        } finally {
            setSubmitLoading(false);
        }
    };

    const closeDeleteConfirm = () => {
        if (!deleteLoading) {
            setShowDeleteConfirm(false);
            setConfigToDeleteId(null);
        }
    };

    const alertTypeOptions = [
        { value: null as string | null, label: "Alert Disabled" },
        { value: "no_alert", label: "No Alert" },
        { value: "soft", label: "Soft Alert" },
        { value: "critical", label: "Critical Alert" },
    ];

    const getDraft = (id: number) => draftConfig[id] ?? {};
    const setDraft = (
        id: number,
        patch: {
            min?: number | null;
            max?: number | null;
            alert_type?: string | null;
            lid_state?: string;
            cooldown_minutes?: number;
        },
    ) => {
        setDraftConfig((prev) => {
            const next = { ...prev };
            const current = next[id] ?? {};
            const merged = { ...current, ...patch };
            if (Object.keys(merged).length === 0) delete next[id];
            else next[id] = merged;
            return next;
        });
    };

    // Clear draft for single container mode
    const clearDraft = (id: number) => {
        setDraftConfig((prev) => {
            const next = { ...prev };
            next[id] = {
                min: null,
                max: null,
                alert_type: null,
                lid_state: "",
                cooldown_minutes: 60,
            };
            return next;
        });
    };

    // Multi-container draft helpers (keyed by kpi_name)
    const getMultiDraft = (kpiName: string) => multiDraftConfig[kpiName] ?? {};
    const setMultiDraft = (
        kpiName: string,
        patch: {
            min?: number | null;
            max?: number | null;
            alert_type?: string | null;
            lid_state?: string;
            cooldown_minutes?: number;
        },
    ) => {
        setMultiDraftConfig((prev) => {
            const next = { ...prev };
            const current = next[kpiName] ?? {};
            const merged = { ...current, ...patch };
            if (Object.keys(merged).length === 0) delete next[kpiName];
            else next[kpiName] = merged;
            return next;
        });
    };

    // Clear multi-draft for a KPI
    const clearMultiDraft = (kpiName: string) => {
        setMultiDraftConfig((prev) => {
            const next = { ...prev };
            next[kpiName] = {
                min: null,
                max: null,
                alert_type: null,
                lid_state: "",
                cooldown_minutes: 60,
            };
            return next;
        });
    };

    const handleSaveAll = async () => {
        const useMultiFlow =
            selectedContainers.length > 1 || configList.length === 0;
        if (useMultiFlow) {
            // For multi-container OR single container with no existing config: use multiDraftConfig to build configs for all KPIs that have values
            const configsToApply: Array<{
                kpi_name: string;
                alert_name: string | null;
                min: number | null;
                max: number | null;
                unit: string | null;
                alert_type: string | null;
                cooldown_minutes?: number;
                status?: boolean;
            }> = [];
            for (const kpiName of activeKpiNames) {
                const d = getMultiDraft(kpiName);
                const metadata = getKpiMetadata(kpiName);
                const cfg = getKpiFormConfig(kpiName);

                let minVal = d.min ?? null;
                let maxVal = d.max ?? null;

                if (cfg.max_bound !== null && minVal !== null) {
                    maxVal = cfg.max_bound;  // battery: max is always the hard ceiling
                }
                if (!cfg.max_available && cfg.max_bound === null) {
                    maxVal = null;  // ln2_level: no max
                }
                if (cfg.custom_dropdown && d.lid_state) {
                    const values = lidStateToValues(d.lid_state);
                    minVal = values.min;
                    maxVal = values.max;
                }

                if (
                    minVal !== null ||
                    maxVal !== null ||
                    d.alert_type !== undefined
                ) {
                    configsToApply.push({
                        kpi_name: kpiName,
                        alert_name:
                            kpiName === KPI_NAMES.IVF_LN2_LEVEL
                                ? "LN2"
                                : metadata.label,
                        min: minVal,
                        max: maxVal,
                        unit: metadata.unit ?? null,
                        alert_type: d.alert_type ?? null,
                        cooldown_minutes: d.cooldown_minutes,
                        status: isActiveAlertType(d.alert_type ?? null),
                    });
                }
            }

            if (configsToApply.length === 0) return;

            const tankIds = selectedContainers.map((c) => c.tank_id);
            setSaveAllLoading(true);
            try {
                await ivfService.bulkUpsertKpiConfig(tankIds, configsToApply);
                setMultiDraftConfig({});
                // For multi-container, deselect all. For single container, reload config.
                if (selectedContainers.length > 1) {
                    await refetchKpiConfig(
                        selectedContainers[0].is_incubator ? (selectedContainers[0].incubator_id ?? selectedContainers[0].tank_id) : selectedContainers[0].tank_id,
                        { showLoading: true, isIncubator: selectedContainers[0].is_incubator },
                    );
                    setSelectedContainers([]);
                } else if (primaryContainer) {
                    await refetchKpiConfig(primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id, { isIncubator: primaryContainer.is_incubator,
                        showLoading: true,
                    });
                }
                toast.success("Changes saved successfully");
            } catch (e: any) {
                setConfigError(e?.message || "Save failed");
            } finally {
                setSaveAllLoading(false);
            }
            return;
        }
        const ids = Object.keys(draftConfig).map(Number);
        const hasTemplateDrafts = Object.keys(multiDraftConfig).length > 0;
        if (ids.length === 0 && !hasTemplateDrafts) return;
        setSaveAllLoading(true);
        try {
            for (const id of ids) {
                const d = draftConfig[id];
                if (!d) continue;

                // Find the KPI name for this config id to apply special logic
                const config = configList.find((c) => c.id === id);
                const kpiName = config?.kpi_name || "";
                const cfg = getKpiFormConfig(kpiName);

                let minVal = d.min !== undefined ? d.min : undefined;
                let maxVal = d.max !== undefined ? d.max : undefined;

                if (cfg.max_bound !== null && minVal !== undefined && minVal !== null) {
                    maxVal = cfg.max_bound;  // battery: max is always the hard ceiling
                }
                if (!cfg.max_available && cfg.max_bound === null) {
                    maxVal = null;  // ln2_level: no max
                }
                if (cfg.custom_dropdown && d.lid_state !== undefined) {
                    const values = lidStateToValues(d.lid_state || null);
                    minVal = values.min;
                    maxVal = values.max;
                }

                const nextAlertType =
                    d.alert_type !== undefined
                        ? d.alert_type
                        : config?.alert_type ?? null;

                await ivfService.updateKpiConfig(id, {
                    min: minVal,
                    max: maxVal,
                    alert_type: nextAlertType,
                    cooldown_minutes:
                        d.cooldown_minutes !== undefined
                            ? d.cooldown_minutes
                            : undefined,
                    status: isActiveAlertType(nextAlertType),
                });
            }
            if (primaryContainer && hasTemplateDrafts) {
                const configsToApply: Array<{
                    kpi_name: string;
                    alert_name: string | null;
                    min: number | null;
                    max: number | null;
                    unit: string | null;
                    alert_type: string | null;
                    cooldown_minutes?: number;
                    status?: boolean;
                }> = [];

                for (const kpiName of missingKpiNames) {
                    const d = getMultiDraft(kpiName);
                    const metadata = getKpiMetadata(kpiName);
                    const cfg = getKpiFormConfig(kpiName);

                    let minVal = d.min ?? null;
                    let maxVal = d.max ?? null;

                    if (cfg.max_bound !== null && minVal !== null) {
                        maxVal = cfg.max_bound;
                    }
                    if (!cfg.max_available && cfg.max_bound === null) {
                        maxVal = null;
                    }
                    if (cfg.custom_dropdown && d.lid_state) {
                        const values = lidStateToValues(d.lid_state);
                        minVal = values.min;
                        maxVal = values.max;
                    }

                    if (
                        minVal !== null ||
                        maxVal !== null ||
                        d.alert_type !== undefined
                    ) {
                        configsToApply.push({
                            kpi_name: kpiName,
                            alert_name:
                                kpiName === KPI_NAMES.IVF_LN2_LEVEL
                                    ? "LN2"
                                    : metadata.label,
                            min: minVal,
                            max: maxVal,
                            unit: metadata.unit ?? null,
                            alert_type: d.alert_type ?? null,
                            cooldown_minutes: d.cooldown_minutes,
                            status: isActiveAlertType(d.alert_type ?? null),
                        });
                    }
                }

                if (configsToApply.length > 0) {
                    await ivfService.bulkUpsertKpiConfig(
                        [primaryContainer.tank_id],
                        configsToApply,
                    );
                }
            }
            setDraftConfig({});
            setMultiDraftConfig({});
            if (primaryContainer) {
                await refetchKpiConfig(primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id, { isIncubator: primaryContainer.is_incubator,
                    showLoading: true,
                });
            }
            toast.success("Changes saved successfully");
        } catch (e: any) {
            setConfigError(e?.message || "Save failed");
        } finally {
            setSaveAllLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (configToDeleteId == null) return;
        setDeleteLoading(true);
        try {
            await ivfService.deleteKpiConfig(configToDeleteId);
            closeDeleteConfirm();
            if (primaryContainer) {
                await refetchKpiConfig(primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id, { isIncubator: primaryContainer.is_incubator,
                    showLoading: true,
                });
            }
        } catch (e: any) {
            setConfigError(e?.message || "Delete failed");
        } finally {
            setDeleteLoading(false);
        }
    };

    const openNotifySettings = async () => {
        setShowNotifySettings(true);
        setNotifySettingsError(null);
        setNotifySettingsLoading(true);
        try {
            const res = await ivfService.getHospitalNotificationSettings();
            setNotifySettings(res);
        } catch (e: any) {
            setNotifySettingsError(
                e?.message || "Failed to load notification settings",
            );
        } finally {
            setNotifySettingsLoading(false);
        }
    };

    const handleSelectNotificationChannel = (
        channel: "email" | "whatsapp",
        enabled: boolean,
    ) => {
        setNotifySettings((prev) =>
            channel === "email"
                ? { ...prev, is_email_notifify: enabled }
                : { ...prev, is_whatsapp_notify: enabled },
        );
        setNotifySettingsError(null);
    };

    const handleSaveNotifySettings = async () => {
        if (
            !notifySettings.is_email_notifify &&
            !notifySettings.is_whatsapp_notify
        ) {
            setNotifySettingsError("Enable at least one notification channel");
            return;
        }
        setNotifySettingsSaving(true);
        setNotifySettingsError(null);
        try {
            await ivfService.updateHospitalNotificationSettings({
                is_email_notifify: notifySettings.is_email_notifify,
                is_whatsapp_notify: notifySettings.is_whatsapp_notify,
            });
            const updatedSettings =
                await ivfService.getHospitalNotificationSettings();
            setNotifySettings(updatedSettings);
            setShowNotifySettings(false);
        } catch (e: any) {
            setNotifySettingsError(
                e?.message || "Failed to save notification settings",
            );
        } finally {
            setNotifySettingsSaving(false);
        }
    };

    const isMultiMode =
        selectedContainers.length > 1 || configList.length === 0;
    const hasPendingChanges = isMultiMode
        ? Object.keys(multiDraftConfig).length > 0
        : Object.keys(draftConfig).length > 0 ||
          Object.keys(multiDraftConfig).length > 0;

    // ─── Shared input renderer driven by KPI_FORM_CONFIG ─────────────────────
    const renderKpiInputs = (
        kpiName: string,
        minVal: number | null,
        maxVal: number | null,
        lidStateVal: string,
        kpiKey: string,
        refs: { min?: HTMLInputElement | HTMLSelectElement | null; max?: HTMLInputElement | null },
        onMin: (v: number | null) => void,
        onMax: (v: number | null) => void,
        onLid: (v: string) => void,
    ) => {
        const cfg = getKpiFormConfig(kpiName);
        const dropdownKey = `lid-${kpiKey}`;

        if (cfg.custom_dropdown) {
            return (
                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <button
                            type="button"
                            className="dropdown-button w-full px-3 h-10 border border-gray-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white text-gray-900"
                            onClick={() => setOpenDropdowns((prev) => ({ ...prev, [dropdownKey]: !prev[dropdownKey] }))}
                        >
                            <span>{cfg.custom_dropdown.find((o) => o.value === lidStateVal)?.label || "Select"}</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[dropdownKey] ? "rotate-180" : ""}`} />
                        </button>
                        {openDropdowns[dropdownKey] && (
                            <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                {cfg.custom_dropdown.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${opt.value === lidStateVal ? "bg-gray-200 text-gray-900" : "text-gray-700 hover:bg-gray-100"}`}
                                        onClick={() => {
                                            onLid(opt.value);
                                            setOpenDropdowns((prev) => ({ ...prev, [dropdownKey]: false }));
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <>
                {cfg.min_available && (
                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-[#6b1176] focus-within:border-transparent">
                        <span className="text-xs text-gray-400 block">{cfg.min_label ?? "Min"}</span>
                        <div className="flex items-center gap-1">
                            <input
                                ref={(el) => { refs.min = el; }}
                                type="number"
                                step="any"
                                min={cfg.min_bound ?? undefined}
                                max={cfg.max_bound ?? undefined}
                                value={minVal != null ? minVal : ""}
                                onChange={(e) => {
                                    let v = e.target.value === "" ? null : Number(e.target.value);
                                    if (v !== null && cfg.min_bound !== null && v < cfg.min_bound) v = cfg.min_bound;
                                    if (v !== null && cfg.max_bound !== null && v > cfg.max_bound) v = cfg.max_bound;
                                    onMin(v);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, kpiKey, "min")}
                                placeholder={cfg.min_label ?? "Min"}
                                className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none"
                            />
                            {cfg.unit && <span className="text-sm text-gray-500 shrink-0">{cfg.unit}</span>}
                        </div>
                    </label>
                )}
                {cfg.max_available && (
                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-[#6b1176] focus-within:border-transparent">
                        <span className="text-xs text-gray-400 block">{cfg.max_label ?? "Max"}</span>
                        <div className="flex items-center gap-1">
                            <input
                                ref={(el) => { refs.max = el as HTMLInputElement; }}
                                type="number"
                                step="any"
                                min={cfg.min_bound ?? undefined}
                                value={maxVal != null ? maxVal : ""}
                                onChange={(e) => {
                                    let v = e.target.value === "" ? null : Number(e.target.value);
                                    if (v !== null && cfg.min_bound !== null && v < cfg.min_bound) v = cfg.min_bound;
                                    onMax(v);
                                }}
                                onKeyDown={(e) => handleKeyDown(e, kpiKey, "max")}
                                placeholder={cfg.max_label ?? "Max"}
                                className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none"
                            />
                            {cfg.unit && <span className="text-sm text-gray-500 shrink-0">{cfg.unit}</span>}
                        </div>
                    </label>
                )}
            </>
        );
    };
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <>
                <PageLayout
                    title="Alert Configuration"
                    icon={CriticalAlertsIcon}
                    actions={
                        <>
                            <div className="md:hidden">
                                <FilterPanel activeCount={activeFilterCount}>
                                    <FilterSelect
                                        label="Branch"
                                        value={branchFilter}
                                        options={branchOptions}
                                        allLabel="All Branches"
                                        onChange={(v) => setBranchFilter(v)}
                                    />
                                </FilterPanel>
                            </div>
                            <button
                                id="onboarding-alert-settings-btn"
                                type="button"
                                onClick={openNotifySettings}
                                className="w-9 h-9 rounded-lg border border-[#E7E1E1] bg-white flex items-center justify-center text-[#6b1176] hover:bg-[#F7ECFF] transition-colors"
                                aria-label="Notification settings"
                                title="Notification settings"
                            >
                                <Settings size={18} strokeWidth={2} />
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col xl1:flex-row gap-6 flex-1 min-h-0">
                        {/* Left: filters + containers (Control Tower UI) */}
                        <div className="w-full xl1:w-[380px] xl1:shrink-0 flex flex-col gap-6">
                            {/* Filters card - hidden on mobile (shown via header filter icon) */}
                            <div id="onboarding-alert-filters" className="hidden md:flex bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 flex-col gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Direction</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDirectionFilter("cryotanks")}
                                            className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${directionFilter === "cryotanks" ? "bg-[#6b1176] text-white border-[#6b1176]" : "bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50"}`}
                                        >
                                            Cryotanks
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDirectionFilter("incubators")}
                                            className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${directionFilter === "incubators" ? "bg-[#6b1176] text-white border-[#6b1176]" : "bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50"}`}
                                        >
                                            Incubators
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Branch
                                    </label>
                                    <div
                                        className="relative"
                                        ref={branchDropdownRef}
                                    >
                                        <button
                                            id="onboarding-alert-branch-dropdown"
                                            type="button"
                                            onClick={() => {
                                                setIsBranchDropdownOpen(
                                                    !isBranchDropdownOpen,
                                                );
                                            }}
                                            className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                                        >
                                            <span
                                                className={
                                                    branchFilter !== "All"
                                                        ? "text-[#6b1176]"
                                                        : "text-gray-700"
                                                }
                                            >
                                                {branchFilter === "All"
                                                    ? "All Branches"
                                                    : branchFilter}
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
                                            <div id="onboarding-alert-branch-dropdown-list" className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                {branchOptions.map((opt) => {
                                                    const branchObj = branches.find((b) => b.branch_name === opt);
                                                    return (
                                                    <button
                                                        key={opt}
                                                        id={branchObj ? `onboarding-alert-branch-${branchObj.branch_id}` : undefined}
                                                        type="button"
                                                        onClick={() => {
                                                            setBranchFilter(
                                                                opt,
                                                            );
                                                            setIsBranchDropdownOpen(
                                                                false,
                                                            );
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                            branchFilter === opt
                                                                ? "bg-[#6b1176] text-white"
                                                                : "text-[#6b1176] hover:bg-gray-100"
                                                        }`}
                                                    >
                                                        {opt === "All"
                                                            ? "All Branches"
                                                            : opt}
                                                    </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Active Containers card */}
                            <div id="onboarding-alert-containers" className="bg-white border border-[#E7E1E1] rounded-lg p-3 flex flex-col overflow-hidden flex-1 min-h-[340px]">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="font-bold text-black text-base">
                                        Active Containers
                                    </h2>
                                </div>
                                <div className="pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176]">
                                    Containers #
                                </div>
                                <div
                                    className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100"
                                    style={{ scrollbarWidth: "thin" }}
                                >
                                    {containersLoading && (
                                        <div className="flex-1 flex flex-col min-h-[280px] divide-y divide-gray-100">
                                            {Array.from(
                                                { length: 10 },
                                                (_, i) => i + 1,
                                            ).map((i) => (
                                                <div
                                                    key={i}
                                                    className="grid grid-cols-[1fr_40px] pl-2 pr-2 py-2 items-center gap-2"
                                                >
                                                    <div className="min-w-0 overflow-hidden space-y-2">
                                                        <div className="relative overflow-hidden h-3.5 w-24 rounded-md bg-gray-200">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08}s`,
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="relative overflow-hidden h-3 w-20 rounded-md bg-gray-100">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08 + 0.05}s`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <div className="relative overflow-hidden w-4 h-4 rounded border border-gray-200 bg-gray-100">
                                                            <div
                                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                                style={{
                                                                    width: "50%",
                                                                    animationDelay: `${i * 0.08}s`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {!containersLoading && containersError && (
                                        <div className="p-4 text-xs text-red-600">
                                            {containersError}
                                        </div>
                                    )}
                                    {!containersLoading &&
                                        !containersError &&
                                        filteredContainers.length > 0 &&
                                        filteredContainers.map((c) => {
                                            const isSelected =
                                                selectedContainers.some(
                                                    (s) =>
                                                        s.tank_id === c.tank_id,
                                                );
                                            return (
                                                <div
                                                    key={`${c.branch_id}-${c.tank_id}-${c.canisterId}`}
                                                    id={`onboarding-alert-container-${c.canisterId}`}
                                                    onClick={
                                                        lockContainerSelection
                                                            ? undefined
                                                            : () => void applyContainerSelection([c])
                                                    }
                                                    className={`pl-2 pr-2 py-2 hover:bg-gray-50 overflow-hidden cursor-pointer ${
                                                        isSelected
                                                            ? "bg-[#F7ECFF]"
                                                            : ""
                                                    } ${lockContainerSelection ? "opacity-70 cursor-not-allowed" : ""}`}
                                                >
                                                    <span className="text-[#6b1176] text-xs font-bold block truncate">
                                                        Container {c.canisterId}
                                                    </span>
                                                    {c.branchName && c.branchName !== "N/A" && (
                                                        <div className="text-xs text-gray-900 leading-snug truncate">
                                                            {c.branchName}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    {!containersLoading &&
                                        !containersError &&
                                        filteredContainers.length === 0 && (
                                            <div className="p-4 text-xs text-gray-500">
                                                No active containers found.
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>

                        {/* Right: KPI config cards */}
                        {/* Overlay backdrop — mobile only */}
                        {showKpiPanel && (
                            <div
                                className="xl1:hidden fixed inset-0 bg-black/40 z-40"
                                onClick={() => { setShowKpiPanel(false); setSelectedContainers([]); }}
                            />
                        )}
                        <section id="onboarding-alert-kpi-panel" className={`bg-white rounded-lg border border-[#E7E1E1] p-4 min-w-0 overflow-y-auto xl1:flex xl1:flex-1 xl1:flex-col xl1:overflow-hidden xl1:relative xl1:inset-auto xl1:z-auto ${showKpiPanel ? "fixed inset-x-3 top-14 bottom-3 z-50 flex flex-col" : "hidden"}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="font-bold text-black text-base">
                                    Alert Configuration{" "}
                                    {selectedContainers.length > 1
                                        ? `- ${selectedContainers.length} Containers Selected`
                                        : primaryContainer
                                          ? `- Cryocan ${primaryContainer.canisterId}`
                                          : ""}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => { setShowKpiPanel(false); setSelectedContainers([]); }}
                                    className="xl1:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                    aria-label="Close"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <p className="text-sm text-gray-600 mb-6">
                                {selectedContainers.length > 1
                                    ? "Configure alert thresholds to apply to all selected containers. Enter values and save to apply the same configuration to the selected containers."
                                    : configList.length === 0 && !configLoading
                                      ? "Selecting a tank will allow you to create alert configurations for various KPIs. Start by adding a new alert and setting thresholds to receive notifications when conditions are met."
                                      : "Configure alert thresholds for the selected container. Set minimum and maximum values to receive notifications when conditions are met."}
                            </p>
                            {primaryContainer?.is_incubator &&
                                primaryContainer.chamber_r != null &&
                                primaryContainer.chamber_c != null && (
                                    <div className="mb-6">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                            Select Chamber
                                        </p>
                                        <div
                                            className="inline-grid gap-1.5"
                                            style={{ gridTemplateColumns: `repeat(${primaryContainer.chamber_c}, minmax(0, 1fr))` }}
                                        >
                                            {Array.from({ length: primaryContainer.chamber_r }).map((_, r) =>
                                                Array.from({ length: primaryContainer.chamber_c! }).map((_, c) => {
                                                    const id = `R${r + 1}C${c + 1}`;
                                                    const active = selectedChamberId === id;
                                                    return (
                                                        <button
                                                            key={id}
                                                            type="button"
                                                            onClick={() => setSelectedChamberId(active ? null : id)}
                                                            title={id}
                                                            className={`w-9 h-9 rounded border text-xs font-medium transition-colors ${
                                                                active
                                                                    ? "bg-[#6b1176] text-white border-[#6b1176]"
                                                                    : "bg-white text-gray-600 border-gray-300 hover:border-[#6b1176] hover:text-[#6b1176]"
                                                            }`}
                                                        >
                                                            {id}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {selectedChamberId && (
                                            <p className="mt-2 text-xs text-[#6b1176] font-medium">
                                                Chamber {selectedChamberId} selected
                                            </p>
                                        )}
                                    </div>
                                )}
                            {!primaryContainer ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center text-gray-400">
                                        <svg
                                            className="w-16 h-16 mx-auto mb-3 opacity-50"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                        >
                                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                                            <rect
                                                x="9"
                                                y="3"
                                                width="6"
                                                height="4"
                                                rx="1"
                                            />
                                            <path
                                                d="M9 12h6M9 16h6"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <p className="text-md">
                                            Select one or more containers to
                                            configure alerts
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {configError && (
                                        <div className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded">
                                            {configError}
                                        </div>
                                    )}
                                    {configLoading ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center text-gray-400">
                                                <Loader2 className="animate-spin w-8 h-8 text-[#6b1176] mx-auto mb-2" />
                                                <p className="text-sm">
                                                    Loading configuration...
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col flex-1 min-h-0">
                                            <div
                                                className="flex-1 overflow-y-auto space-y-3 pr-1"
                                                style={{
                                                    scrollbarWidth: "thin",
                                                }}
                                            >
                                                {/* Multi-container mode OR single container with no config: show all KPI types with empty values */}
                                                {selectedContainers.length >
                                                    1 ||
                                                configList.length === 0 ? (
                                                    activeKpiNames.map(
                                                        (kpiName) => {
                                                            const d =
                                                                getMultiDraft(
                                                                    kpiName,
                                                                );
                                                            const minVal =
                                                                d.min ?? null;
                                                            const maxVal =
                                                                d.max ?? null;
                                                            const typeVal =
                                                                d.alert_type ??
                                                                null;
                                                            const lidStateVal =
                                                                d.lid_state ??
                                                                "";
                                                            const cooldownVal =
                                                                d.cooldown_minutes ??
                                                                60;
                                                            const metadata =
                                                                getKpiMetadata(
                                                                    kpiName,
                                                                );
                                                            const kpiKey = `multi-${kpiName}`;
                                                            const refs =
                                                                getInputRefs(
                                                                    kpiKey,
                                                                );

                                                            // Determine if alert type should be enabled based on KPI type
                                                            const canEnableAlert =
                                                                isAlertTypeEnabled(
                                                                    kpiName,
                                                                    minVal,
                                                                    maxVal,
                                                                    lidStateVal,
                                                                );

                                                            // Validation
                                                            const validation =
                                                                getKpiValidation(
                                                                    kpiName,
                                                                    minVal,
                                                                    maxVal,
                                                                );

                                                            const isAlertEnabled =
                                                                isActiveAlertType(typeVal);
                                                            const isCritical =
                                                                typeVal ===
                                                                "critical";

                                                            // Check if any value is set (for showing clear button)
                                                            const hasAnyValue =
                                                                minVal !==
                                                                    null ||
                                                                maxVal !==
                                                                    null ||
                                                                typeVal !==
                                                                    null ||
                                                                lidStateVal !==
                                                                    "";

                                                            return (
                                                                <div
                                                                    key={
                                                                        kpiName
                                                                    }
                                                                    id={`onboarding-alert-kpi-${kpiName}`}
                                                                    className={`relative rounded-xl border-2 p-5 transition-all duration-200 ${
                                                                        isAlertEnabled
                                                                            ? isCritical
                                                                                ? "border-red-200 bg-gradient-to-r from-red-50/50 to-white"
                                                                                : "border-[#E7D4F0] bg-gradient-to-r from-[#F7ECFF]/50 to-white"
                                                                            : "border-gray-200 bg-gray-50/30"
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                                                        <div className="flex items-center justify-between md:block">
                                                                            <div
                                                                                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center p-1 transform ${
                                                                                    isAlertEnabled
                                                                                        ? isCritical
                                                                                            ? "bg-red-100 text-red-500"
                                                                                            : "bg-[#F2E4FF] text-[#6b1176]"
                                                                                        : "bg-[#F2E4FF] text-[#6b1176]"
                                                                                }`}
                                                                            >
                                                                                {metadata.icon}
                                                                            </div>
                                                                            <AlertStatusBadge
                                                                                className="md:hidden"
                                                                                isAlertEnabled={isAlertEnabled}
                                                                                isCritical={isCritical}
                                                                                hasAnyValue={hasAnyValue}
                                                                                onClear={() => clearMultiDraft(kpiName)}
                                                                                showUnset
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-start justify-between gap-4">
                                                                                <div className="min-w-0">
                                                                                    <h3
                                                                                        className={`font-semibold text-sm ${isAlertEnabled ? "text-gray-900" : "text-gray-500"}`}
                                                                                    >
                                                                                        {
                                                                                            metadata.label
                                                                                        }
                                                                                    </h3>
                                                                                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                                                                        {
                                                                                            metadata.description
                                                                                        }
                                                                                    </p>
                                                                                </div>
                                                                                <AlertStatusBadge
                                                                                    className="hidden md:flex"
                                                                                    isAlertEnabled={isAlertEnabled}
                                                                                    isCritical={isCritical}
                                                                                    hasAnyValue={hasAnyValue}
                                                                                    onClear={() => clearMultiDraft(kpiName)}
                                                                                    showUnset
                                                                                />
                                                                            </div>

                                                                            {/* Validation error */}
                                                                            {!validation.valid && (
                                                                                <p className="text-xs text-red-500 mt-1">
                                                                                    {
                                                                                        validation.error
                                                                                    }
                                                                                </p>
                                                                            )}

                                                                            <div className="flex flex-wrap xl2:flex-nowrap items-center gap-3 mt-2 md:mt-4">
                                                                                {renderKpiInputs(
                                                                                    kpiName,
                                                                                    minVal,
                                                                                    maxVal,
                                                                                    lidStateVal,
                                                                                    kpiKey,
                                                                                    refs,
                                                                                    (v) => setMultiDraft(kpiName, { min: v }),
                                                                                    (v) => setMultiDraft(kpiName, { max: v }),
                                                                                    (v) => setMultiDraft(kpiName, { lid_state: v }),
                                                                                )}
                                                                                <div className="flex flex-wrap items-center gap-3">
                                                                                <div className="relative w-44 min-w-[140px]">
                                                                                    <button
                                                                                        type="button"
                                                                                        className={`dropdown-button w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white ${
                                                                                            !canEnableAlert
                                                                                                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                                                                                : isAlertEnabled
                                                                                                  ? isCritical
                                                                                                      ? "border-red-200 bg-red-50 text-red-700"
                                                                                                      : "border-[#E7D4F0] bg-[#F7ECFF] text-[#6b1176]"
                                                                                                  : "border-gray-200 bg-white text-gray-500"
                                                                                        }`}
                                                                                        disabled={
                                                                                            !canEnableAlert
                                                                                        }
                                                                                        onClick={() =>
                                                                                            setOpenDropdowns(
                                                                                                (
                                                                                                    prev,
                                                                                                ) => ({
                                                                                                    ...prev,
                                                                                                    [`multi-${kpiName}`]:
                                                                                                        !prev[
                                                                                                            `multi-${kpiName}`
                                                                                                        ],
                                                                                                }),
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <span>{alertTypeOptions.find((opt) => opt.value === typeVal)?.label}</span>
                                                                                        <ChevronDown
                                                                                            className={`w-4 h-4 transition-transform ${openDropdowns[`multi-${kpiName}`] ? "rotate-180" : ""}`}
                                                                                        />
                                                                                    </button>
                                                                                    {openDropdowns[
                                                                                        `multi-${kpiName}`
                                                                                    ] && (
                                                                                        <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                                                            {alertTypeOptions.map(
                                                                                                (
                                                                                                    opt,
                                                                                                ) => (
                                                                                                    <button
                                                                                                        key={
                                                                                                            opt.label
                                                                                                        }
                                                                                                        type="button"
                                                                                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                                                            opt.value ===
                                                                                                            typeVal
                                                                                                                ? "bg-gray-200 text-gray-900"
                                                                                                                : "text-gray-700 hover:bg-gray-100"
                                                                                                        }`}
                                                                                                        onClick={() => {
                                                                                                            const v =
                                                                                                                opt.value ===
                                                                                                                ""
                                                                                                                    ? null
                                                                                                                    : opt.value;
                                                                                                            setMultiDraft(
                                                                                                                kpiName,
                                                                                                                {
                                                                                                                    alert_type:
                                                                                                                        v,
                                                                                                                },
                                                                                                            );
                                                                                                            setOpenDropdowns(
                                                                                                                (
                                                                                                                    prev,
                                                                                                                ) => ({
                                                                                                                    ...prev,
                                                                                                                    [`multi-${kpiName}`]: false,
                                                                                                                }),
                                                                                                            );
                                                                                                        }}
                                                                                                    >
                                                                                                        {
                                                                                                            opt.label
                                                                                                        }
                                                                                                    </button>
                                                                                                ),
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                {/* Cooldown Minutes */}
                                                                                {isAlertEnabled && (
                                                                                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-[#6b1176] focus-within:border-transparent">
                                                                                        <span className="text-[10px] text-gray-400 block">Cooldown</span>
                                                                                        <div className="flex items-center gap-1">
                                                                                        <Clock size={14} className="text-gray-400 shrink-0" />
                                                                                        <input
                                                                                            type="number"
                                                                                            min={
                                                                                                1
                                                                                            }
                                                                                            max={
                                                                                                1440
                                                                                            }
                                                                                            step={
                                                                                                1
                                                                                            }
                                                                                            value={
                                                                                                cooldownVal
                                                                                            }
                                                                                            onChange={(
                                                                                                e,
                                                                                            ) => {
                                                                                                let v =
                                                                                                    e
                                                                                                        .target
                                                                                                        .value ===
                                                                                                    ""
                                                                                                        ? 60
                                                                                                        : Math.round(
                                                                                                              Number(
                                                                                                                  e
                                                                                                                      .target
                                                                                                                      .value,
                                                                                                              ),
                                                                                                          );
                                                                                                if (
                                                                                                    v <
                                                                                                    1
                                                                                                )
                                                                                                    v = 1;
                                                                                                if (
                                                                                                    v >
                                                                                                    1440
                                                                                                )
                                                                                                    v = 1440;
                                                                                                setMultiDraft(
                                                                                                    kpiName,
                                                                                                    {
                                                                                                        cooldown_minutes:
                                                                                                            v,
                                                                                                    },
                                                                                                );
                                                                                            }}
                                                                                            title="Alert cooldown period in minutes"
                                                                                            className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                                        />
                                                                                        <span className="text-sm text-gray-500 shrink-0">mins</span>
                                                                                        </div>
                                                                                    </label>
                                                                                )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        },
                                                    )
                                                ) : (
                                                    /* Single container mode: show existing config + missing KPI templates as unset */
                                                    <>
                                                        {configList.map((r) => {
                                                            const d = getDraft(
                                                                r.id,
                                                            );
                                                            const minVal =
                                                                d.min !==
                                                                undefined
                                                                    ? d.min
                                                                    : r.min;
                                                            const maxVal =
                                                                d.max !==
                                                                undefined
                                                                    ? d.max
                                                                    : r.max;
                                                            const typeVal =
                                                                d.alert_type !==
                                                                undefined
                                                                    ? d.alert_type
                                                                    : r.alert_type;
                                                            const cooldownVal =
                                                                d.cooldown_minutes !==
                                                                undefined
                                                                    ? d.cooldown_minutes
                                                                    : (r.cooldown_minutes ??
                                                                      60);
                                                            const metadata =
                                                                getKpiMetadata(
                                                                    r.kpi_name,
                                                                );
                                                            const displayLabel =
                                                                r.alert_name?.trim()
                                                                    ? r.alert_name
                                                                    : metadata.label;
                                                            const kpiKey = `single-${r.id}`;
                                                            const refs =
                                                                getInputRefs(
                                                                    kpiKey,
                                                                );

                                                            // For lid_state, calculate the state from min/max values
                                                            const lidStateVal =
                                                                d.lid_state !==
                                                                undefined
                                                                    ? d.lid_state
                                                                    : valuesToLidState(
                                                                          r.min,
                                                                          r.max,
                                                                      );

                                                            // Determine if alert type should be enabled based on KPI type
                                                            const canEnableAlert =
                                                                isAlertTypeEnabled(
                                                                    r.kpi_name,
                                                                    minVal,
                                                                    maxVal,
                                                                    lidStateVal,
                                                                );

                                                            // Validation
                                                            const validation =
                                                                getKpiValidation(
                                                                    r.kpi_name,
                                                                    minVal,
                                                                    maxVal,
                                                                );

                                                            const isAlertEnabled =
                                                                isActiveAlertType(typeVal);
                                                            const isCritical =
                                                                typeVal ===
                                                                "critical";

                                                            return (
                                                                <div
                                                                    key={r.id}
                                                                    id={`onboarding-alert-kpi-${r.kpi_name}`}
                                                                    className={`relative rounded-xl border-2 p-5 transition-all duration-200 ${
                                                                        isAlertEnabled
                                                                            ? isCritical
                                                                                ? "border-red-200 bg-gradient-to-r from-red-50/50 to-white"
                                                                                : "border-[#E7D4F0] bg-gradient-to-r from-[#F7ECFF]/50 to-white"
                                                                            : "border-gray-200 bg-gray-50/30"
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                                                        {/* Icon + mobile badge row */}
                                                                        <div className="flex items-center justify-between md:block">
                                                                            <div
                                                                                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center p-1 transform ${
                                                                                    isAlertEnabled
                                                                                        ? isCritical
                                                                                            ? "bg-red-100 text-red-500"
                                                                                            : "bg-[#F2E4FF] text-[#6b1176]"
                                                                                        : "bg-[#F2E4FF] text-[#6b1176]"
                                                                                }`}
                                                                            >
                                                                                {metadata.icon}
                                                                            </div>
                                                                            <AlertStatusBadge
                                                                                className="md:hidden"
                                                                                isAlertEnabled={isAlertEnabled}
                                                                                isCritical={isCritical}
                                                                                hasAnyValue
                                                                                onClear={() => clearDraft(r.id)}
                                                                            />
                                                                        </div>

                                                                        {/* Content */}
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-start justify-between gap-4">
                                                                                <div className="min-w-0">
                                                                                    <h3
                                                                                        className={`font-semibold text-sm ${isAlertEnabled ? "text-gray-900" : "text-gray-500"}`}
                                                                                    >
                                                                                        {r.kpi_name ===
                                                                                        KPI_NAMES.IVF_LN2_LEVEL
                                                                                            ? "LN2"
                                                                                            : displayLabel}
                                                                                    </h3>
                                                                                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                                                                        {
                                                                                            metadata.description
                                                                                        }
                                                                                    </p>
                                                                                </div>
                                                                                <AlertStatusBadge
                                                                                    className="hidden md:flex"
                                                                                    isAlertEnabled={isAlertEnabled}
                                                                                    isCritical={isCritical}
                                                                                    hasAnyValue
                                                                                    onClear={() => clearDraft(r.id)}
                                                                                />
                                                                            </div>

                                                                            {/* Validation error */}
                                                                            {!validation.valid && (
                                                                                <p className="text-xs text-red-500 mt-1">
                                                                                    {
                                                                                        validation.error
                                                                                    }
                                                                                </p>
                                                                            )}

                                                                            {/* Inputs Row */}
                                                                            <div className="flex flex-wrap xl2:flex-nowrap items-center gap-3 mt-2 md:mt-4">
                                                                                {renderKpiInputs(
                                                                                    r.kpi_name,
                                                                                    minVal,
                                                                                    maxVal,
                                                                                    lidStateVal,
                                                                                    kpiKey,
                                                                                    refs,
                                                                                    (v) => setDraft(r.id, { min: v }),
                                                                                    (v) => setDraft(r.id, { max: v }),
                                                                                    (v) => setDraft(r.id, { lid_state: v }),
                                                                                )}

                                                                                {/* Alert Type Select */}
                                                                                <div className="flex flex-wrap items-center gap-3">
                                                                                <div className="relative w-44 min-w-[140px]">
                                                                                    <button
                                                                                        type="button"
                                                                                        className={`dropdown-button w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white ${
                                                                                            !canEnableAlert
                                                                                                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                                                                                : isAlertEnabled
                                                                                                  ? isCritical
                                                                                                      ? "border-red-200 bg-red-50 text-red-700"
                                                                                                      : "border-[#E7D4F0] bg-[#F7ECFF] text-[#6b1176]"
                                                                                                  : "border-gray-200 bg-white text-gray-500"
                                                                                        }`}
                                                                                        disabled={
                                                                                            !canEnableAlert
                                                                                        }
                                                                                        onClick={() =>
                                                                                            setOpenDropdowns(
                                                                                                (
                                                                                                    prev,
                                                                                                ) => ({
                                                                                                    ...prev,
                                                                                                    [`single-${r.id}`]:
                                                                                                        !prev[
                                                                                                            `single-${r.id}`
                                                                                                        ],
                                                                                                }),
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <span>{alertTypeOptions.find((opt) => opt.value === typeVal)?.label}</span>
                                                                                        <ChevronDown
                                                                                            className={`w-4 h-4 transition-transform ${openDropdowns[`single-${r.id}`] ? "rotate-180" : ""}`}
                                                                                        />
                                                                                    </button>
                                                                                    {openDropdowns[
                                                                                        `single-${r.id}`
                                                                                    ] && (
                                                                                        <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                                                            {alertTypeOptions.map(
                                                                                                (
                                                                                                    opt,
                                                                                                ) => (
                                                                                                    <button
                                                                                                        key={
                                                                                                            opt.label
                                                                                                        }
                                                                                                        type="button"
                                                                                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                                                            opt.value ===
                                                                                                            typeVal
                                                                                                                ? "bg-gray-200 text-gray-900"
                                                                                                                : "text-gray-700 hover:bg-gray-100"
                                                                                                        }`}
                                                                                                        onClick={() => {
                                                                                                            const v =
                                                                                                                opt.value ===
                                                                                                                ""
                                                                                                                    ? null
                                                                                                                    : opt.value;
                                                                                                            setDraft(
                                                                                                                r.id,
                                                                                                                {
                                                                                                                    alert_type:
                                                                                                                        v,
                                                                                                                },
                                                                                                            );
                                                                                                            setOpenDropdowns(
                                                                                                                (
                                                                                                                    prev,
                                                                                                                ) => ({
                                                                                                                    ...prev,
                                                                                                                    [`single-${r.id}`]: false,
                                                                                                                }),
                                                                                                            );
                                                                                                        }}
                                                                                                    >
                                                                                                        {
                                                                                                            opt.label
                                                                                                        }
                                                                                                    </button>
                                                                                                ),
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                {/* Cooldown Minutes */}
                                                                                {isAlertEnabled && (
                                                                                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-[#6b1176] focus-within:border-transparent">
                                                                                        <span className="text-[10px] text-gray-400 block">Cooldown</span>
                                                                                        <div className="flex items-center gap-1">
                                                                                        <Clock size={14} className="text-gray-400 shrink-0" />
                                                                                        <input
                                                                                            type="number"
                                                                                            min={
                                                                                                1
                                                                                            }
                                                                                            max={
                                                                                                1440
                                                                                            }
                                                                                            step={
                                                                                                1
                                                                                            }
                                                                                            value={
                                                                                                cooldownVal
                                                                                            }
                                                                                            onChange={(
                                                                                                e,
                                                                                            ) => {
                                                                                                let v =
                                                                                                    e
                                                                                                        .target
                                                                                                        .value ===
                                                                                                    ""
                                                                                                        ? 60
                                                                                                        : Math.round(
                                                                                                              Number(
                                                                                                                  e
                                                                                                                      .target
                                                                                                                      .value,
                                                                                                              ),
                                                                                                          );
                                                                                                if (
                                                                                                    v <
                                                                                                    1
                                                                                                )
                                                                                                    v = 1;
                                                                                                if (
                                                                                                    v >
                                                                                                    1440
                                                                                                )
                                                                                                    v = 1440;
                                                                                                setDraft(
                                                                                                    r.id,
                                                                                                    {
                                                                                                        cooldown_minutes:
                                                                                                            v,
                                                                                                    },
                                                                                                );
                                                                                            }}
                                                                                            title="Alert cooldown period in minutes"
                                                                                            className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                                        />
                                                                                        <span className="text-sm text-gray-500 shrink-0">mins</span>
                                                                                        </div>
                                                                                    </label>
                                                                                )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {missingKpiNames.map(
                                                            (kpiName) => {
                                                                const d =
                                                                    getMultiDraft(
                                                                        kpiName,
                                                                    );
                                                                const minVal =
                                                                    d.min ??
                                                                    null;
                                                                const maxVal =
                                                                    d.max ??
                                                                    null;
                                                                const typeVal =
                                                                    d.alert_type ??
                                                                    null;
                                                                const lidStateVal =
                                                                    d.lid_state ??
                                                                    "";
                                                                const cooldownVal =
                                                                    d.cooldown_minutes ??
                                                                    60;
                                                                const metadata =
                                                                    getKpiMetadata(
                                                                        kpiName,
                                                                    );
                                                                const kpiKey = `single-missing-${kpiName}`;
                                                                const refs =
                                                                    getInputRefs(
                                                                        kpiKey,
                                                                    );
                                                                const canEnableAlert =
                                                                    isAlertTypeEnabled(
                                                                        kpiName,
                                                                        minVal,
                                                                        maxVal,
                                                                        lidStateVal,
                                                                    );

                                                                return (
                                                                    <div
                                                                        key={`missing-${kpiName}`}
                                                                        id={`onboarding-alert-kpi-${kpiName}`}
                                                                        className="relative rounded-xl border-2 border-gray-200 bg-gray-50/30 p-5 transition-all duration-200"
                                                                    >
                                                                        <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                                                                            {/* Icon + mobile badge row */}
                                                                            <div className="flex items-center justify-between md:block">
                                                                                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center p-1 bg-[#F2E4FF] text-[#6b1176]">
                                                                                    {metadata.icon}
                                                                                </div>
                                                                                <AlertStatusBadge
                                                                                    className="md:hidden"
                                                                                    isAlertEnabled={false}
                                                                                    isCritical={false}
                                                                                    hasAnyValue={minVal !== null || maxVal !== null || typeVal !== null || lidStateVal !== ""}
                                                                                    onClear={() => clearMultiDraft(kpiName)}
                                                                                    showUnset
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center justify-between gap-3">
                                                                                    <div className="min-w-0">
                                                                                        <h3 className="font-semibold text-sm text-gray-500">
                                                                                            {kpiName ===
                                                                                            KPI_NAMES.IVF_LN2_LEVEL
                                                                                                ? "LN2"
                                                                                                : metadata.label}
                                                                                        </h3>
                                                                                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                                                                            {
                                                                                                metadata.description
                                                                                            }
                                                                                        </p>
                                                                                    </div>
                                                                                    <AlertStatusBadge
                                                                                        className="hidden md:flex"
                                                                                        isAlertEnabled={false}
                                                                                        isCritical={false}
                                                                                        hasAnyValue={minVal !== null || maxVal !== null || typeVal !== null || lidStateVal !== ""}
                                                                                        onClear={() => clearMultiDraft(kpiName)}
                                                                                        showUnset
                                                                                    />
                                                                                </div>
                                                                                <div className="flex flex-wrap xl2:flex-nowrap items-center gap-3 mt-2 md:mt-4">
                                                                                {renderKpiInputs(
                                                                                    kpiName,
                                                                                    minVal,
                                                                                    maxVal,
                                                                                    lidStateVal,
                                                                                    kpiKey,
                                                                                    refs,
                                                                                    (v) => setMultiDraft(kpiName, { min: v }),
                                                                                    (v) => setMultiDraft(kpiName, { max: v }),
                                                                                    (v) => setMultiDraft(kpiName, { lid_state: v }),
                                                                                )}
                                                                                <div className="flex flex-wrap items-center gap-3">
                                                                            <div className="relative w-44 min-w-[140px]">
                                                                                <button
                                                                                    type="button"
                                                                                    className={`dropdown-button w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white ${
                                                                                        !canEnableAlert
                                                                                            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                                                                            : "border-gray-200 bg-white text-gray-700"
                                                                                    }`}
                                                                                    disabled={
                                                                                        !canEnableAlert
                                                                                    }
                                                                                    onClick={() =>
                                                                                        setOpenDropdowns(
                                                                                            (
                                                                                                prev,
                                                                                            ) => ({
                                                                                                ...prev,
                                                                                                [`single-missing-${kpiName}`]:
                                                                                                    !prev[
                                                                                                        `single-missing-${kpiName}`
                                                                                                    ],
                                                                                            }),
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <span>{alertTypeOptions.find((opt) => opt.value === typeVal)?.label}</span>
                                                                                    <ChevronDown
                                                                                        className={`w-4 h-4 transition-transform ${openDropdowns[`single-missing-${kpiName}`] ? "rotate-180" : ""}`}
                                                                                    />
                                                                                </button>
                                                                                {openDropdowns[
                                                                                    `single-missing-${kpiName}`
                                                                                ] && (
                                                                                    <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                                                                        {alertTypeOptions.map(
                                                                                            (
                                                                                                opt,
                                                                                            ) => (
                                                                                                <button
                                                                                                    key={
                                                                                                        opt.label
                                                                                                    }
                                                                                                    type="button"
                                                                                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                                                                        opt.value ===
                                                                                                        typeVal
                                                                                                            ? "bg-gray-200 text-gray-900"
                                                                                                            : "text-gray-700 hover:bg-gray-100"
                                                                                                    }`}
                                                                                                    onClick={() => {
                                                                                                        const v =
                                                                                                            opt.value ===
                                                                                                            ""
                                                                                                                ? null
                                                                                                                : opt.value;
                                                                                                        setMultiDraft(
                                                                                                            kpiName,
                                                                                                            {
                                                                                                                alert_type:
                                                                                                                    v,
                                                                                                            },
                                                                                                        );
                                                                                                        setOpenDropdowns(
                                                                                                            (
                                                                                                                prev,
                                                                                                            ) => ({
                                                                                                                ...prev,
                                                                                                                [`single-missing-${kpiName}`]: false,
                                                                                                            }),
                                                                                                        );
                                                                                                    }}
                                                                                                >
                                                                                                    {
                                                                                                        opt.label
                                                                                                    }
                                                                                                </button>
                                                                                            ),
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            {/* Cooldown Minutes */}
                                                                            {isActiveAlertType(typeVal) && (
                                                                                    <label className="block min-w-[72px] max-w-[120px] border border-gray-200 rounded-lg px-3 py-1 bg-white cursor-text focus-within:ring-2 focus-within:ring-[#6b1176] focus-within:border-transparent">
                                                                                        <span className="text-[10px] text-gray-400 block">Cooldown</span>
                                                                                        <div className="flex items-center gap-1">
                                                                                        <Clock size={14} className="text-gray-400 shrink-0" />
                                                                                        <input
                                                                                            type="number"
                                                                                            min={
                                                                                                1
                                                                                            }
                                                                                            max={
                                                                                                1440
                                                                                            }
                                                                                            step={
                                                                                                1
                                                                                            }
                                                                                            value={
                                                                                                cooldownVal
                                                                                            }
                                                                                            onChange={(
                                                                                                e,
                                                                                            ) => {
                                                                                                let v =
                                                                                                    e
                                                                                                        .target
                                                                                                        .value ===
                                                                                                    ""
                                                                                                        ? 60
                                                                                                        : Math.round(
                                                                                                              Number(
                                                                                                                  e
                                                                                                                      .target
                                                                                                                      .value,
                                                                                                              ),
                                                                                                          );
                                                                                                if (
                                                                                                    v <
                                                                                                    1
                                                                                                )
                                                                                                    v = 1;
                                                                                                if (
                                                                                                    v >
                                                                                                    1440
                                                                                                )
                                                                                                    v = 1440;
                                                                                                setMultiDraft(
                                                                                                    kpiName,
                                                                                                    {
                                                                                                        cooldown_minutes:
                                                                                                            v,
                                                                                                    },
                                                                                                );
                                                                                            }}
                                                                                            title="Alert cooldown period in minutes"
                                                                                            className="flex-1 min-w-0 text-sm text-gray-900 bg-transparent outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                                        />
                                                                                        <span className="text-sm text-gray-500 shrink-0">mins</span>
                                                                                        </div>
                                                                                    </label>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                                );
                                                            },
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-gray-100 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-end gap-3">
                                                {/* Save to Additional Branches */}
                                                <div className="relative w-full md:w-auto">
                                                    <button
                                                        type="button"
                                                        disabled={!primaryContainer || configList.length === 0}
                                                        onClick={() => setShowBranchDropdown((v) => !v)}
                                                        className="w-full md:w-auto px-4 py-2.5 border border-[#6b1176] text-[#6b1176] rounded-lg text-sm font-medium hover:bg-[#F7ECFF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                                    >
                                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                                                        </svg>
                                                        Copy to Additional Tanks
                                                        <svg className={`w-3 h-3 transition-transform ${showBranchDropdown ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                                                    </button>
                                                    {showBranchDropdown && (() => {
                                                        const filteredTanks = containers.filter((c) => {
                                                            const matchBranch = branchFilter === "All" || c.branchName === branchFilter;
                                                            const matchDevice = directionFilter === "incubators" ? c.is_incubator : !c.is_incubator;
                                                            return matchBranch && matchDevice && c.tank_id !== primaryContainer?.tank_id;
                                                        });
                                                        return (
                                                            <>
                                                                <div className="fixed inset-0 z-40" onClick={() => { setShowBranchDropdown(false); setSelectedTankIds([]); }} />
                                                                <div className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-[#E7E1E1] rounded-xl shadow-xl z-50 overflow-hidden">
                                                                    {/* Select all row */}
                                                                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                                                                        <span className="text-xs text-gray-500">{filteredTanks.length} tank{filteredTanks.length !== 1 ? "s" : ""}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setSelectedTankIds(
                                                                                    filteredTanks.every((c) => selectedTankIds.includes(c.tank_id))
                                                                                        ? selectedTankIds.filter((id) => !filteredTanks.some((c) => c.tank_id === id))
                                                                                        : [...new Set([...selectedTankIds, ...filteredTanks.map((c) => c.tank_id)])]
                                                                                )
                                                                            }
                                                                            className="text-xs text-[#6b1176] font-medium hover:underline"
                                                                        >
                                                                            {filteredTanks.every((c) => selectedTankIds.includes(c.tank_id)) && filteredTanks.length > 0 ? "Deselect All" : "Select All"}
                                                                        </button>
                                                                    </div>
                                                                    {/* Tank list */}
                                                                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-50" style={{ scrollbarWidth: "thin" }}>
                                                                        {filteredTanks.length === 0 && (
                                                                            <div className="px-4 py-3 text-xs text-gray-400">No tanks available.</div>
                                                                        )}
                                                                        {filteredTanks.map((c) => (
                                                                            <label key={c.tank_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F7ECFF] cursor-pointer">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={selectedTankIds.includes(c.tank_id)}
                                                                                    onChange={() =>
                                                                                        setSelectedTankIds((prev) =>
                                                                                            prev.includes(c.tank_id)
                                                                                                ? prev.filter((id) => id !== c.tank_id)
                                                                                                : [...prev, c.tank_id]
                                                                                        )
                                                                                    }
                                                                                    className="w-4 h-4 rounded border-gray-300 text-[#6b1176] focus:ring-[#6b1176]"
                                                                                />
                                                                                <div className="min-w-0">
                                                                                    <div className="text-xs font-semibold text-[#6b1176] truncate">Container {c.canisterId}</div>
                                                                                    <div className="text-xs text-gray-500 truncate">{c.branchName}</div>
                                                                                </div>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                    <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                                                                        <button
                                                                            type="button"
                                                                            disabled={selectedTankIds.length === 0 || savingToBranches}
                                                                            onClick={async () => {
                                                                                setSavingToBranches(true);
                                                                                try {
                                                                                    const configsToApply = configList.map((cfg) => ({
                                                                                        kpi_name: cfg.kpi_name,
                                                                                        alert_name: cfg.alert_name ?? null,
                                                                                        min: cfg.min ?? null,
                                                                                        max: cfg.max ?? null,
                                                                                        unit: cfg.unit ?? null,
                                                                                        alert_type: cfg.alert_type ?? null,
                                                                                        cooldown_minutes: cfg.cooldown_minutes,
                                                                                        status: isActiveAlertType(cfg.alert_type ?? null),
                                                                                    }));
                                                                                    await ivfService.bulkUpsertKpiConfig(selectedTankIds, configsToApply);
                                                                                    if (primaryContainer) {
                                                                                        await refetchKpiConfig(primaryContainer.is_incubator ? (primaryContainer.incubator_id ?? primaryContainer.tank_id) : primaryContainer.tank_id, { isIncubator: primaryContainer.is_incubator,
                                                                                            showLoading: true,
                                                                                        });
                                                                                    }
                                                                                    toast.success(`Copied to ${selectedTankIds.length} tank(s) successfully`);
                                                                                } finally {
                                                                                    setSavingToBranches(false);
                                                                                    setShowBranchDropdown(false);
                                                                                    setSelectedTankIds([]);
                                                                                }
                                                                            }}
                                                                            className="px-4 py-2 bg-[#6b1176] text-white rounded-lg text-xs font-medium hover:bg-[#8a2a95] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                                                        >
                                                                            {savingToBranches ? (
                                                                                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</>
                                                                            ) : (
                                                                                <>Apply to {selectedTankIds.length} Tank{selectedTankIds.length !== 1 ? "s" : ""}</>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {/* Save Changes */}
                                                <button
                                                    id="onboarding-alert-save-btn"
                                                    type="button"
                                                    onClick={handleSaveAll}
                                                    disabled={saveAllLoading || !hasPendingChanges}
                                                    className="w-full md:w-auto px-6 py-2.5 bg-[#6b1176] text-white rounded-lg text-sm font-medium hover:bg-[#8a2a95] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                                >
                                                    {saveAllLoading ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                                                <path d="M17 21v-8H7v8M7 3v5h8" />
                                                            </svg>
                                                            Save Changes
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    </div>
                </PageLayout>

            {/* Create/Edit modal */}
            {showForm && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={closeForm}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="font-semibold text-lg mb-4">
                            {editingId != null
                                ? "Edit KPI Config"
                                : "Add KPI Config"}
                        </h3>
                        {formError && (
                            <p className="text-red-600 text-sm mb-2">
                                {formError}
                            </p>
                        )}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    KPI Name *
                                </label>
                                <input
                                    value={formPayload.kpi_name ?? ""}
                                    onChange={(e) =>
                                        setFormPayload((p) => ({
                                            ...p,
                                            kpi_name: e.target.value,
                                        }))
                                    }
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    placeholder="e.g. ln2_level"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    Alert Name
                                </label>
                                <input
                                    value={formPayload.alert_name ?? ""}
                                    onChange={(e) =>
                                        setFormPayload((p) => ({
                                            ...p,
                                            alert_name: e.target.value || null,
                                        }))
                                    }
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    placeholder="e.g. l1, low"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-sm text-gray-600 mb-1">
                                        Min
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formPayload.min ?? ""}
                                        onChange={(e) =>
                                            setFormPayload((p) => ({
                                                ...p,
                                                min:
                                                    e.target.value === ""
                                                        ? null
                                                        : Number(
                                                              e.target.value,
                                                          ),
                                            }))
                                        }
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-600 mb-1">
                                        Max
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formPayload.max ?? ""}
                                        onChange={(e) =>
                                            setFormPayload((p) => ({
                                                ...p,
                                                max:
                                                    e.target.value === ""
                                                        ? null
                                                        : Number(
                                                              e.target.value,
                                                          ),
                                            }))
                                        }
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    Unit
                                </label>
                                <input
                                    value={formPayload.unit ?? ""}
                                    onChange={(e) =>
                                        setFormPayload((p) => ({
                                            ...p,
                                            unit: e.target.value || null,
                                        }))
                                    }
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    placeholder="e.g. %, °C"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    Alert Type
                                </label>
                                <input
                                    value={formPayload.alert_type ?? ""}
                                    onChange={(e) =>
                                        setFormPayload((p) => {
                                            const alertType =
                                                e.target.value || null;
                                            return {
                                                ...p,
                                                alert_type: alertType,
                                                status: isActiveAlertType(
                                                    alertType,
                                                ),
                                            };
                                        })
                                    }
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    placeholder="e.g. soft, critical"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    Cooldown (minutes)
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={1440}
                                        step={1}
                                        value={
                                            formPayload.cooldown_minutes ?? 60
                                        }
                                        onChange={(e) => {
                                            let v =
                                                e.target.value === ""
                                                    ? 60
                                                    : Math.round(
                                                          Number(
                                                              e.target.value,
                                                          ),
                                                      );
                                            if (v < 1) v = 1;
                                            if (v > 1440) v = 1440;
                                            setFormPayload((p) => ({
                                                ...p,
                                                cooldown_minutes: v,
                                            }));
                                        }}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="60"
                                    />
                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                        min
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Time between repeated alerts (default: 60
                                    min)
                                </p>
                            </div>
                            {editingId != null && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="form-status"
                                        checked={isActiveAlertType(
                                            formPayload.alert_type ?? null,
                                        )}
                                        disabled
                                    />
                                    <label htmlFor="form-status">
                                        Active when alert type is soft or
                                        critical
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={closeForm}
                                className="px-4 py-2 border rounded text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={
                                    editingId != null
                                        ? handleUpdate
                                        : handleCreate
                                }
                                disabled={submitLoading}
                                className="px-4 py-2 bg-[#9C3AA6] text-white rounded hover:opacity-90 text-sm disabled:opacity-50"
                            >
                                {submitLoading
                                    ? "Saving..."
                                    : editingId != null
                                      ? "Update"
                                      : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification settings modal */}
            {showNotifySettings && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => {
                        if (!notifySettingsSaving) {
                            setShowNotifySettings(false);
                            setNotifySettingsError(null);
                        }
                    }}
                >
                    <div
                        id="onboarding-alert-notify-modal"
                        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-lg text-black">
                                Notification Settings
                            </h3>
                            <button
                                id="onboarding-alert-notify-close"
                                type="button"
                                onClick={() => {
                                    if (!notifySettingsSaving) {
                                        setShowNotifySettings(false);
                                        setNotifySettingsError(null);
                                    }
                                }}
                                className="w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500"
                                aria-label="Close notification settings"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            Enable one or both channels for alert notifications.
                        </p>

                        {notifySettingsLoading ? (
                            <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
                                Loading settings...
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Email row */}
                                <div className="flex items-center justify-between py-2">
                                    <label
                                        htmlFor="notify-email"
                                        className="text-sm font-medium text-gray-900 cursor-pointer select-none"
                                    >
                                        Email Notification
                                    </label>
                                    <Switch
                                        id="notify-email"
                                        checked={
                                            notifySettings.is_email_notifify
                                        }
                                        onCheckedChange={(checked) =>
                                            handleSelectNotificationChannel(
                                                "email",
                                                checked,
                                            )
                                        }
                                        disabled={notifySettingsSaving}
                                    />
                                </div>

                                <div className="border-t border-gray-100" />

                                {/* WhatsApp row */}
                                <div className="flex items-center justify-between py-2">
                                    <label
                                        htmlFor="notify-whatsapp"
                                        className="text-sm font-medium text-gray-900 cursor-pointer select-none"
                                    >
                                        WhatsApp Notification
                                    </label>
                                    <Switch
                                        id="notify-whatsapp"
                                        checked={
                                            notifySettings.is_whatsapp_notify
                                        }
                                        onCheckedChange={(checked) =>
                                            handleSelectNotificationChannel(
                                                "whatsapp",
                                                checked,
                                            )
                                        }
                                        disabled={notifySettingsSaving}
                                    />
                                </div>

                                {notifySettingsError && (
                                    <p className="text-sm text-red-600">
                                        {notifySettingsError}
                                    </p>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!notifySettingsSaving) {
                                                setShowNotifySettings(false);
                                                setNotifySettingsError(null);
                                            }
                                        }}
                                        disabled={notifySettingsSaving}
                                        className="px-4 py-2 border border-[#E7E1E1] rounded text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveNotifySettings}
                                        disabled={notifySettingsSaving}
                                        className="px-4 py-2 bg-[#6b1176] text-white rounded text-sm hover:bg-[#8a2a95] disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {notifySettingsSaving ? (
                                            <>
                                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save"
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-transparent backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-4">
                            Confirm Delete
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete this KPI config row?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-4 justify-end">
                            <button
                                type="button"
                                className="px-6 py-2 bg-[#F2E4FF] text-[#8b2a96] rounded-md font-medium transition hover:bg-[#E8D4F0] disabled:opacity-50"
                                onClick={closeDeleteConfirm}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white rounded-md font-medium transition hover:bg-red-700 disabled:opacity-50"
                                onClick={handleDeleteConfirm}
                                disabled={deleteLoading}
                            >
                                {deleteLoading
                                    ? "Deleting..."
                                    : "Confirm Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unset confirmation modal */}
            {showUnsetConfirm && (
                <div className="fixed inset-0 bg-transparent backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
                        <h3 className="text-xl font-semibold text-gray-700 mb-4">
                            Resolve Conflicting Settings
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Some of the selected containers have different alert
                            settings. How would you like to proceed?
                        </p>
                        <div className="flex gap-4 justify-end">
                            <button
                                type="button"
                                className="px-6 py-2 bg-[#F2E4FF] text-[#8b2a96] rounded-md font-medium transition hover:bg-[#E8D4F0]"
                                onClick={handleContinueWithOldSetting}
                            >
                                Keep Existing Settings
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-[#6b1176] text-white rounded-md font-medium transition hover:bg-[#8a2a95]"
                                onClick={handleConfirmUnsetAndApply}
                            >
                                Apply Unified Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
