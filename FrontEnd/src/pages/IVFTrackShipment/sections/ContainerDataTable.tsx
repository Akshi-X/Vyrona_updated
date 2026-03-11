import { useCallback, useEffect, useState } from 'react';
import { ivfService } from '../../../services/ivfService';
import type { IVFTreatment } from '../../../types/ivf.ts';

interface ContainerDataTableProps {
  canisterNumber?: string | number;
}

export default function ContainerDataTable({ canisterNumber }: ContainerDataTableProps) {
  const [rows, setRows] = useState<IVFTreatment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ gobletColor: string; cryolockColor: string }>({
    gobletColor: '',
    cryolockColor: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [totalContainers, setTotalContainers] = useState<number>(0);

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
        const response = await ivfService.getCanisterTrackingDetails(canisterNumber);
        if (!cancelled) {
          setRows(response?.data || []);
          setTotalContainers(response?.total || 0);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setTotalContainers(0);
          setError(e?.message || 'Failed to load container data');
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

  const handleSave = useCallback(
    async (index: number) => {
      if (!canisterNumber) {
        setSaveError('Canister number is required');
        return;
      }

      setSaving(true);
      setSaveError(null);

      try {
        const promises: Promise<any>[] = [];
        const originalRow = rows[index];
        if (!originalRow) throw new Error('Row not found');

        // Update goblet color if changed
        if (editValues.gobletColor !== originalRow.gobletColor && editValues.gobletColor.trim()) {
          // Ensure we're using the cryolock number string (e.g., "CAN-EGM-001-01"), not an ID
          const cryolockNumber = originalRow.cryolockNum;
          if (!cryolockNumber || cryolockNumber.trim() === '') {
            throw new Error('Cryolock number is required to update goblet color');
          }
          // Verify it's a string (cryolock number format like "CAN-EGM-001-01")
          if (typeof cryolockNumber !== 'string') {
            throw new Error(`Invalid cryolock number format: expected string, got ${typeof cryolockNumber}`);
          }
          promises.push(
            ivfService.updateGobletColor(
              canisterNumber,
              cryolockNumber.trim(), // Send the cryolock number string (e.g., "CAN-EGM-001-01")
              editValues.gobletColor.trim()
            )
          );
        }

        // Update cryolock color if changed
        if (editValues.cryolockColor !== originalRow.cryolockColor && editValues.cryolockColor.trim()) {
          // Ensure we're using the cryolock number string (e.g., "CAN-EGM-001-01"), not an ID
          const cryolockNumber = originalRow.cryolockNum;
          if (!cryolockNumber || cryolockNumber.trim() === '') {
            throw new Error('Cryolock number is required to update cryolock color');
          }
          // Verify it's a string (cryolock number format like "CAN-EGM-001-01")
          if (typeof cryolockNumber !== 'string') {
            throw new Error(`Invalid cryolock number format: expected string, got ${typeof cryolockNumber}`);
          }
          promises.push(
            ivfService.updateCryolockColor(
              canisterNumber,
              cryolockNumber.trim(), // Send the cryolock number string (e.g., "CAN-EGM-001-01")
              editValues.cryolockColor.trim()
            )
          );
        }

        if (promises.length === 0) {
          // No changes to save
          setEditingRowIndex(null);
          setEditValues({ gobletColor: '', cryolockColor: '' });
          return;
        }

        // Wait for all updates to complete
        await Promise.all(promises);

        // Update local state
        const updatedRows = [...rows];
        updatedRows[index] = {
          ...updatedRows[index],
          gobletColor: editValues.gobletColor.trim() || originalRow.gobletColor,
          cryolockColor: editValues.cryolockColor.trim() || originalRow.cryolockColor,
        };
        setRows(updatedRows);
        setEditingRowIndex(null);
        setEditValues({ gobletColor: '', cryolockColor: '' });
      } catch (e: any) {
        setSaveError(e?.message || 'Failed to save changes');
      } finally {
        setSaving(false);
      }
    },
    [canisterNumber, editValues, rows]
  );

  const cancelEditing = useCallback(() => {
    setEditingRowIndex(null);
    setEditValues({ gobletColor: '', cryolockColor: '' });
    setSaveError(null);
  }, []);

  const startEditing = useCallback((index: number, row: IVFTreatment) => {
    setEditingRowIndex(index);
    setEditValues({
      gobletColor: row.gobletColor || '',
      cryolockColor: row.cryolockColor || '',
    });
    setSaveError(null);
  }, []);

  return (
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[398px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-black text-[16px]">Container Data</h3>
        <div className="flex items-center gap-4">
          <div className="text-black text-sm">
            <span className="font-medium">Total Cryolock: </span>
            <span className="font-semibold">{totalContainers}</span>
          </div>
          {saveError && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-1 rounded">
              {saveError}
            </div>
          )}
        </div>
      </div>
      <div
        className="flex-1 overflow-auto bg-[#F8F8F8] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <table className="min-w-max w-full text-xs bg-white">
          <thead className="sticky top-0 z-10 bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px] whitespace-nowrap">HIS # (PK)</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Canister #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cane ID</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Goblet Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Date of Vitrification</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Edit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="text-black text-[14px] h-[56px] bg-white">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
                    <td key={col} className="px-3 py-2 whitespace-nowrap">
                      <div className="relative overflow-hidden h-4 rounded-md bg-gray-200" style={{ width: `${col === 1 ? 60 : col === 3 ? 50 : col === 6 ? 70 : col === 7 ? 90 : 45}px` }}>
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
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-red-600" colSpan={8}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-gray-500" colSpan={8}>
                  No container data found
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const isEditing = editingRowIndex === index;
                return (
                  <tr key={index} className="text-black text-[14px] h-[56px] hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{row.hisNumber || '-'} </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.cryolockNum?.split("/").pop() || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.canisterNum || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.caneCode || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues.gobletColor}
                          onChange={(e) =>
                            setEditValues({ ...editValues, gobletColor: e.target.value })
                          }
                          className="w-full px-2 py-1 border border-[#6B1176] rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                          autoFocus
                        />
                      ) : (
                        row.gobletColor || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues.cryolockColor}
                          onChange={(e) =>
                            setEditValues({ ...editValues, cryolockColor: e.target.value })
                          }
                          className="w-full px-2 py-1 border border-[#6B1176] rounded focus:outline-none focus:ring-1 focus:ring-[#6B1176] text-sm"
                        />
                      ) : (
                        row.cryolockColor || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.dateOfVitrification || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
