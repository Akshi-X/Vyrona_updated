import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { ivfService, type IvfBranch, type KpiConfigRow, type KpiConfigPayload } from '../../services/ivfService';
import { shipmentService } from '../../services/shipmentService';
import { Thermometer, Droplets, TrendingUp, Zap, Battery, DoorOpen, Info, X, Bell, Mail, ThermometerSun, Minus, ChevronDown, Loader2 } from 'lucide-react';

interface ContainerRow {
  tank_id: number;
  canisterId: string;
  branchName: string;
  branch_id: number;
  status: string;
  date: string;
}

const KPI_NAMES = {
  IVF_TEMPERATURE_INTERNAL: "temp_internal",
  IVF_TEMPERATURE_EXTERNAL: "temp_external",
  IVF_LN2_LEVEL: "ln2_level",
  IVF_LN2_EVAPORATION_RATE: "ln2_evaporation_rate",
  IVF_SHOCK: "shock",
  IVF_TIVE_BATTERY_PERCENTAGE: "tive_battery_percentage",
  IVF_LN2_LID_STATE: "ln2_lid_state",
} as const;

// KPI metadata configuration with icons, labels, and descriptions
interface KpiMetadata {
  label: string;
  description: string;
  icon: React.ReactNode;
  unit?: string;
}

const KPI_METADATA: Record<string, KpiMetadata> = {
  [KPI_NAMES.IVF_TEMPERATURE_INTERNAL]: {
    label: 'Internal Temperature',
    description: 'Monitor the internal tank temperature for safe storage conditions',
    icon: <Thermometer size={20} />,
    unit: '°C',
  },
  [KPI_NAMES.IVF_TEMPERATURE_EXTERNAL]: {
    label: 'External Temperature',
    description: 'Track ambient temperature around the storage container',
    icon: <ThermometerSun size={20} />,
    unit: '°C',
  },
  [KPI_NAMES.IVF_LN2_LEVEL]: {
    label: 'LN2',
    description: 'Liquid nitrogen level monitoring for cryogenic safety',
    icon: <Droplets size={20} />,
    unit: 'Ln2 in kg',
  },
  [KPI_NAMES.IVF_LN2_EVAPORATION_RATE]: {
    label: 'Evaporation Rate',
    description: 'Track LN2 evaporation rate to predict refill schedules',
    icon: <TrendingUp size={20} />,
    unit: '%/day',
  },
  [KPI_NAMES.IVF_SHOCK]: {
    label: 'Shock Detection',
    description: 'Alert for physical impacts or sudden movements',
    icon: <Zap size={20} />,
    unit: 'g',
  },
  [KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE]: {
    label: 'Battery Level',
    description: 'Monitor device battery to ensure continuous tracking',
    icon: <Battery size={20} />,
    unit: '%',
  },
  [KPI_NAMES.IVF_LN2_LID_STATE]: {
    label: 'Lid State',
    description: 'Monitor container lid open/close status for security',
    icon: <DoorOpen size={20} />,
  },
};

// Default metadata for unknown KPIs
const DEFAULT_KPI_METADATA: KpiMetadata = {
  label: 'Custom Alert',
  description: 'Custom monitoring parameter',
  icon: <Info size={20} />,
};

// Helper to get KPI metadata
const getKpiMetadata = (kpiName: string): KpiMetadata => {
  return KPI_METADATA[kpiName] || DEFAULT_KPI_METADATA;
};

// All KPI names as an array for multi-container selection
const ALL_KPI_NAMES = Object.values(KPI_NAMES);

// KPI-specific input type configurations
type KpiInputType = 'standard' | 'temperature' | 'percentage' | 'battery' | 'lid_state';

const getKpiInputType = (kpiName: string): KpiInputType => {
  switch (kpiName) {
    case KPI_NAMES.IVF_TEMPERATURE_INTERNAL:
    case KPI_NAMES.IVF_TEMPERATURE_EXTERNAL:
      return 'temperature';
    case KPI_NAMES.IVF_LN2_LEVEL:
      return 'percentage';
    case KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE:
      return 'battery';
    case KPI_NAMES.IVF_LN2_LID_STATE:
      return 'lid_state';
    default:
      return 'standard';
  }
};

// Lid state options for select dropdown
const LID_STATE_OPTIONS = [
  { value: '', label: 'Select State' },
  { value: 'closed', label: 'Closed (Alert when opened)' },
  { value: 'open', label: 'Open (Alert when closed)' },
];

// Helper to convert lid state to min/max values
const lidStateToValues = (state: string | null): { min: number | null; max: number | null } => {
  if (state === 'closed') return { min: 0, max: 0 }; // Alert when lid opens (value becomes 1)
  if (state === 'open') return { min: 1, max: 1 }; // Alert when lid closes (value becomes 0)
  return { min: null, max: null };
};

// Helper to convert min/max to lid state
const valuesToLidState = (min: number | null, max: number | null): string => {
  if (min === 0 && max === 0) return 'closed';
  if (min === 1 && max === 1) return 'open';
  return '';
};

// Validation helpers
const validateMinMax = (min: number | null, max: number | null): { valid: boolean; error?: string } => {
  if (min !== null && max !== null && min > max) {
    return { valid: false, error: 'Min must be ≤ Max' };
  }
  return { valid: true };
};

const validateTemperature = (min: number | null, max: number | null): { valid: boolean; error?: string } => {
  // Both must be set or both must be null
  if ((min !== null && max === null) || (min === null && max !== null)) {
    return { valid: false, error: 'Both min and max are required' };
  }
  return validateMinMax(min, max);
};

const validatePercentage = (min: number | null, max: number | null): { valid: boolean; error?: string } => {
  if (min !== null && min < 0) {
    return { valid: false, error: 'Min cannot be negative' };
  }
  if (max !== null && max < 0) {
    return { valid: false, error: 'Max cannot be negative' };
  }
  return validateMinMax(min, max);
};

const validateBattery = (min: number | null): { valid: boolean; error?: string } => {
  if (min !== null && min < 0) {
    return { valid: false, error: 'Min cannot be negative' };
  }
  if (min !== null && min > 100) {
    return { valid: false, error: 'Min cannot exceed 100' };
  }
  return { valid: true };
};

// Check if alert type should be enabled based on KPI type and values
const isAlertTypeEnabled = (kpiName: string, min: number | null, max: number | null, lidState?: string): boolean => {
  if (kpiName === KPI_NAMES.IVF_LN2_LEVEL) {
    return min !== null;
  }
  const inputType = getKpiInputType(kpiName);
  switch (inputType) {
    case 'lid_state':
      return !!lidState && lidState !== '';
    case 'battery':
      return min !== null;
    case 'temperature':
      return min !== null && max !== null;
    default:
      return min !== null || max !== null;
  }
};

