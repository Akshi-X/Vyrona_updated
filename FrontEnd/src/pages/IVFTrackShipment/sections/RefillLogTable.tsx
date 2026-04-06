import { useCallback, useEffect, useState, useRef } from 'react';
import { ivfService } from '../../../services/ivfService';
import type { RefillLogItem } from '../../../services/ivfService';

const getStatusColor = (status: string) => {
  if (!status) return 'text-gray-600';
  const normalizedStatus = status.trim();
  switch (normalizedStatus.toLowerCase()) {
    case 'done':
      return 'text-green-600';
    case 'in progress':
      return 'text-[#1456BF]';
    default:
      return 'text-gray-600';
  }
};

interface RefillLogTableProps {
  canisterNumber?: string | number;
}

export default function RefillLogTable({ canisterNumber }: RefillLogTableProps) {
  const [rows, setRows] = useState<RefillLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editReservoir, setEditReservoir] = useState<string>('');
  const [editLn2OrderedDate, setEditLn2OrderedDate] = useState<string>('');
  const [editLn2ReceivedDate, setEditLn2ReceivedDate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newRefillLog, setNewRefillLog] = useState({
    refill_date: '',
    refill_time: '',
    refilled_by: '',
    description: '',
    status: 'Not started',
    cryoshipper: '',
    disinfected_shipper_infected_tank_description: '',
    reservoir: '',
    ln2_ordered_date: '',
    ln2_received_date: '',
  });
  const [isAddStatusDropdownOpen, setIsAddStatusDropdownOpen] = useState(false);
  const [editingStatusDropdownIndex, setEditingStatusDropdownIndex] = useState<number | null>(null);
  const addStatusDropdownRef = useRef<HTMLDivElement | null>(null);
  const editStatusDropdownRefs = useRef<(HTMLDivElement | null)[]>([]);

  const statusOptions = ['Not started', 'In progress', 'Done'] as const;

  useEffect(() => {
    if (!canisterNumber) {
      setRows([]);
      setError('Canister number is required');
      return;
    }

    let cancelled = false;
    const fetchRows = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await ivfService.getCanisterRefillLogs(canisterNumber);
        if (!cancelled) setRows(response?.refill_logs || []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message || 'Failed to load refill logs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRows();
    return () => {
      cancelled = true;
    };
  }, [canisterNumber]);

  // Auto-dismiss save error after 5 seconds
  useEffect(() => {
    if (saveError) {
      const timer = setTimeout(() => {
        setSaveError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveError]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        addStatusDropdownRef.current &&
        !addStatusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAddStatusDropdownOpen(false);
      }
      if (editingStatusDropdownIndex !== null) {
        const ref = editStatusDropdownRefs.current[editingStatusDropdownIndex];
        if (ref && !ref.contains(event.target as Node)) {
          setEditingStatusDropdownIndex(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingStatusDropdownIndex]);

  const startEditing = useCallback((index: number, row: RefillLogItem) => {
    setEditingRowIndex(index);
    setEditStatus(row.status || '');
    setEditReservoir(row.reservoir ?? '');
    setEditLn2OrderedDate(row.ln2_ordered_date ?? '');
    setEditLn2ReceivedDate(row.ln2_received_date ?? '');
    setSaveError(null);
    setEditingStatusDropdownIndex(index);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingRowIndex(null);
    setEditStatus('');
    setEditReservoir('');
    setEditLn2OrderedDate('');
    setEditLn2ReceivedDate('');
    setSaveError(null);
    setEditingStatusDropdownIndex(null);
  }, []);

  const handleSave = useCallback(
    async (index: number) => {
      if (!canisterNumber) {
        setSaveError('Canister number is required');
        return;
      }

      const originalRow = rows[index];
      if (!originalRow || !originalRow.log_id) {
        setSaveError('Invalid row data');
        return;
      }

      // Normalize nulls to empty strings for comparison
      const origReservoir = originalRow.reservoir ?? '';
      const origLn2Ordered = originalRow.ln2_ordered_date ?? '';
      const origLn2Received = originalRow.ln2_received_date ?? '';

      const hasChanges =
        editStatus !== originalRow.status ||
        editReservoir !== origReservoir ||
        editLn2OrderedDate !== origLn2Ordered ||
        editLn2ReceivedDate !== origLn2Received;

      if (!hasChanges) {
        cancelEditing();
        return;
      }

      if (!editStatus.trim()) {
        setSaveError('Status is required');
        return;
      }

      setSaving(true);
      setSaveError(null);

      try {
        const updated = await ivfService.updateRefillLog(canisterNumber, originalRow.log_id, {
          status: editStatus.trim(),
          reservoir: editReservoir.trim() || null,
          ln2_ordered_date: editLn2OrderedDate || null,
          ln2_received_date: editLn2ReceivedDate || null,
        });

        // Merge returned data into local state
        const updatedRows = [...rows];
        updatedRows[index] = { ...updatedRows[index], ...updated };
        setRows(updatedRows);
        setEditingRowIndex(null);
        setEditStatus('');
        setEditReservoir('');
        setEditLn2OrderedDate('');
        setEditLn2ReceivedDate('');
      } catch (e: any) {
        setSaveError(e?.message || 'Failed to save changes');
      } finally {
        setSaving(false);
      }
    },
    [canisterNumber, rows, editStatus, editReservoir, editLn2OrderedDate, editLn2ReceivedDate, cancelEditing]
  );

  const handleAddClick = useCallback(() => {
    setIsAdding(true);
    setAddError(null);
    // Set default values
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    setNewRefillLog({
      refill_date: dateStr,
      refill_time: timeStr,
      refilled_by: '',
      description: '',
      status: 'Not started',
      cryoshipper: '',
      disinfected_shipper_infected_tank_description: '',
      reservoir: '',
      ln2_ordered_date: '',
      ln2_received_date: '',
    });
  }, []);

  const cancelAdding = useCallback(() => {
    setIsAdding(false);
    setAddError(null);
    setNewRefillLog({
      refill_date: '',
      refill_time: '',
      refilled_by: '',
      description: '',
      status: 'Not started',
      cryoshipper: '',
      disinfected_shipper_infected_tank_description: '',
      reservoir: '',
      ln2_ordered_date: '',
      ln2_received_date: '',
    });
  }, []);

  const handleAddSubmit = useCallback(async () => {
    if (!canisterNumber) {
      setAddError('Canister number is required');
      return;
    }

    // Validate required fields
    if (!newRefillLog.refill_date.trim()) {
      setAddError('Refill date is required');
      return;
    }
    if (!newRefillLog.refill_time.trim()) {
      setAddError('Refill time is required');
      return;
    }
    if (!newRefillLog.refilled_by.trim()) {
      setAddError('Refilled by is required');
      return;
    }
    if (!newRefillLog.description.trim()) {
      setAddError('Description is required');
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      // Format time - ensure it has seconds (HH:MM:SS format)
      const formattedTime = newRefillLog.refill_time.includes(':') && newRefillLog.refill_time.split(':').length === 2
        ? `${newRefillLog.refill_time}:00`
        : newRefillLog.refill_time;

      await ivfService.createRefillLog(canisterNumber, {
        refill_date: newRefillLog.refill_date,
        refill_time: formattedTime,
        refilled_by: newRefillLog.refilled_by.trim(),
        description: newRefillLog.description.trim(),
        status: newRefillLog.status,
        cryoshipper: newRefillLog.cryoshipper.trim() || null,
        disinfected_shipper_infected_tank_description: newRefillLog.disinfected_shipper_infected_tank_description.trim() || null,
        reservoir: newRefillLog.reservoir.trim() || null,
        ln2_ordered_date: newRefillLog.ln2_ordered_date || null,
        ln2_received_date: newRefillLog.ln2_received_date || null,
      });

      // Refresh the data from server to get all fields correctly
      const response = await ivfService.getCanisterRefillLogs(canisterNumber);
      setRows(response?.refill_logs || []);

      setIsAdding(false);
      setNewRefillLog({
        refill_date: '',
        refill_time: '',
        refilled_by: '',
        description: '',
        status: 'Not started',
        cryoshipper: '',
        disinfected_shipper_infected_tank_description: '',
        reservoir: '',
        ln2_ordered_date: '',
        ln2_received_date: '',
      });
    } catch (e: any) {
      setAddError(e?.message || 'Failed to add refill log');
    } finally {
      setAdding(false);
    }
  }, [canisterNumber, newRefillLog]);

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[398px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-black text-[16px]">Refill Log</h3>
        <div className="flex items-center gap-3">
          {saveError && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-1 rounded">
              {saveError}
            </div>
          )}
          {addError && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-1 rounded">
              {addError}
            </div>
          )}
          {!isAdding && (
            <button
              onClick={handleAddClick}
              className="bg-[#6B1176] text-white px-4 py-2 rounded-md hover:bg-[#5a0e64] transition-colors font-medium text-sm uppercase flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              ADD
            </button>
          )}
        </div>
      </div>
      <div
        className="flex-1 overflow-auto bg-[#F8F8F8] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Refilled Date</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Refill Time</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Refilled By</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Description</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Reservoir</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">LN2 Ordered Date</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">LN2 Received Date</th>
              <th className="px-3 py-2 text-left whitespace-nowrap h-[56px]">Status</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Edit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="text-black text-[14px] h-[56px] bg-white">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => (
                    <td key={col} className="px-3 py-2 whitespace-nowrap">
                      <div className="relative overflow-hidden h-4 rounded-md bg-gray-200" style={{ width: `${[75, 55, 70, 80, 60, 95, 95, 55, 40][col - 1]}px` }}>
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                          style={{ width: '50%', animationDelay: `${i * 0.08}s` }}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr className="text-black text-[14px] h-[56px] bg-white">
                <td className="px-3 py-2 text-red-600" colSpan={9}>
                  {error}
                </td>
              </tr>
            ) : (
              <>
                {/* Add new row input */}
                {isAdding && (
                  <tr className="text-black text-[14px] h-[56px] bg-white">
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="date"
                        value={newRefillLog.refill_date}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, refill_date: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        required
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="time"
                        value={newRefillLog.refill_time}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, refill_time: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        step="1"
                        required
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="text"
                        value={newRefillLog.refilled_by}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, refilled_by: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        placeholder="Enter name"
                        required
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="text"
                        value={newRefillLog.description}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, description: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        placeholder="Enter description"
                        required
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="text"
                        value={newRefillLog.reservoir}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, reservoir: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        placeholder="Enter reservoir"
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="date"
                        value={newRefillLog.ln2_ordered_date}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, ln2_ordered_date: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <input
                        type="date"
                        value={newRefillLog.ln2_received_date}
                        onChange={(e) =>
                          setNewRefillLog({ ...newRefillLog, ln2_received_date: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      {/* Custom Status dropdown styled like Role dropdown */}
                      <div
                        ref={addStatusDropdownRef}
                        className="relative w-full"
                      >
                        <div
                          className="w-[117px] border rounded-[10px] px-2 py-1 pr-3 cursor-pointer border-[#6B1176] text-sm flex items-center justify-between bg-white"
                          onClick={() => setIsAddStatusDropdownOpen((open) => !open)}
                        >
                          <span>{newRefillLog.status || 'Status'}</span>
                          <svg
                            className={`w-4 h-4 transition-transform ${isAddStatusDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {isAddStatusDropdownOpen && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg">
                            {statusOptions.map((option) => (
                              <div
                                key={option}
                                className={`px-3 py-2 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${
                                  newRefillLog.status === option ? 'bg-[#8b2a96] text-white' : 'text-black'
                                }`}
                                onClick={() => {
                                  setNewRefillLog({ ...newRefillLog, status: option });
                                  setIsAddStatusDropdownOpen(false);
                                }}
                              >
                                {option}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      <div className="flex justify-center items-center gap-2">
                        <button
                          onClick={() => void handleAddSubmit()}
                          disabled={adding}
                          className="p-1 text-green-600 hover:text-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Save"
                        >
                          {adding ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={cancelAdding}
                          disabled={adding}
                          className="p-1 text-red-600 hover:text-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Cancel"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {rows.length === 0 && !isAdding ? (
                  <tr className="text-black text-[14px] bg-white">
                    <td className="px-3 py-2" colSpan={9}>
                      <div className="relative">
                        <div className="space-y-2">
                          {[
                            ['2026-02-14', '09:15:00', 'Nurse A', 'Routine check', 'R-12', '2026-02-12', '2026-02-13', 'In progress', 'Edit'],
                            ['2026-03-01', '11:45:00', 'Tech B', 'Top-up', 'R-05', '2026-02-28', '2026-03-01', 'Done', 'Edit'],
                            ['2026-03-01', '11:45:00', 'Tech B', 'Top-up', 'R-05', '2026-02-28', '2026-03-01', 'Done', 'Edit'],
                            ['2026-03-01', '11:45:00', 'Tech B', 'Top-up', 'R-05', '2026-02-28', '2026-03-01', 'Done', 'Edit'],
                          ].map((cells, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-9 gap-3 items-center h-12 bg-white px-3 rounded blur-[1px] opacity-70"
                            >
                              {cells.map((cell, col) => (
                                <div key={col} className="text-[13px] text-gray-500 truncate">
                                  {cell}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-1.5 bg-white/80 text-gray-700 text-sm px-4 py-2 rounded shadow-sm text-center">
                            <svg
                              className="w-6 h-6 text-[#6B1176]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
                              />
                            </svg>
                            <span>No logs added yet.</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => {
                    const isEditing = editingRowIndex === index;
                return (
                  <tr key={row.log_id} className="text-black text-[14px] h-[56px] bg-white hover:bg-gray-50">
                    <td className="px-3 py-2 h-[56px]">{row.refill_date || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">{row.refill_time || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">{row.refilled_by || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">{row.description || '-'}</td>
                    <td className="px-3 py-2 h-[56px]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editReservoir}
                          onChange={(e) => setEditReservoir(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                          placeholder="Enter reservoir"
                        />
                      ) : (
                        row.reservoir || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editLn2OrderedDate}
                          onChange={(e) => setEditLn2OrderedDate(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        />
                      ) : (
                        row.ln2_ordered_date || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editLn2ReceivedDate}
                          onChange={(e) => setEditLn2ReceivedDate(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        />
                      ) : (
                        row.ln2_received_date || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      {isEditing ? (
                        <div
                          ref={(el) => {
                            editStatusDropdownRefs.current[index] = el;
                          }}
                          className="relative w-full"
                        >
                          <div
                             className="w-[117px] border rounded-[10px] px-2 py-1 pr-3 cursor-pointer border-[#6B1176] text-sm flex items-center justify-between bg-white"
                             onClick={() =>
                              setEditingStatusDropdownIndex(
                                editingStatusDropdownIndex === index ? null : index
                              )
                            }
                          >
                            <span>{editStatus || 'Status'}</span>
                            <svg
                              className={`w-4 h-4 transition-transform ${
                                editingStatusDropdownIndex === index ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>

                          {editingStatusDropdownIndex === index && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-[10px] shadow-lg">
                              {statusOptions.map((option) => (
                                <div
                                  key={option}
                                  className={`px-3 py-2 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${
                                    editStatus === option ? 'bg-[#8b2a96] text-white' : 'text-black'
                                  }`}
                                  onClick={() => {
                                    setEditStatus(option);
                                    setEditingStatusDropdownIndex(null);
                                  }}
                                >
                                  {option}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className={getStatusColor(row.status)}>{row.status || '-'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 h-[56px]">
                      {isEditing ? (
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => void handleSave(index)}
                            disabled={saving}
                            className="p-1 text-green-600 hover:text-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Save"
                          >
                            {saving ? (
                              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={saving}
                            className="p-1 text-red-600 hover:text-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Cancel"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center items-center">
                          <button
                            onClick={() => startEditing(index, row)}
                            className="p-1 text-gray-600 hover:text-[#6B1176] transition-colors"
                            title="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
