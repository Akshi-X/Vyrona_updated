import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { ivfService, type IvfBranch, type KpiConfigRow, type KpiConfigPayload } from '../../services/ivfService';
import { shipmentService } from '../../services/shipmentService';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import ThermostatAutoIcon from '@mui/icons-material/ThermostatAuto';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BoltIcon from '@mui/icons-material/Bolt';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import SensorDoorIcon from '@mui/icons-material/SensorDoor';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

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
    icon: <DeviceThermostatIcon sx={{ fontSize: 24 }} />,
    unit: '°C',
  },
  [KPI_NAMES.IVF_TEMPERATURE_EXTERNAL]: {
    label: 'External Temperature',
    description: 'Track ambient temperature around the storage container',
    icon: <ThermostatAutoIcon sx={{ fontSize: 24 }} />,
    unit: '°C',
  },
  [KPI_NAMES.IVF_LN2_LEVEL]: {
    label: 'LN2 Level',
    description: 'Liquid nitrogen level monitoring for cryogenic safety',
    icon: <WaterDropIcon sx={{ fontSize: 24 }} />,
    unit: '%',
  },
  [KPI_NAMES.IVF_LN2_EVAPORATION_RATE]: {
    label: 'Evaporation Rate',
    description: 'Track LN2 evaporation rate to predict refill schedules',
    icon: <TrendingUpIcon sx={{ fontSize: 24 }} />,
    unit: '%/day',
  },
  [KPI_NAMES.IVF_SHOCK]: {
    label: 'Shock Detection',
    description: 'Alert for physical impacts or sudden movements',
    icon: <BoltIcon sx={{ fontSize: 24 }} />,
    unit: 'g',
  },
  [KPI_NAMES.IVF_TIVE_BATTERY_PERCENTAGE]: {
    label: 'Battery Level',
    description: 'Monitor device battery to ensure continuous tracking',
    icon: <BatteryChargingFullIcon sx={{ fontSize: 24 }} />,
    unit: '%',
  },
  [KPI_NAMES.IVF_LN2_LID_STATE]: {
    label: 'Lid State',
    description: 'Monitor container lid open/close status for security',
    icon: <SensorDoorIcon sx={{ fontSize: 24 }} />,
  },
};

// Default metadata for unknown KPIs
const DEFAULT_KPI_METADATA: KpiMetadata = {
  label: 'Custom Alert',
  description: 'Custom monitoring parameter',
  icon: <InfoOutlinedIcon sx={{ fontSize: 24 }} />,
};

// Helper to get KPI metadata
const getKpiMetadata = (kpiName: string): KpiMetadata => {
  return KPI_METADATA[kpiName] || DEFAULT_KPI_METADATA;
};

// All KPI names as an array for multi-container selection
const ALL_KPI_NAMES = Object.values(KPI_NAMES);