// Get validation for a specific KPI
const getKpiValidation = (kpiName: string, min: number | null, max: number | null): { valid: boolean; error?: string } => {
  if (kpiName === KPI_NAMES.IVF_LN2_LEVEL) {
    return validatePercentage(min, null);
  }
  const inputType = getKpiInputType(kpiName);
  switch (inputType) {
    case 'temperature':
      return validateTemperature(min, max);
    case 'percentage':
      return validatePercentage(min, max);
    case 'battery':
      return validateBattery(min);
    case 'lid_state':
      return { valid: true }; // Lid state validation is handled differently
    default:
      return validateMinMax(min, max);
  }
};

export default function AlertSetting() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [branches, setBranches] = useState<IvfBranch[]>([]);
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const isInsideDropdown = target.closest('.dropdown-button') || target.closest('.dropdown-menu');
      if (!isInsideDropdown) {
        setOpenDropdowns({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [containersLoading, setContainersLoading] = useState(false);
  const [containersError, setContainersError] = useState<string | null>(null);

  const [selectedContainers, setSelectedContainers] = useState<ContainerRow[]>([]);
  const primaryContainer = selectedContainers[0] ?? null;
  const [configList, setConfigList] = useState<KpiConfigRow[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tankContext, setTankContext] = useState<{ hospital_id: number | null; branch_id: number | null }>({ hospital_id: null, branch_id: null });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formPayload, setFormPayload] = useState<Partial<KpiConfigPayload>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [configToDeleteId, setConfigToDeleteId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /** Inline edit draft for KPI table: min, max, alert_type, lid_state per config id */
  const [draftConfig, setDraftConfig] = useState<Record<number, { min?: number | null; max?: number | null; alert_type?: string | null; lid_state?: string }>>({});
  /** Multi-container draft: keyed by kpi_name instead of id */
  const [multiDraftConfig, setMultiDraftConfig] = useState<Record<string, { min?: number | null; max?: number | null; alert_type?: string | null; lid_state?: string }>>({});
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  
  // Refs for focus management - use a map to store refs by KPI identifier
  const inputRefsMap = useRef<Map<string, { min?: HTMLInputElement | HTMLSelectElement | null; max?: HTMLInputElement | null; alertType?: HTMLSelectElement | null }>>(new Map());
  
  // Get or create ref entry for a KPI
  const getInputRefs = useCallback((key: string) => {
    if (!inputRefsMap.current.has(key)) {
      inputRefsMap.current.set(key, {});
    }
    return inputRefsMap.current.get(key)!;
  }, []);
  
  // Handle Enter key to move focus to next input
  const handleKeyDown = useCallback((e: React.KeyboardEvent, kpiKey: string, currentField: 'min' | 'max' | 'alertType' | 'lidState') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const refs = getInputRefs(kpiKey);
      const kpiName = kpiKey.includes('-') ? kpiKey.split('-').pop() : kpiKey;
      const inputType = getKpiInputType(kpiName || '');
      const isLn2Level = (kpiName || '') === KPI_NAMES.IVF_LN2_LEVEL;
      
      switch (currentField) {
        case 'min':
          if (inputType === 'battery') {
            refs.alertType?.focus();
          } else if (isLn2Level) {
            refs.alertType?.focus();
          } else if (inputType === 'lid_state') {
            refs.alertType?.focus();
          } else {
            refs.max?.focus();
          }
          break;
        case 'max':
          refs.alertType?.focus();
          break;
        case 'lidState':
          refs.alertType?.focus();
          break;
        case 'alertType':
          // Move to next KPI's first input (optional - could be implemented if needed)
          break;
      }
    }
  }, [getInputRefs]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
    const filters: { branch_name?: string } = {};
    if (branchFilter && branchFilter !== 'All') filters.branch_name = branchFilter;
    shipmentService
      .getActiveCanisters(filters)
      .then((data: any) => {
        let list: ContainerRow[] = [];
        if (data?.canisters && Array.isArray(data.canisters)) {
          list = data.canisters.map((c: any) => ({
            tank_id: c.tank_id ?? c.canister_id,
            canisterId: String(c.canister_number ?? c.canister_id ?? c.tank_code ?? ''),
            branchName: c.branch_name ?? 'N/A',
            branch_id: c.branch_id ?? 0,
            status: c.canister_status === 'critical' ? 'Critical' : c.canister_status === 'risk' ? 'Risk' : 'Safe',
            date: c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '-',
          }));
        } else if (data?.branches && Array.isArray(data.branches)) {
          list = data.branches.flatMap((branch: any) => {
            const tanks = branch.tanks || branch.canisters || [];
            return tanks.map((t: any) => {
              const status = (t.status || t.canister_status || 'safe').toString();
              const statusDisplay = status === 'critical' ? 'Critical' : status === 'risk' ? 'Risk' : 'Safe';
              return {
                tank_id: t.tank_id ?? t.canister_id ?? 0,
                canisterId: String(t.tank_code ?? t.canister_number ?? t.canister_id ?? ''),
                branchName: branch.branch_name || 'N/A',
                branch_id: branch.branch_id ?? 0,
                status: statusDisplay,
                date: t.updated_at ? new Date(t.updated_at).toLocaleDateString('en-GB') : '-',
              };
            });
          });
        }
        setContainers(list);
      })
      .catch((e: any) => {
        setContainersError(e?.message || 'Failed to fetch');
        setContainers([]);
      })
      .finally(() => setContainersLoading(false));
  }, [isAuthenticated, branchFilter]);

  useEffect(() => {
    if (!primaryContainer?.tank_id) {
      setConfigList([]);
      setTankContext({ hospital_id: null, branch_id: null });
      return;
    }
    setConfigLoading(true);
    setConfigError(null);
    ivfService
      .getKpiConfigList(primaryContainer.tank_id)
      .then((res) => {
        setConfigList(res?.config ?? []);
        setTankContext({
          hospital_id: res?.hospital_id ?? null,
          branch_id: res?.branch_id ?? null,
        });
      })
      .catch((e: any) => {
        setConfigError(e?.message || 'Failed to fetch KPI config');
        setConfigList([]);
      })
      .finally(() => setConfigLoading(false));
  }, [primaryContainer?.tank_id]);

  useEffect(() => {
    setDraftConfig({});
    setMultiDraftConfig({});
  }, [primaryContainer?.tank_id]);

  const branchOptions = useMemo(() => ['All', ...branches.map((b) => b.branch_name)], [branches]);
  const configuredKpiNames = useMemo(() => new Set(configList.map((r) => r.kpi_name)), [configList]);
  const missingKpiNames = useMemo(
    () => ALL_KPI_NAMES.filter((kpiName) => !configuredKpiNames.has(kpiName)),
    [configuredKpiNames]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setIsBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormPayload({});
    setFormError(null);
  };

  const validateForm = (): boolean => {
    const name = (formPayload.kpi_name ?? '').trim();
    if (!name) {
      setFormError('KPI name is required');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handleCreate = async () => {
    if (!primaryContainer || tankContext.hospital_id == null || tankContext.branch_id == null) {
      setFormError('Missing tank context');
      return;
    }
    if (!validateForm()) return;
    setSubmitLoading(true);
    try {
      const payload: KpiConfigPayload = {
        hospital_id: tankContext.hospital_id,
        branch_id: tankContext.branch_id,
        tank_id: primaryContainer.tank_id,
        kpi_name: (formPayload.kpi_name ?? '').trim(),
        alert_name: formPayload.alert_name ?? null,
        min: formPayload.min ?? null,
        max: formPayload.max ?? null,
        unit: formPayload.unit ?? null,
        alert_type: formPayload.alert_type ?? null,
        status: formPayload.status ?? true,
      };
      await ivfService.createKpiConfig(payload);
      closeForm();
      const res = await ivfService.getKpiConfigList(primaryContainer.tank_id);
      setConfigList(res?.config ?? []);
    } catch (e: any) {
      setFormError(e?.message || 'Create failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (editingId == null || !validateForm()) return;
    setSubmitLoading(true);
    try {
      await ivfService.updateKpiConfig(editingId, {
        kpi_name: (formPayload.kpi_name ?? '').trim(),
        alert_name: formPayload.alert_name ?? null,
        min: formPayload.min ?? null,
        max: formPayload.max ?? null,
        unit: formPayload.unit ?? null,
        alert_type: formPayload.alert_type ?? null,
        status: formPayload.status ?? undefined,
      });
      closeForm();
      if (primaryContainer) {
        const res = await ivfService.getKpiConfigList(primaryContainer.tank_id);
        setConfigList(res?.config ?? []);
      }
    } catch (e: any) {
      setFormError(e?.message || 'Update failed');
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
    { value: null as string | null, label: 'Alert Disabled' },
    { value: 'soft', label: 'Soft Alert' },
    { value: 'critical', label: 'Critical Alert' },
  ];

  const getDraft = (id: number) => draftConfig[id] ?? {};
  const setDraft = (id: number, patch: { min?: number | null; max?: number | null; alert_type?: string | null; lid_state?: string }) => {
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
      next[id] = { min: null, max: null, alert_type: null, lid_state: '' };
      return next;
    });
  };

  // Multi-container draft helpers (keyed by kpi_name)
  const getMultiDraft = (kpiName: string) => multiDraftConfig[kpiName] ?? {};
  const setMultiDraft = (kpiName: string, patch: { min?: number | null; max?: number | null; alert_type?: string | null; lid_state?: string }) => {
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
      next[kpiName] = { min: null, max: null, alert_type: null, lid_state: '' };
      return next;
    });
  };

  const handleSaveAll = async () => {
    const useMultiFlow = selectedContainers.length > 1 || configList.length === 0;
    if (useMultiFlow) {
      // For multi-container OR single container with no existing config: use multiDraftConfig to build configs for all KPIs that have values
      const configsToApply: Array<{
        kpi_name: string;
        alert_name: string | null;
        min: number | null;
        max: number | null;
        unit: string | null;
        alert_type: string | null;
      }> = [];
      for (const kpiName of ALL_KPI_NAMES) {
        const d = getMultiDraft(kpiName);
        const metadata = getKpiMetadata(kpiName);
        const inputType = getKpiInputType(kpiName);

        let minVal = d.min ?? null;
        let maxVal = d.max ?? null;

        if (inputType === 'battery' && minVal !== null) {
          maxVal = 100;
        }
        if (kpiName === KPI_NAMES.IVF_LN2_LEVEL) {
          maxVal = null;
        }
        if (inputType === 'lid_state' && d.lid_state) {
          const values = lidStateToValues(d.lid_state);
          minVal = values.min;
          maxVal = values.max;
        }

        if (minVal !== null || maxVal !== null || (d.alert_type !== undefined && d.alert_type !== null)) {
          configsToApply.push({
            kpi_name: kpiName,
            alert_name: kpiName === KPI_NAMES.IVF_LN2_LEVEL ? 'LN2' : metadata.label,
            min: minVal,
            max: maxVal,
            unit: metadata.unit ?? null,
            alert_type: d.alert_type ?? null,
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
          setSelectedContainers([]);
        } else if (primaryContainer) {
          const res = await ivfService.getKpiConfigList(primaryContainer.tank_id);
          setConfigList(res?.config ?? []);
        }
      } catch (e: any) {
        setConfigError(e?.message || 'Save failed');
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
        const config = configList.find(c => c.id === id);
        const kpiName = config?.kpi_name || '';
        const inputType = getKpiInputType(kpiName);
        
        let minVal = d.min !== undefined ? d.min : undefined;
        let maxVal = d.max !== undefined ? d.max : undefined;
        
        // For battery, max is always 100
        if (inputType === 'battery' && minVal !== undefined && minVal !== null) {
          maxVal = 100;
        }
        if (kpiName === KPI_NAMES.IVF_LN2_LEVEL) {
          maxVal = null;
        }
        
        // For lid_state, convert state to min/max
        if (inputType === 'lid_state' && d.lid_state !== undefined) {
          const values = lidStateToValues(d.lid_state || null);
          minVal = values.min;
          maxVal = values.max;
        }
        
        await ivfService.updateKpiConfig(id, {
          min: minVal,
          max: maxVal,
          alert_type: d.alert_type !== undefined ? d.alert_type : undefined,
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
        }> = [];

        for (const kpiName of missingKpiNames) {
          const d = getMultiDraft(kpiName);
          const metadata = getKpiMetadata(kpiName);
          const inputType = getKpiInputType(kpiName);

          let minVal = d.min ?? null;
          let maxVal = d.max ?? null;

          if (inputType === 'battery' && minVal !== null) {
            maxVal = 100;
          }
          if (kpiName === KPI_NAMES.IVF_LN2_LEVEL) {
            maxVal = null;
          }
          if (inputType === 'lid_state' && d.lid_state) {
            const values = lidStateToValues(d.lid_state);
            minVal = values.min;
            maxVal = values.max;
          }

          if (minVal !== null || maxVal !== null || (d.alert_type !== undefined && d.alert_type !== null)) {
            configsToApply.push({
              kpi_name: kpiName,
              alert_name: kpiName === KPI_NAMES.IVF_LN2_LEVEL ? 'LN2' : metadata.label,
              min: minVal,
              max: maxVal,
              unit: metadata.unit ?? null,
              alert_type: d.alert_type ?? null,
            });
          }
        }

        if (configsToApply.length > 0) {
          await ivfService.bulkUpsertKpiConfig([primaryContainer.tank_id], configsToApply);
        }
      }
      setDraftConfig({});
      setMultiDraftConfig({});
      if (primaryContainer) {
        const res = await ivfService.getKpiConfigList(primaryContainer.tank_id);
        setConfigList(res?.config ?? []);
      }
    } catch (e: any) {
      setConfigError(e?.message || 'Save failed');
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
        const res = await ivfService.getKpiConfigList(primaryContainer.tank_id);
        setConfigList(res?.config ?? []);
      }
    } catch (e: any) {
      setConfigError(e?.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const isMultiMode = selectedContainers.length > 1 || configList.length === 0;
  const hasPendingChanges = isMultiMode
    ? Object.keys(multiDraftConfig).length > 0
    : (Object.keys(draftConfig).length > 0 || Object.keys(multiDraftConfig).length > 0);

  return (
    <div className="flex w-full bg-[#FDFAFF]" style={{ height: '100vh' }}>
      <Sidebar onLogout={handleLogout} />
      <main className="flex-1 flex flex-col overflow-hidden ml-60 min-w-0">
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0">
          <h1 className="font-semibold text-black text-2xl">Alert Setting</h1>
          <div className="flex gap-6 flex-1 min-h-0">
          {/* Left: filters + containers (Control Tower UI) */}
          <div className="w-[380px] shrink-0 flex flex-col gap-6">
            {/* Filters card */}
            <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                <div className="relative" ref={branchDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBranchDropdownOpen(!isBranchDropdownOpen);
                    }}
                    className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                  >
                    <span className={branchFilter !== 'All' ? 'text-[#6b1176]' : 'text-gray-700'}>
                      {branchFilter === 'All' ? 'All Branches' : branchFilter}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isBranchDropdownOpen && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                      {branchOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setBranchFilter(opt);
                            setIsBranchDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                            branchFilter === opt ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                          }`}
                        >
                          {opt === 'All' ? 'All Branches' : opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Active Containers card */}
            <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 flex flex-col overflow-hidden flex-1 min-h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-black text-base">Active Containers</h2>
                {containers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedContainers.length === containers.length) {
                        setSelectedContainers([]);
                      } else {
                        setSelectedContainers([...containers]);
                      }
                    }}
                    className="text-xs font-medium text-[#6b1176] hover:text-[#8a2a95] transition-colors px-2 py-1 rounded hover:bg-[#F7ECFF]"
                  >
                    {selectedContainers.length === containers.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[1fr_40px] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-2 items-center">
                <div className="text-left">Containers #</div>
                <div className="flex justify-center" />
              </div>
              <div
                className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100"
                style={{ scrollbarWidth: 'thin' }}
              >
                {containersLoading && (
                  <div className="flex-1 flex flex-col min-h-[280px] divide-y divide-gray-100">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_40px] pl-2 pr-2 py-2 items-center gap-2"
                      >
                        <div className="min-w-0 overflow-hidden space-y-2">
                          <div className="relative overflow-hidden h-3.5 w-24 rounded-md bg-gray-200">
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                              style={{ width: '50%', animationDelay: `${i * 0.08}s` }}
                            />
                          </div>
                          <div className="relative overflow-hidden h-3 w-20 rounded-md bg-gray-100">
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                              style={{ width: '50%', animationDelay: `${i * 0.08 + 0.05}s` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <div className="relative overflow-hidden w-4 h-4 rounded border border-gray-200 bg-gray-100">
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                              style={{ width: '50%', animationDelay: `${i * 0.08}s` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!containersLoading && containersError && (
                  <div className="p-4 text-xs text-red-600">{containersError}</div>
                )}
                {!containersLoading && !containersError && containers.length > 0 && containers.map((c) => {
                  const isSelected = selectedContainers.some((s) => s.tank_id === c.tank_id);
                  const toggleSelection = () => {
                    setSelectedContainers((prev) =>
                      isSelected ? prev.filter((s) => s.tank_id !== c.tank_id) : [...prev, c]
                    );
                  };
                  return (
                    <div
                      key={`${c.branch_id}-${c.tank_id}-${c.canisterId}`}
                      onClick={toggleSelection}
                      className={`grid grid-cols-[1fr_40px] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-2 cursor-pointer ${
                        isSelected ? 'bg-[#F7ECFF]' : ''
                      }`}
                    >
                      <div className="min-w-0 text-left overflow-hidden">
                        <span className="text-[#6b1176] text-xs font-bold block truncate">
                          Container {c.canisterId}
                        </span>
                        {c.branchName && c.branchName !== 'N/A' && (
                          <div className="text-xs text-gray-900 leading-snug truncate">{c.branchName}</div>
                        )}
                      </div>
                      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={toggleSelection}
                          className="w-4 h-4 rounded border-gray-300 text-[#6b1176] focus:ring-[#6b1176] cursor-pointer"
                          aria-label={`Select container ${c.canisterId}`}
                        />
                      </div>
                    </div>
                  );
                })}
                {!containersLoading && !containersError && containers.length === 0 && (
                  <div className="p-4 text-xs text-gray-500">No active containers found.</div>
                )}
              </div>
            </div>
          </div>

          {/* Right: KPI config cards */}
          <section className="flex-1 flex flex-col bg-white rounded-lg border border-[#E7E1E1] p-4 min-w-0 overflow-hidden">
            <h2 className="font-bold text-black text-base mb-4">
              Alert Configuration {selectedContainers.length > 1 ? `- ${selectedContainers.length} Containers Selected` : primaryContainer ? `- Container ${primaryContainer.canisterId}` : ''}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {selectedContainers.length > 1 
                ? 'Configure alert thresholds to apply to all selected containers. Enter values and save to apply the same configuration to the selected containers.'
                : configList.length === 0 && !configLoading
                  ? 'Selecting a tank will allow you to create alert configurations for various KPIs. Start by adding a new alert and setting thresholds to receive notifications when conditions are met.'
                  : 'Configure alert thresholds for the selected container. Set minimum and maximum values to receive notifications when conditions are met.'
              }
            </p>
            {!primaryContainer ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                    <rect x="9" y="3" width="6" height="4" rx="1" />
                    <path d="M9 12h6M9 16h6" strokeLinecap="round" />
                  </svg>
                  <p className="text-md">Select one or more containers to configure alerts</p>
                </div>
              </div>
            ) : (
              <>
                {configError && (
                  <div className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded">{configError}</div>
                )}
                {configLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <Loader2 className="animate-spin w-8 h-8 text-[#6b1176] mx-auto mb-2" />
                      <p className="text-sm">Loading configuration...</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div
                      className="flex-1 overflow-y-auto space-y-3 pr-1"
                      style={{ scrollbarWidth: 'thin' }}
                    >
                      {/* Multi-container mode OR single container with no config: show all KPI types with empty values */}
                      {selectedContainers.length > 1 || configList.length === 0 ? (
                        ALL_KPI_NAMES.map((kpiName) => {
                          const d = getMultiDraft(kpiName);
                          const minVal = d.min ?? null;
                          const maxVal = d.max ?? null;
                          const typeVal = d.alert_type ?? null;
                          const lidStateVal = d.lid_state ?? '';
                          const metadata = getKpiMetadata(kpiName);
                          const inputType = getKpiInputType(kpiName);
                          const kpiKey = `multi-${kpiName}`;
                          const refs = getInputRefs(kpiKey);
                          
                          // Determine if alert type should be enabled based on KPI type
                          const canEnableAlert = isAlertTypeEnabled(kpiName, minVal, maxVal, lidStateVal);
                          
                          // Validation
                          const validation = getKpiValidation(kpiName, minVal, maxVal);
                          
                          const isAlertEnabled = !!(typeVal && typeVal !== '');
                          const isCritical = typeVal === 'critical';
                          
                          // Check if any value is set (for showing clear button)
                          const hasAnyValue = minVal !== null || maxVal !== null || typeVal !== null || lidStateVal !== '';

                          return (
                            <div
                              key={kpiName}
                              className={`relative rounded-xl border-2 p-5 transition-all duration-200 ${
                                isAlertEnabled
                                  ? isCritical
                                    ? 'border-red-200 bg-gradient-to-r from-red-50/50 to-white'
                                    : 'border-[#E7D4F0] bg-gradient-to-r from-[#F7ECFF]/50 to-white'
                                  : 'border-gray-200 bg-gray-50/30'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center p-1 transform ${
                                    isAlertEnabled
                                      ? isCritical
                                        ? 'bg-red-100 text-red-500'
                                        : 'bg-[#F2E4FF] text-[#6b1176]'
                                      : 'bg-[#F2E4FF] text-[#6b1176]'
                                  }`}
                                >
                                  {metadata.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <h3 className={`font-semibold text-sm ${isAlertEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                        {metadata.label}
                                      </h3>
                                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                        {metadata.description}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                                        <Minus size={10} />
                                        Unset
                                      </div>
                                      {isAlertEnabled ? (
                                        <div className={`w-auto pl-1.5 pr-1.5 h-6 rounded-lg flex items-center justify-center ${
                                          isCritical ? 'bg-red-100' : 'bg-[#F2E4FF]'
                                        }`}>
                                          {isCritical ? <Mail size={16} className="text-red-500" /> : <Bell size={16} className="text-[#6b1176]" />}
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
                                      {/* Clear button */}
                                      {hasAnyValue && (
                                        <button
                                          type="button"
                                          onClick={() => clearMultiDraft(kpiName)}
                                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
                                          title="Clear configuration"
                                        >
                                          <X size={18} className="text-gray-500" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Validation error */}
                                  {!validation.valid && (
                                    <p className="text-xs text-red-500 mt-1">{validation.error}</p>
                                  )}
                                  
                                  <div className="flex items-center gap-3 mt-4">
                                    {/* Lid State - special select input */}
                                    {inputType === 'lid_state' ? (
                                      <div className="flex items-center gap-2">
                                        <div className="relative w-48">
                                          <button
                                            type="button"
                                            className="dropdown-button w-full px-3 h-10 border border-gray-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white text-gray-900"
                                            onClick={() => setOpenDropdowns(prev => ({ ...prev, [`multi-lid-${kpiName}`]: !prev[`multi-lid-${kpiName}`] }))}
                                          >
                                            <span>
                                              {LID_STATE_OPTIONS.find(opt => opt.value === lidStateVal)?.label || 'Select'}
                                            </span>
                                            <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[`multi-lid-${kpiName}`] ? 'rotate-180' : ''}`} />
                                          </button>
                                          {openDropdowns[`multi-lid-${kpiName}`] && (
                                            <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                              {LID_STATE_OPTIONS.map((opt) => (
                                                <button
                                                  key={opt.value}
                                                  type="button"
                                                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                    opt.value === lidStateVal ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
                                                  }`}
                                                  onClick={() => {
                                                    setMultiDraft(kpiName, { lid_state: opt.value });
                                                    setOpenDropdowns(prev => ({ ...prev, [`multi-lid-${kpiName}`]: false }));
                                                  }}
                                                >
                                                  {opt.label}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : inputType === 'battery' ? (
                                      /* Battery - only min input, max is always 100 */
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">Alert below</span>
                                        <input
                                          ref={(el) => { refs.min = el; }}
                                          type="number"
                                          step="any"
                                          min={0}
                                          max={100}
                                          value={minVal != null ? minVal : ''}
                                          onChange={(e) => {
                                            let v = e.target.value === '' ? null : Number(e.target.value);
                                            if (v !== null && v < 0) v = 0;
                                            if (v !== null && v > 100) v = 100;
                                            setMultiDraft(kpiName, { min: v });
                                          }}
                                          onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                          placeholder="Min"
                                          className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                        />
                                        {metadata.unit && (
                                          <span className="text-xs text-gray-400">{metadata.unit}</span>
                                        )}
                                      </div>
                                    ) : kpiName === KPI_NAMES.IVF_LN2_LEVEL ? (
                                      /* LN2 - single threshold like battery */
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">Alert below</span>
                                        <input
                                          ref={(el) => { refs.min = el; }}
                                          type="number"
                                          step="any"
                                          min={0}
                                          max={100}
                                          value={minVal != null ? minVal : ''}
                                          onChange={(e) => {
                                            let v = e.target.value === '' ? null : Number(e.target.value);
                                            if (v !== null && v < 0) v = 0;
                                            if (v !== null && v > 100) v = 100;
                                            setMultiDraft(kpiName, { min: v, max: null });
                                          }}
                                          onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                          placeholder="Min"
                                          className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                        />
                                        {metadata.unit && (
                                          <span className="text-xs text-gray-400">{metadata.unit}</span>
                                        )}
                                      </div>
                                    ) : (
                                      /* Standard/Temperature/Percentage inputs */
                                      <>
                                        <div className="flex items-center gap-2">
                                          <input
                                            ref={(el) => { refs.min = el; }}
                                            type="number"
                                            step="any"
                                            min={inputType === 'percentage' ? 0 : undefined}
                                            value={minVal != null ? minVal : ''}
                                            onChange={(e) => {
                                              let v = e.target.value === '' ? null : Number(e.target.value);
                                              if (inputType === 'percentage' && v !== null && v < 0) v = 0;
                                              setMultiDraft(kpiName, { min: v });
                                            }}
                                            onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                            placeholder="Min"
                                            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                          />
                                          {metadata.unit && (
                                            <span className="text-xs text-gray-400">{metadata.unit}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            ref={(el) => { refs.max = el; }}
                                            type="number"
                                            step="any"
                                            min={inputType === 'percentage' ? 0 : undefined}
                                            value={maxVal != null ? maxVal : ''}
                                            onChange={(e) => {
                                              let v = e.target.value === '' ? null : Number(e.target.value);
                                              if (inputType === 'percentage' && v !== null && v < 0) v = 0;
                                              setMultiDraft(kpiName, { max: v });
                                            }}
                                            onKeyDown={(e) => handleKeyDown(e, kpiKey, 'max')}
                                            placeholder="Max"
                                            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                          />
                                          {metadata.unit && (
                                            <span className="text-xs text-gray-400">{metadata.unit}</span>
                                          )}
                                        </div>
                                      </>
                                    )}
                                    <div className="relative flex-1 min-w-[140px]">
                                      <button
                                        type="button"
                                        className={`dropdown-button w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white ${
                                          !canEnableAlert
                                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : isAlertEnabled
                                              ? isCritical
                                                ? 'border-red-200 bg-red-50 text-red-700'
                                                : 'border-[#E7D4F0] bg-[#F7ECFF] text-[#6b1176]'
                                              : 'border-gray-200 bg-white text-gray-500'
                                        }`}
                                        disabled={!canEnableAlert}
                                        onClick={() => setOpenDropdowns(prev => ({ ...prev, [`multi-${kpiName}`]: !prev[`multi-${kpiName}`] }))}
                                      >
                                        <span>
                                          {typeVal ? alertTypeOptions.find(opt => opt.value === typeVal)?.label || 'No Alert' : 'No Alert'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[`multi-${kpiName}`] ? 'rotate-180' : ''}`} />
                                      </button>
                                      {openDropdowns[`multi-${kpiName}`] && (
                                        <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                          {alertTypeOptions.map((opt) => (
                                            <button
                                              key={opt.label}
                                              type="button"
                                              className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                opt.value === typeVal ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
                                              }`}
                                              onClick={() => {
                                                const v = opt.value === '' ? null : opt.value;
                                                setMultiDraft(kpiName, { alert_type: v });
                                                setOpenDropdowns(prev => ({ ...prev, [`multi-${kpiName}`]: false }));
                                              }}
                                            >
                                              {opt.label}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        /* Single container mode: show existing config + missing KPI templates as unset */
                        <>
                        {configList.map((r) => {
                          const d = getDraft(r.id);
                          const minVal = d.min !== undefined ? d.min : r.min;
                          const maxVal = d.max !== undefined ? d.max : r.max;
                          const typeVal = d.alert_type !== undefined ? d.alert_type : r.alert_type;
                          const metadata = getKpiMetadata(r.kpi_name);
                          const displayLabel = r.alert_name?.trim() ? r.alert_name : metadata.label;
                          const inputType = getKpiInputType(r.kpi_name);
                          const kpiKey = `single-${r.id}`;
                          const refs = getInputRefs(kpiKey);
                          
                          // For lid_state, calculate the state from min/max values
                          const lidStateVal = d.lid_state !== undefined ? d.lid_state : valuesToLidState(r.min, r.max);
                          
                          // Determine if alert type should be enabled based on KPI type
                          const canEnableAlert = isAlertTypeEnabled(r.kpi_name, minVal, maxVal, lidStateVal);
                          
                          // Validation
                          const validation = getKpiValidation(r.kpi_name, minVal, maxVal);
                          
                          const isAlertEnabled = typeVal && typeVal !== '';
                          const isCritical = typeVal === 'critical';

                          return (
                            <div
                              key={r.id}
                              className={`relative rounded-xl border-2 p-5 transition-all duration-200 ${
                                isAlertEnabled
                                  ? isCritical
                                    ? 'border-red-200 bg-gradient-to-r from-red-50/50 to-white'
                                    : 'border-[#E7D4F0] bg-gradient-to-r from-[#F7ECFF]/50 to-white'
                                  : 'border-gray-200 bg-gray-50/30'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                {/* Icon */}
                                <div
                                  className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center p-1 transform ${
                                    isAlertEnabled
                                      ? isCritical
                                        ? 'bg-red-100 text-red-500'
                                        : 'bg-[#F2E4FF] text-[#6b1176]'
                                      : 'bg-[#F2E4FF] text-[#6b1176]'
                                  }`}
                                >
                                    {metadata.icon}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <h3 className={`font-semibold text-sm ${isAlertEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                        {r.kpi_name === KPI_NAMES.IVF_LN2_LEVEL ? 'LN2' : displayLabel}
                                      </h3>
                                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                        {metadata.description}
                                      </p>
                                    </div>

                                    {/* Alert Toggle Icon + Clear Button */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {isAlertEnabled ? (
                                        <div className={`w-auto pl-1.5 pr-1.5 h-6 rounded-lg flex items-center justify-center ${
                                          isCritical ? 'bg-red-100' : 'bg-[#F2E4FF]'
                                        }`}>
                                          {isCritical ? <Mail size={16} className="text-red-500" /> : <Bell size={16} className="text-[#6b1176]" />}
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
                                      {/* Clear button */}
                                      <button
                                        type="button"
                                        onClick={() => clearDraft(r.id)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
                                        title="Clear configuration"
                                      >
                                        <X size={18} className="text-gray-500" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Validation error */}
                                  {!validation.valid && (
                                    <p className="text-xs text-red-500 mt-1">{validation.error}</p>
                                  )}

                                  {/* Inputs Row */}
                                  <div className="flex items-center gap-3 mt-4">
                                    {/* Lid State - special select input */}
                                    {inputType === 'lid_state' ? (
                                      <div className="flex items-center gap-2">
                                        <div className="relative w-48">
                                          <button
                                            type="button"
                                            className="dropdown-button w-full px-3 h-12 border border-gray-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white text-gray-900"
                                            onClick={() => setOpenDropdowns(prev => ({ ...prev, [`single-lid-${r.id}`]: !prev[`single-lid-${r.id}`] }))}
                                          >
                                            <span>
                                              {LID_STATE_OPTIONS.find(opt => opt.value === lidStateVal)?.label || 'Select'}
                                            </span>
                                            <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[`single-lid-${r.id}`] ? 'rotate-180' : ''}`} />
                                          </button>
                                          {openDropdowns[`single-lid-${r.id}`] && (
                                            <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                              {LID_STATE_OPTIONS.map((opt) => (
                                                <button
                                                  key={opt.value}
                                                  type="button"
                                                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                    opt.value === lidStateVal ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
                                                  }`}
                                                  onClick={() => {
                                                    setDraft(r.id, { lid_state: opt.value });
                                                    setOpenDropdowns(prev => ({ ...prev, [`single-lid-${r.id}`]: false }));
                                                  }}
                                                >
                                                  {opt.label}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : inputType === 'battery' || r.kpi_name === KPI_NAMES.IVF_LN2_LEVEL ? (
                                      /* Battery - only min input, max is always 100 */
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">Alert below</span>
                                        <input
                                          ref={(el) => { refs.min = el; }}
                                          type="number"
                                          step="any"
                                          min={0}
                                          max={100}
                                          value={minVal != null ? minVal : ''}
                                          onChange={(e) => {
                                            let v = e.target.value === '' ? null : Number(e.target.value);
                                            if (v !== null && v < 0) v = 0;
                                            if (v !== null && v > 100) v = 100;
                                            setDraft(r.id, { min: v, ...(r.kpi_name === KPI_NAMES.IVF_LN2_LEVEL ? { max: null } : {}) });
                                          }}
                                          onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                          placeholder="Min"
                                          className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                        />
                                        {metadata.unit && (
                                          <span className="text-xs text-gray-400">{metadata.unit}</span>
                                        )}
                                      </div>
                                    ) : (
                                      /* Standard/Temperature/Percentage inputs */
                                      <>
                                        <div className="flex items-center gap-2">
                                          <input
                                            ref={(el) => { refs.min = el; }}
                                            type="number"
                                            step="any"
                                            min={inputType === 'percentage' ? 0 : undefined}
                                            value={minVal != null ? minVal : ''}
                                            onChange={(e) => {
                                              let v = e.target.value === '' ? null : Number(e.target.value);
                                              if (inputType === 'percentage' && v !== null && v < 0) v = 0;
                                              setDraft(r.id, { min: v });
                                            }}
                                            onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                            placeholder="Min"
                                            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                          />
                                          {metadata.unit && (
                                            <span className="text-xs text-gray-400">{metadata.unit}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            ref={(el) => { refs.max = el; }}
                                            type="number"
                                            step="any"
                                            min={inputType === 'percentage' ? 0 : undefined}
                                            value={maxVal != null ? maxVal : ''}
                                            onChange={(e) => {
                                              let v = e.target.value === '' ? null : Number(e.target.value);
                                              if (inputType === 'percentage' && v !== null && v < 0) v = 0;
                                              setDraft(r.id, { max: v });
                                            }}
                                            onKeyDown={(e) => handleKeyDown(e, kpiKey, 'max')}
                                            placeholder="Max"
                                            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                          />
                                          {metadata.unit && (
                                            <span className="text-xs text-gray-400">{metadata.unit}</span>
                                          )}
                                        </div>
                                      </>
                                    )}

                                    {/* Alert Type Select */}
                                    <div className="relative flex-1 min-w-[140px]">
                                      <button
                                        type="button"
                                        className={`dropdown-button w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white ${
                                          !canEnableAlert
                                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : isAlertEnabled
                                              ? isCritical
                                                ? 'border-red-200 bg-red-50 text-red-700'
                                                : 'border-[#E7D4F0] bg-[#F7ECFF] text-[#6b1176]'
                                              : 'border-gray-200 bg-white text-gray-500'
                                        }`}
                                        disabled={!canEnableAlert}
                                        onClick={() => setOpenDropdowns(prev => ({ ...prev, [`single-${r.id}`]: !prev[`single-${r.id}`] }))}
                                      >
                                        <span>
                                          {typeVal ? alertTypeOptions.find(opt => opt.value === typeVal)?.label || 'No Alert' : 'No Alert'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[`single-${r.id}`] ? 'rotate-180' : ''}`} />
                                      </button>
                                      {openDropdowns[`single-${r.id}`] && (
                                        <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                          {alertTypeOptions.map((opt) => (
                                            <button
                                              key={opt.label}
                                              type="button"
                                              className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                                opt.value === typeVal ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
                                              }`}
                                              onClick={() => {
                                                const v = opt.value === '' ? null : opt.value;
                                                setDraft(r.id, { alert_type: v });
                                                setOpenDropdowns(prev => ({ ...prev, [`single-${r.id}`]: false }));
                                              }}
                                            >
                                              {opt.label}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {missingKpiNames.map((kpiName) => {
                          const d = getMultiDraft(kpiName);
                          const minVal = d.min ?? null;
                          const maxVal = d.max ?? null;
                          const typeVal = d.alert_type ?? null;
                          const lidStateVal = d.lid_state ?? '';
                          const metadata = getKpiMetadata(kpiName);
                          const inputType = getKpiInputType(kpiName);
                          const kpiKey = `single-missing-${kpiName}`;
                          const refs = getInputRefs(kpiKey);
                          const canEnableAlert = isAlertTypeEnabled(kpiName, minVal, maxVal, lidStateVal);

                          return (
                            <div key={`missing-${kpiName}`} className="relative rounded-xl border-2 border-gray-200 bg-gray-50/30 p-5 transition-all duration-200">
                              <div className="flex items-center gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center p-1 bg-[#F2E4FF] text-[#6b1176]">
                                  {metadata.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <h3 className="font-semibold text-sm text-gray-500">
                                        {kpiName === KPI_NAMES.IVF_LN2_LEVEL ? 'LN2' : metadata.label}
                                      </h3>
                                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{metadata.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 relative">
                                        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M12 2C10.9 2 10 2.9 10 4V5.29C7.12 6.14 5 8.82 5 12V17L3 19V20H21V19L19 17V12C19 8.82 16.88 6.14 14 5.29V4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="w-7 h-0.5 bg-red-400 transform rotate-45 rounded"></div>
                                        </div>
                                      </div>
                                      <div className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                                        <Minus size={10} />
                                        Unset
                                      </div>
                                      {(minVal !== null || maxVal !== null || typeVal !== null || lidStateVal !== '') && (
                                        <button
                                          type="button"
                                          onClick={() => clearMultiDraft(kpiName)}
                                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
                                          title="Clear configuration"
                                        >
                                          <X size={18} className="text-gray-500" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-4">
                                {inputType === 'lid_state' ? (
                                  <div className="relative w-48">
                                    <button
                                      type="button"
                                      className="dropdown-button w-full px-3 h-12 border border-gray-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white text-gray-900"
                                      onClick={() => setOpenDropdowns(prev => ({ ...prev, [`single-missing-lid-${kpiName}`]: !prev[`single-missing-lid-${kpiName}`] }))}
                                    >
                                      <span>
                                        {LID_STATE_OPTIONS.find(opt => opt.value === lidStateVal)?.label || 'Select'}
                                      </span>
                                      <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[`single-missing-lid-${kpiName}`] ? 'rotate-180' : ''}`} />
                                    </button>
                                    {openDropdowns[`single-missing-lid-${kpiName}`] && (
                                      <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                        {LID_STATE_OPTIONS.map((opt) => (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                              opt.value === lidStateVal ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                            onClick={() => {
                                              setMultiDraft(kpiName, { lid_state: opt.value });
                                              setOpenDropdowns(prev => ({ ...prev, [`single-missing-lid-${kpiName}`]: false }));
                                            }}
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : inputType === 'battery' || kpiName === KPI_NAMES.IVF_LN2_LEVEL ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">Alert below</span>
                                    <input
                                      ref={(el) => { refs.min = el; }}
                                      type="number"
                                      step="any"
                                      min={0}
                                      max={100}
                                      value={minVal != null ? minVal : ''}
                                      onChange={(e) => {
                                        let v = e.target.value === '' ? null : Number(e.target.value);
                                        if (v !== null && v < 0) v = 0;
                                        if (v !== null && v > 100) v = 100;
                                        setMultiDraft(kpiName, { min: v, ...(kpiName === KPI_NAMES.IVF_LN2_LEVEL ? { max: null } : {}) });
                                      }}
                                      onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                      placeholder="Min"
                                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                    />
                                    {metadata.unit && <span className="text-xs text-gray-400">{metadata.unit}</span>}
                                  </div>
                                ) : (
                                  <>
                                    <input
                                      ref={(el) => { refs.min = el; }}
                                      type="number"
                                      step="any"
                                      min={inputType === 'percentage' ? 0 : undefined}
                                      value={minVal != null ? minVal : ''}
                                      onChange={(e) => {
                                        let v = e.target.value === '' ? null : Number(e.target.value);
                                        if (inputType === 'percentage' && v !== null && v < 0) v = 0;
                                        setMultiDraft(kpiName, { min: v });
                                      }}
                                      onKeyDown={(e) => handleKeyDown(e, kpiKey, 'min')}
                                      placeholder="Min"
                                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                    />
                                    <input
                                      ref={(el) => { refs.max = el; }}
                                      type="number"
                                      step="any"
                                      min={inputType === 'percentage' ? 0 : undefined}
                                      value={maxVal != null ? maxVal : ''}
                                      onChange={(e) => {
                                        let v = e.target.value === '' ? null : Number(e.target.value);
                                        if (inputType === 'percentage' && v !== null && v < 0) v = 0;
                                        setMultiDraft(kpiName, { max: v });
                                      }}
                                      onKeyDown={(e) => handleKeyDown(e, kpiKey, 'max')}
                                      placeholder="Max"
                                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                    />
                                    {metadata.unit && <span className="text-xs text-gray-400">{metadata.unit}</span>}
                                  </>
                                )}
                                <div className="relative flex-1 min-w-[140px]">
                                  <button
                                    type="button"
                                    className={`dropdown-button w-full px-3 h-12 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white ${
                                      !canEnableAlert
                                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'border-gray-200 bg-white text-gray-700'
                                    }`}
                                    disabled={!canEnableAlert}
                                    onClick={() => setOpenDropdowns(prev => ({ ...prev, [`single-missing-${kpiName}`]: !prev[`single-missing-${kpiName}`] }))}
                                  >
                                    <span>
                                      {typeVal ? alertTypeOptions.find(opt => opt.value === typeVal)?.label || 'No Alert' : 'No Alert'}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 transition-transform ${openDropdowns[`single-missing-${kpiName}`] ? 'rotate-180' : ''}`} />
                                  </button>
                                  {openDropdowns[`single-missing-${kpiName}`] && (
                                    <div className="dropdown-menu absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                                      {alertTypeOptions.map((opt) => (
                                        <button
                                          key={opt.label}
                                          type="button"
                                          className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                            opt.value === typeVal ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
                                          }`}
                                          onClick={() => {
                                            const v = opt.value === '' ? null : opt.value;
                                            setMultiDraft(kpiName, { alert_type: v });
                                            setOpenDropdowns(prev => ({ ...prev, [`single-missing-${kpiName}`]: false }));
                                          }}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        </>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 shrink-0 flex justify-end">
                      {!(saveAllLoading || !hasPendingChanges) && <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={
                          saveAllLoading || !hasPendingChanges
                        }
                        className="px-6 py-2.5 bg-[#6b1176] text-white rounded-lg text-sm font-medium hover:bg-[#8a2a95] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                      </button>}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
          </div>
        </div>
      </main>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeForm}>
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-4">{editingId != null ? 'Edit KPI Config' : 'Add KPI Config'}</h3>
            {formError && <p className="text-red-600 text-sm mb-2">{formError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">KPI Name *</label>
                <input
                  value={formPayload.kpi_name ?? ''}
                  onChange={(e) => setFormPayload((p) => ({ ...p, kpi_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="e.g. ln2_level"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Alert Name</label>
                <input
                  value={formPayload.alert_name ?? ''}
                  onChange={(e) => setFormPayload((p) => ({ ...p, alert_name: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="e.g. l1, low"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Min</label>
                  <input
                    type="number"
                    step="any"
                    value={formPayload.min ?? ''}
                    onChange={(e) =>
                      setFormPayload((p) => ({ ...p, min: e.target.value === '' ? null : Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Max</label>
                  <input
                    type="number"
                    step="any"
                    value={formPayload.max ?? ''}
                    onChange={(e) =>
                      setFormPayload((p) => ({ ...p, max: e.target.value === '' ? null : Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Unit</label>
                <input
                  value={formPayload.unit ?? ''}
                  onChange={(e) => setFormPayload((p) => ({ ...p, unit: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="e.g. %, °C"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Alert Type</label>
                <input
                  value={formPayload.alert_type ?? ''}
                  onChange={(e) => setFormPayload((p) => ({ ...p, alert_type: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="e.g. soft, critical"
                />
              </div>
              {editingId != null && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="form-status"
                    checked={formPayload.status ?? true}
                    onChange={(e) => setFormPayload((p) => ({ ...p, status: e.target.checked }))}
                  />
                  <label htmlFor="form-status">Active</label>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={closeForm} className="px-4 py-2 border rounded text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={editingId != null ? handleUpdate : handleCreate}
                disabled={submitLoading}
                className="px-4 py-2 bg-[#9C3AA6] text-white rounded hover:opacity-90 text-sm disabled:opacity-50"
              >
                {submitLoading ? 'Saving...' : editingId != null ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-transparent backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this KPI config row? This action cannot be undone.
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
                {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
