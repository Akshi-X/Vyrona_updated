import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../Modal';
import ContainerQualityTrackingIcon from '../../assets/DashBoardIcons/DarkContainerQualityTracking.svg';
import { useAuth } from '../../contexts/AuthContext';
import { ivfService, type IvfBranch } from '../../services/ivfService';

interface TrackCanisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrack?: (canisterId: string, branchName?: string) => void;
  error?: string;
  title?: string;
  icon?: string;
}

const TrackCanisterModal: React.FC<TrackCanisterModalProps> = ({
  isOpen,
  onClose,
  onTrack,
  error,
  title = "Track Container Quality",
  icon = ContainerQualityTrackingIcon,
}) => {
  const { userRole } = useAuth();
  const normalizedRole = (userRole || '').trim().toLowerCase();
  const isManager = normalizedRole.includes('manager');

  const [canisterId, setCanisterId] = useState('');
  const [branches, setBranches] = useState<IvfBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [selectedBranchName, setSelectedBranchName] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const branchDropdownRef = useRef<HTMLDivElement | null>(null);
  const branchMenuRef = useRef<HTMLDivElement | null>(null);
  const [branchMenuStyle, setBranchMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setCanisterId('');
      setBranches([]);
      setBranchesLoading(false);
      setBranchesError(null);
      setSelectedBranchName('');
      setSelectedBranchId(null);
      setIsBranchDropdownOpen(false);
      setBranchMenuStyle(null);
    }
  }, [isOpen]);

  const updateBranchMenuPosition = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const el = branchDropdownRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 6;
    const maxHeight = 240; // mirrors Signup dropdown max-h-60

    // Clamp left so it doesn't overflow viewport
    const viewportPadding = 8;
    const width = rect.width;
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding
    );

    const availableBelow = window.innerHeight - rect.bottom - margin;
    const availableAbove = rect.top - margin;
    const placement: 'bottom' | 'top' =
      availableBelow < Math.min(200, maxHeight) && availableAbove > availableBelow ? 'top' : 'bottom';

    const top = placement === 'bottom' ? rect.bottom + margin : rect.top - margin;

    setBranchMenuStyle({ top, left, width, placement });
  }, []);

  // Close branch dropdown on outside click (same behavior as Signup page dropdown)
  useEffect(() => {
    if (!isBranchDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTriggerInside = !!branchDropdownRef.current?.contains(target);
      const clickedMenuInside = !!branchMenuRef.current?.contains(target);
      if (!clickedTriggerInside && !clickedMenuInside) {
        setIsBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBranchDropdownOpen]);

  // When the dropdown opens, render the menu in a portal and position it relative to the trigger
  useEffect(() => {
    if (!isBranchDropdownOpen) return;
    updateBranchMenuPosition();

    const handleReposition = () => updateBranchMenuPosition();
    window.addEventListener('resize', handleReposition);
    // capture=true to also respond to scroll events within any scroll container
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isBranchDropdownOpen, updateBranchMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isManager) return;

    let cancelled = false;
    setBranchesLoading(true);
    setBranchesError(null);

    ivfService.getBranches()
      .then((res) => {
        if (cancelled) return;
        setBranches(Array.isArray(res?.branches) ? res.branches : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setBranches([]);
        setBranchesError((e?.message as string) || 'Failed to load branches');
      })
      .finally(() => {
        if (cancelled) return;
        setBranchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isManager]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCanisterId = canisterId.trim();
    if (!trimmedCanisterId) return;
    if (isManager && !selectedBranchName) return;
    if (isManager && selectedBranchId != null) {
      try {
        sessionStorage.setItem('ivf_selected_branch_id', String(selectedBranchId));
      } catch {}
    }
    onTrack?.(trimmedCanisterId, isManager ? selectedBranchName : undefined);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={isManager ? "Please enter the canister ID and branch" : "Please enter the canister ID"}
      icon={
        <img
          src={icon}
          alt="Track Canister"
          className="w-6 h-6 mt-5"
        />
      }
      containerClassName="w-[40%]"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <input
            ref={inputRef}
            type="text"
            value={canisterId}
            onChange={(e) => setCanisterId(e.target.value)}
            placeholder="e.g., 1"
            className="w-full px-4 py-3 rounded-md border border-[#650458] outline-none focus:ring-2 focus:ring-[#bd56af] focus:border-[#bd56af]"
          />
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
        </div>
        {isManager ? (
          <div className="relative w-full" ref={branchDropdownRef}>
            <div
              className={`peer w-full border rounded-[10px] px-3 py-2 pr-10 cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2a96] ${
                branchesError ? "border-red-500" : "border-gray-300"
              } ${!selectedBranchName ? "text-gray-400" : "text-black"} ${
                branchesLoading ? "bg-gray-100 cursor-not-allowed" : ""
              }`}
              onClick={() => {
                if (branchesLoading) return;
                if (!isBranchDropdownOpen) {
                  updateBranchMenuPosition();
                }
                setIsBranchDropdownOpen(!isBranchDropdownOpen);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (branchesLoading) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!isBranchDropdownOpen) {
                    updateBranchMenuPosition();
                  }
                  setIsBranchDropdownOpen(!isBranchDropdownOpen);
                }
                if (e.key === 'Escape') {
                  setIsBranchDropdownOpen(false);
                }
              }}
            >
              <div className="flex justify-between items-center">
                <span>{selectedBranchName || (branchesLoading ? "Loading branches..." : "Branch")}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {branchesError ? (
              <p className="text-xs text-red-500 mt-1">{branchesError}</p>
            ) : null}
          </div>
        ) : null}
        {isManager && isBranchDropdownOpen && branches.length > 0 && branchMenuStyle && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={branchMenuRef}
                className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-sm"
                style={{
                  top: branchMenuStyle.top,
                  left: branchMenuStyle.left,
                  width: branchMenuStyle.width,
                  transform: branchMenuStyle.placement === 'top' ? 'translateY(-100%)' : undefined,
                }}
              >
                {branches.map((option) => (
                  <div
                    key={option.branch_id}
                    className={`px-3 py-1.5 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${
                      selectedBranchName === option.branch_name ? "bg-[#8b2a96] text-white" : "text-black"
                    }`}
                    onClick={() => {
                      setSelectedBranchName(option.branch_name);
                      setSelectedBranchId(option.branch_id);
                      try {
                        sessionStorage.setItem('ivf_selected_branch_id', String(option.branch_id));
                      } catch {}
                      setIsBranchDropdownOpen(false);
                    }}
                  >
                    {option.branch_name}
                  </div>
                ))}
              </div>,
              document.body
            )
          : null}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-md bg-[#650458] text-white hover:opacity-95 disabled:opacity-50"
            disabled={!canisterId.trim() || (isManager && !selectedBranchName)}
          >
            Track
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TrackCanisterModal;
