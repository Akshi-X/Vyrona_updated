import { useCallback, useEffect, useState } from 'react';
import { ivfService } from '../../../services/ivfService';
import type { IVFTreatment } from '../../../types/ivf.ts';
import moveToIcon from '../../../assets/moveto.svg';
import MoveContainerModal from '../../../components/MoveContainerModal';

interface ContainerDataTableProps {
  canisterId?: string | number;
}

export default function ContainerDataTable({ canisterId }: ContainerDataTableProps) {
  const [rows, setRows] = useState<IVFTreatment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<IVFTreatment | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ gobletColor: string; cryolockColor: string }>({
    gobletColor: '',
    cryolockColor: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!canisterId) {
      setRows([]);
      setError('Canister ID is required');
      return;
    }

    let cancelled = false;
    const fetchRows = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await ivfService.getCanisterTrackingDetails(canisterId);
        if (!cancelled) setRows(response?.data || []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
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
  }, [canisterId]);

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
      if (!canisterId) {
        setSaveError('Canister ID is required');
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
          // Ensure we're using the cane identifier string (e.g., "Cane-A 12"), not an ID
          const caneIdentifier = originalRow.caneId;
          if (!caneIdentifier || caneIdentifier.trim() === '') {
            throw new Error('Cane identifier is required to update goblet color');
          }
          // Verify it's a string (cane identifier format like "Cane-A 12" or "Cane-5")
          if (typeof caneIdentifier !== 'string') {
            throw new Error(`Invalid cane identifier format: expected string, got ${typeof caneIdentifier}`);
          }
          promises.push(
            ivfService.updateGobletColor(
              canisterId,
              caneIdentifier.trim(), // Send the cane identifier string (e.g., "Cane-A 12")
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
              canisterId,
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
    [canisterId, editValues, rows]
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
    <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 h-[805px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-black text-[16px]">Container Data</h3>
        {saveError && (
          <div className="text-red-600 text-sm bg-red-50 px-3 py-1 rounded">
            {saveError}
          </div>
        )}
      </div>
      <div
        className="flex-1 overflow-auto bg-[#F8F8F8] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <table className="min-w-max w-full text-xs bg-white">
          <thead className="sticky top-0 z-10 bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px] whitespace-nowrap">HIS Number (PK)</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock Num</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Canister #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cane ID</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Goblet Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cryolock Color</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Date of Vitrification</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Move to</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Edit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-gray-500" colSpan={9}>
                  Loading...
                </td>
              </tr>
            ) : error ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-red-600" colSpan={9}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="text-black text-[14px] h-[56px]">
                <td className="px-3 py-2 whitespace-nowrap text-gray-500" colSpan={9}>
                  No container data found
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const isEditing = editingRowIndex === index;
                return (
                  <tr key={index} className="text-black text-[14px] h-[56px] hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{row.hisNumber || '-'} </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.cryolockNum || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.canisterNum || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.caneId || '-'}</td>
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
                      <div 
                        className="cursor-pointer flex justify-center items-center"
                        onClick={() => {
                          setSelectedRow(row);
                          setIsMoveModalOpen(true);
                        }}
                      >
                        <img src={moveToIcon} alt="Move to" className="w-6 h-6" />
                      </div>
                    </td>
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
      <MoveContainerModal
        isOpen={isMoveModalOpen}
        onClose={() => {
          setIsMoveModalOpen(false);
          setSelectedRow(null);
        }}
        containerData={selectedRow || undefined}
      />
    </div>
  );
}
