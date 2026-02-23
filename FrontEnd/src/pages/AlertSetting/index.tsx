import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { ivfService, type IvfBranch, type KpiConfigRow, type KpiConfigPayload } from '../../services/ivfService';
import { shipmentService } from '../../services/shipmentService';

interface ContainerRow {
  tank_id: number;
  canisterId: string;
  branchName: string;
  branch_id: number;
  status: string;
  date: string;
}

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

  const openCreate = () => {
    setEditingId(null);
    setFormPayload({
      kpi_name: '',
      alert_name: null,
      min: null,
      max: null,
      unit: null,
      alert_type: null,
      status: true,
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (row: KpiConfigRow) => {
    setEditingId(row.id);
    setFormPayload({
      kpi_name: row.kpi_name,
      alert_name: row.alert_name,
      min: row.min,
      max: row.max,
      unit: row.unit,
      alert_type: row.alert_type,
      status: row.status,
    });
    setFormError(null);
    setShowForm(true);
  };

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

  const openDeleteConfirm = (id: number) => {
    setConfigToDeleteId(id);
    setShowDeleteConfirm(true);
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

  const getDisplayName = (r: KpiConfigRow) => (r.alert_name && r.alert_name.trim() !== '' ? r.alert_name : r.kpi_name);

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

  const handleSaveAll = async () => {
    const multi = selectedContainers.length > 1;
    if (multi) {
      if (configList.length === 0) return;
      const tankIds = selectedContainers.map((c) => c.tank_id);
      const effectiveConfigs = configList.map((r) => {
        const d = getDraft(r.id);
        return {
          kpi_name: r.kpi_name,
          alert_name: r.alert_name ?? null,
          min: d.min !== undefined ? d.min : r.min,
          max: d.max !== undefined ? d.max : r.max,
          unit: r.unit ?? null,
          alert_type: d.alert_type !== undefined ? d.alert_type : r.alert_type,
        };
      });
      setSaveAllLoading(true);
      try {
        await ivfService.bulkUpsertKpiConfig(tankIds, effectiveConfigs);
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
              <h2 className="font-bold text-black text-base mb-2">Active Containers</h2>
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

          {/* Right: KPI config table (Control Tower style) */}
          <section className="flex-1 flex flex-col bg-white rounded-lg border border-[#E7E1E1] p-4 min-w-0 overflow-hidden">
            <h2 className="font-bold text-black text-base mb-2">
              KPI Config {primaryContainer ? `— ${primaryContainer.canisterId}` : ''}
            </h2>
            {!primaryContainer ? (
              <p className="text-xs text-gray-500">Select one or more containers. KPI config is shown for the first selected.</p>
            ) : (
              <>
                {configError && (
                  <div className="text-xs text-red-600 mb-2">{configError}</div>
                )}
                {configLoading ? (
                  <div className="text-xs text-gray-500">Loading config...</div>
                ) : (
                  <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-lg border border-[#E7E1E1]">
                    <div className="grid grid-cols-[minmax(140px,1fr)_80px_80px_140px] pl-3 pr-3 py-2.5 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-3 items-center">
                      <div className="text-left">KPI Name</div>
                      <div className="text-left">Min</div>
                      <div className="text-left">Max</div>
                      <div className="text-left">Type</div>
                    </div>
                    <div
                      className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-gray-100"
                      style={{ scrollbarWidth: 'thin' }}
                    >
                      {configList.map((r) => {
                        const d = getDraft(r.id);
                        const minVal = d.min !== undefined ? d.min : r.min;
                        const maxVal = d.max !== undefined ? d.max : r.max;
                        const typeVal = d.alert_type !== undefined ? d.alert_type : r.alert_type;
                        return (
                          <div
                            key={r.id}
                            className="grid grid-cols-[minmax(140px,1fr)_80px_80px_140px] pl-3 pr-3 py-2 items-center gap-3 text-xs hover:bg-gray-50/80"
                          >
                            <div className="text-left text-[#6b1176] font-medium truncate">{getDisplayName(r)}</div>
                            <div className="text-left">
                              <input
                                type="number"
                                step="any"
                                value={minVal != null ? minVal : ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? null : Number(e.target.value);
                                  setDraft(r.id, { min: v });
                                }}
                                placeholder="Min"
                                className="w-full border border-[#E7E1E1] rounded px-2 py-1.5 text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent"
                              />
                            </div>
                            <div className="text-left">
                              <input
                                type="number"
                                step="any"
                                value={maxVal != null ? maxVal : ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? null : Number(e.target.value);
                                  setDraft(r.id, { max: v });
                                }}
                                placeholder="Max"
                                className="w-full border border-[#E7E1E1] rounded px-2 py-1.5 text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent"
                              />
                            </div>
                            <div className="text-left">
                              <select
                                value={typeVal ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? null : e.target.value;
                                  setDraft(r.id, { alert_type: v });
                                }}
                                className="w-full border border-[#E7E1E1] rounded px-2 py-1.5 text-gray-900 focus:ring-2 focus:ring-[#6b1176] focus:border-transparent bg-white"
                              >
                                {alertTypeOptions.map((opt) => (
                                  <option key={opt.label} value={opt.value ?? ''}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {configList.length === 0 && !configLoading && (
                      <div className="p-4 text-xs text-gray-500">No KPI config for this container.</div>
                    )}
                    <div className="mt-4 shrink-0 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={
                          saveAllLoading ||
                          (selectedContainers.length > 1
                            ? configList.length === 0
                            : Object.keys(draftConfig).length === 0)
                        }
                        className="px-4 py-2 bg-[#6b1176] text-white rounded-lg text-sm font-medium hover:bg-[#8a2a95] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saveAllLoading ? 'Saving...' : 'Save'}
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