export default function AlertSetting() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [branches, setBranches] = useState<IvfBranch[]>([]);
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
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

  /** Inline edit draft for KPI table: min, max, alert_type per config id */
  const [draftConfig, setDraftConfig] = useState<Record<number, { min?: number | null; max?: number | null; alert_type?: string | null }>>({});
  /** Multi-container draft: keyed by kpi_name instead of id */
  const [multiDraftConfig, setMultiDraftConfig] = useState<Record<string, { min?: number | null; max?: number | null; alert_type?: string | null }>>({});
  const [saveAllLoading, setSaveAllLoading] = useState(false);

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
  }, [primaryContainer?.tank_id]);

  const branchOptions = useMemo(() => ['All', ...branches.map((b) => b.branch_name)], [branches]);

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
  const setDraft = (id: number, patch: { min?: number | null; max?: number | null; alert_type?: string | null }) => {
    setDraftConfig((prev) => {
      const next = { ...prev };
      const current = next[id] ?? {};
      const merged = { ...current, ...patch };
      if (Object.keys(merged).length === 0) delete next[id];
      else next[id] = merged;
      return next;
    });
  };

  // Multi-container draft helpers (keyed by kpi_name)
  const getMultiDraft = (kpiName: string) => multiDraftConfig[kpiName] ?? {};
  const setMultiDraft = (kpiName: string, patch: { min?: number | null; max?: number | null; alert_type?: string | null }) => {
    setMultiDraftConfig((prev) => {
      const next = { ...prev };
      const current = next[kpiName] ?? {};
      const merged = { ...current, ...patch };
      if (Object.keys(merged).length === 0) delete next[kpiName];
      else next[kpiName] = merged;
      return next;
    });
  };

  const handleSaveAll = async () => {
    const useMultiFlow = selectedContainers.length > 1 || configList.length === 0;
    if (useMultiFlow) {
      // For multi-container OR single container with no existing config: use multiDraftConfig to build configs for all KPIs that have values
      const configsToApply = ALL_KPI_NAMES
        .map((kpiName) => {
          const d = getMultiDraft(kpiName);
          const metadata = getKpiMetadata(kpiName);
          // Only include if at least one value is set
          if (d.min !== undefined || d.max !== undefined || d.alert_type !== undefined) {
            return {
              kpi_name: kpiName,
              alert_name: metadata.label,
              min: d.min ?? null,
              max: d.max ?? null,
              unit: metadata.unit ?? null,
              alert_type: d.alert_type ?? null,
            };
          }
          return null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

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
    if (ids.length === 0) return;
    setSaveAllLoading(true);
    try {
      for (const id of ids) {
        const d = draftConfig[id];
        if (!d) continue;
        await ivfService.updateKpiConfig(id, {
          min: d.min !== undefined ? d.min : undefined,
          max: d.max !== undefined ? d.max : undefined,
          alert_type: d.alert_type !== undefined ? d.alert_type : undefined,
        });
      }
      setDraftConfig({});
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
                  <div className="p-4 text-xs text-gray-500">Loading...</div>
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
              Alert Configuration {selectedContainers.length > 1 ? `— ${selectedContainers.length} Containers Selected` : primaryContainer ? `— Container ${primaryContainer.canisterId}` : ''}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {selectedContainers.length > 1 
                ? 'Configure alert thresholds to apply to all selected containers. Enter values and save to apply the same configuration to all.'
                : configList.length === 0 && !configLoading
                  ? 'This container has no configuration yet. Setting the values below will add the configuration.'
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
                  <p className="text-sm">Select one or more containers to configure alerts</p>
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
                      <div className="animate-spin w-8 h-8 border-2 border-[#6b1176] border-t-transparent rounded-full mx-auto mb-2"></div>
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
                          const metadata = getKpiMetadata(kpiName);
                          const isAlertEnabled = typeVal && typeVal !== '';
                          const isCritical = typeVal === 'critical';

                          return (
                            <div
                              key={kpiName}
                              className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
                                isAlertEnabled
                                  ? isCritical
                                    ? 'border-red-200 bg-gradient-to-r from-red-50/50 to-white'
                                    : 'border-[#E7D4F0] bg-gradient-to-r from-[#F7ECFF]/50 to-white'
                                  : 'border-gray-200 bg-gray-50/30'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transform ${
                                    isAlertEnabled
                                      ? isCritical
                                        ? 'bg-red-100 text-red-600'
                                        : 'bg-[#F2E4FF] text-[#6b1176]'
                                      : 'bg-gray-200 text-gray-400'
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
                                    <div className="flex-shrink-0">
                                      {isAlertEnabled ? (
                                        <div className={`w-auto pl-2 h-8 rounded-lg flex items-center justify-center ${
                                          isCritical ? 'bg-red-100' : 'bg-[#F2E4FF]'
                                        }`}>
                                          <svg
                                            className={`w-5 h-5 ${isCritical ? 'text-red-600' : 'text-[#6b1176]'}`}
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                          >
                                            <path d="M12 2C10.9 2 10 2.9 10 4V5.29C7.12 6.14 5 8.82 5 12V17L3 19V20H21V19L19 17V12C19 8.82 16.88 6.14 14 5.29V4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" />
                                          </svg>
                                          <span className="mx-2 text-xs">
                                            {isCritical ? "Email Alert" : "Soft Alert"}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 relative">
                                          <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2C10.9 2 10 2.9 10 4V5.29C7.12 6.14 5 8.82 5 12V17L3 19V20H21V19L19 17V12C19 8.82 16.88 6.14 14 5.29V4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" />
                                          </svg>
                                          <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-7 h-0.5 bg-red-500 transform rotate-45 rounded"></div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 mt-3">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        step="any"
                                        value={minVal != null ? minVal : ''}
                                        onChange={(e) => {
                                          const v = e.target.value === '' ? null : Number(e.target.value);
                                          setMultiDraft(kpiName, { min: v });
                                        }}
                                        placeholder="Min"
                                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                      />
                                      {metadata.unit && (
                                        <span className="text-xs text-gray-400">{metadata.unit}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        step="any"
                                        value={maxVal != null ? maxVal : ''}
                                        onChange={(e) => {
                                          const v = e.target.value === '' ? null : Number(e.target.value);
                                          setMultiDraft(kpiName, { max: v });
                                        }}
                                        placeholder="Max"
                                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                      />
                                      {metadata.unit && (
                                        <span className="text-xs text-gray-400">{metadata.unit}</span>
                                      )}
                                    </div>
                                    <select
                                      value={typeVal ?? ''}
                                      onChange={(e) => {
                                        const v = e.target.value === '' ? null : e.target.value;
                                        setMultiDraft(kpiName, { alert_type: v });
                                      }}
                                      className={`flex-1 min-w-[140px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6b1176] focus:border-transparent ${
                                        isAlertEnabled
                                          ? isCritical
                                            ? 'border-red-200 bg-red-50 text-red-700'
                                            : 'border-[#E7D4F0] bg-[#F7ECFF] text-[#6b1176]'
                                          : 'border-gray-200 bg-white text-gray-500'
                                      }`}
                                    >
                                      {alertTypeOptions.map((opt) => (
                                        <option key={opt.label} value={opt.value ?? ''}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        /* Single container mode: show existing config */
                        configList.map((r) => {
                          const d = getDraft(r.id);
                          const minVal = d.min !== undefined ? d.min : r.min;
                          const maxVal = d.max !== undefined ? d.max : r.max;
                          const typeVal = d.alert_type !== undefined ? d.alert_type : r.alert_type;
                          const metadata = getKpiMetadata(r.kpi_name);
                          const displayLabel = r.alert_name?.trim() ? r.alert_name : metadata.label;
                          const isAlertEnabled = typeVal && typeVal !== '';
                          const isCritical = typeVal === 'critical';

                          return (
                            <div
                              key={r.id}
                              className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
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
                                  className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transform ${
                                    isAlertEnabled
                                      ? isCritical
                                        ? 'bg-red-100 text-red-600'
                                        : 'bg-[#F2E4FF] text-[#6b1176]'
                                      : 'bg-gray-200 text-gray-400'
                                  }`}
                                >
                                    {metadata.icon}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <h3 className={`font-semibold text-sm ${isAlertEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                        {displayLabel}
                                      </h3>
                                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                        {metadata.description}
                                      </p>
                                    </div>

                                    {/* Alert Toggle Icon */}
                                    <div className="flex-shrink-0">
                                      {isAlertEnabled ? (
                                        <div className={`w-auto pl-2 h-8 rounded-lg flex items-center justify-center ${
                                          isCritical ? 'bg-red-100' : 'bg-[#F2E4FF]'
                                        }`}>
                                          <svg
                                            className={`w-5 h-5 ${isCritical ? 'text-red-600' : 'text-[#6b1176]'}`}
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                          >
                                            <path d="M12 2C10.9 2 10 2.9 10 4V5.29C7.12 6.14 5 8.82 5 12V17L3 19V20H21V19L19 17V12C19 8.82 16.88 6.14 14 5.29V4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" />
                                          </svg>
                                          <span className="mx-2">
                                            {isCritical ? "Email Alert Enabled" : ""}
                                          </span> 
                                        </div>
                                      ) : (
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 relative">
                                          <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2C10.9 2 10 2.9 10 4V5.29C7.12 6.14 5 8.82 5 12V17L3 19V20H21V19L19 17V12C19 8.82 16.88 6.14 14 5.29V4C14 2.9 13.1 2 12 2ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z" />
                                          </svg>
                                          <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-7 h-0.5 bg-red-500 transform rotate-45 rounded"></div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Inputs Row */}
                                  <div className="flex items-center gap-3 mt-3">
                                    {/* Min Input */}
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        step="any"
                                        value={minVal != null ? minVal : ''}
                                        onChange={(e) => {
                                          const v = e.target.value === '' ? null : Number(e.target.value);
                                          setDraft(r.id, { min: v });
                                        }}
                                        placeholder="Min"
                                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                      />
                                      {metadata.unit && (
                                        <span className="text-xs text-gray-400">{metadata.unit}</span>
                                      )}
                                    </div>

                                    {/* Max Input */}
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        step="any"
                                        value={maxVal != null ? maxVal : ''}
                                        onChange={(e) => {
                                          const v = e.target.value === '' ? null : Number(e.target.value);
                                          setDraft(r.id, { max: v });
                                        }}
                                        placeholder="Max"
                                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                                      />
                                      {metadata.unit && (
                                        <span className="text-xs text-gray-400">{metadata.unit}</span>
                                      )}
                                    </div>

                                    {/* Alert Type Select */}
                                    <select
                                      value={typeVal ?? ''}
                                      onChange={(e) => {
                                        const v = e.target.value === '' ? null : e.target.value;
                                        setDraft(r.id, { alert_type: v });
                                      }}
                                      className={`flex-1 min-w-[140px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6b1176] focus:border-transparent ${
                                        isAlertEnabled
                                          ? isCritical
                                            ? 'border-red-200 bg-red-50 text-red-700'
                                            : 'border-[#E7D4F0] bg-[#F7ECFF] text-[#6b1176]'
                                          : 'border-gray-200 bg-white text-gray-500'
                                      }`}
                                    >
                                      {alertTypeOptions.map((opt) => (
                                        <option key={opt.label} value={opt.value ?? ''}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 shrink-0 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={
                          saveAllLoading ||
                          (selectedContainers.length > 1 || configList.length === 0
                            ? Object.keys(multiDraftConfig).length === 0
                            : Object.keys(draftConfig).length === 0)
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
                      </button>
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
