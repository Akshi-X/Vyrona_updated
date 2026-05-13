import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import IncubatorTrackingIcon from '../../assets/DashBoardIcons/Embryos.svg';
import HamburgerButton from '../../components/HamburgerButton';
import { useAuth } from '../../contexts/AuthContext';
import { ivfService, type IvfBranch } from '../../services/ivfService';
import { userService } from '../../services/userService';

export default function IncubatorTrackingDashboardPage() {
    const navigate = useNavigate();
    const { userRole } = useAuth();
    const normalizedRole = (userRole || '').trim().toLowerCase();
    const isManagerAdmin = normalizedRole.includes('manager') || normalizedRole.includes('admin');

    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [branchesError, setBranchesError] = useState<string | null>(null);
    const [selectedBranchName, setSelectedBranchName] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

    const [incubators, setIncubators] = useState<{ incubator_id: number; label: string }[]>([]);
    const [incubasLoading, setIncubasLoading] = useState(false);
    const [selectedIncubatorId, setSelectedIncubatorId] = useState<number | null>(null);
    const [selectedIncubatorLabel, setSelectedIncubatorLabel] = useState('');
    const [isIncubatorDropdownOpen, setIsIncubatorDropdownOpen] = useState(false);

    const branchDropdownRef = useRef<HTMLDivElement | null>(null);
    const branchMenuRef = useRef<HTMLDivElement | null>(null);
    const [branchMenuStyle, setBranchMenuStyle] = useState<{ top: number; left: number; width: number; placement: 'bottom' | 'top' } | null>(null);

    const incubatorDropdownRef = useRef<HTMLDivElement | null>(null);
    const incubatorMenuRef = useRef<HTMLDivElement | null>(null);
    const [incubatorMenuStyle, setIncubatorMenuStyle] = useState<{ top: number; left: number; width: number; placement: 'bottom' | 'top' } | null>(null);

    const updateBranchMenuPosition = useCallback(() => {
        const el = branchDropdownRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const placement: 'bottom' | 'top' = availableBelow < 176 && availableAbove > availableBelow ? 'top' : 'bottom';
        setBranchMenuStyle({ top: placement === 'bottom' ? rect.bottom + margin : rect.top - margin, left: rect.left, width: rect.width, placement });
    }, []);

    const updateIncubatorMenuPosition = useCallback(() => {
        const el = incubatorDropdownRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const placement: 'bottom' | 'top' = availableBelow < 176 && availableAbove > availableBelow ? 'top' : 'bottom';
        setIncubatorMenuStyle({ top: placement === 'bottom' ? rect.bottom + margin : rect.top - margin, left: rect.left, width: rect.width, placement });
    }, []);

    useEffect(() => {
        if (!isBranchDropdownOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!branchDropdownRef.current?.contains(t) && !branchMenuRef.current?.contains(t)) {
                setIsBranchDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isBranchDropdownOpen]);

    useEffect(() => {
        if (!isBranchDropdownOpen) return;
        updateBranchMenuPosition();
        window.addEventListener('resize', updateBranchMenuPosition);
        window.addEventListener('scroll', updateBranchMenuPosition, true);
        return () => {
            window.removeEventListener('resize', updateBranchMenuPosition);
            window.removeEventListener('scroll', updateBranchMenuPosition, true);
        };
    }, [isBranchDropdownOpen, updateBranchMenuPosition]);

    useEffect(() => {
        if (!isIncubatorDropdownOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!incubatorDropdownRef.current?.contains(t) && !incubatorMenuRef.current?.contains(t)) {
                setIsIncubatorDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isIncubatorDropdownOpen]);

    useEffect(() => {
        if (!isIncubatorDropdownOpen) return;
        updateIncubatorMenuPosition();
        window.addEventListener('resize', updateIncubatorMenuPosition);
        window.addEventListener('scroll', updateIncubatorMenuPosition, true);
        return () => {
            window.removeEventListener('resize', updateIncubatorMenuPosition);
            window.removeEventListener('scroll', updateIncubatorMenuPosition, true);
        };
    }, [isIncubatorDropdownOpen, updateIncubatorMenuPosition]);

    useEffect(() => {
        let cancelled = false;
        setBranchesLoading(true);
        setBranchesError(null);

        if (!isManagerAdmin) {
            ivfService.getActiveIncubators()
                .then((res) => {
                    if (cancelled) return;
                    const branch = res.branches?.[0];
                    if (branch) {
                        setSelectedBranchId(branch.branch_id);
                        setSelectedBranchName(branch.branch_name);
                        setIncubators(branch.incubators.map((inc) => ({
                            incubator_id: inc.incubator_id,
                            label: inc.incubator_code || `I${inc.incubator_id}`,
                        })));
                    }
                })
                .catch(() => {})
                .finally(() => { if (!cancelled) setBranchesLoading(false); });
        } else {
            userService.getProfile()
                .then((profile) => {
                    if (cancelled) return;
                    return ivfService.getBranches(profile?.hospital_id ?? undefined);
                })
                .then((res) => {
                    if (cancelled) return;
                    setBranches(Array.isArray(res?.branches) ? res.branches : []);
                })
                .catch((e: unknown) => {
                    if (cancelled) return;
                    setBranches([]);
                    setBranchesError((e as { message?: string })?.message || 'Failed to load branches');
                })
                .finally(() => { if (!cancelled) setBranchesLoading(false); });
        }

        return () => { cancelled = true; };
    }, [isManagerAdmin]);

    useEffect(() => {
        if (!isManagerAdmin || !selectedBranchName) {
            if (isManagerAdmin) {
                setIncubators([]);
                setSelectedIncubatorId(null);
                setSelectedIncubatorLabel('');
            }
            return;
        }
        setIncubasLoading(true);
        setSelectedIncubatorId(null);
        setSelectedIncubatorLabel('');
        ivfService.getActiveIncubators(selectedBranchName)
            .then((res) => {
                const branch = res.branches?.find((b) => b.branch_name === selectedBranchName);
                setIncubators((branch?.incubators ?? []).map((inc) => ({
                    incubator_id: inc.incubator_id,
                    label: inc.incubator_code || `I${inc.incubator_id}`,
                })));
            })
            .catch(() => setIncubators([]))
            .finally(() => setIncubasLoading(false));
    }, [isManagerAdmin, selectedBranchName]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIncubatorId) return;
        navigate(`/incubator-tracking/${selectedIncubatorId}`);
    };

    return (
        <div className="flex-1 min-h-screen flex items-center justify-center">
            <div className="fixed top-3 left-4 z-30 md:hidden">
                <HamburgerButton />
            </div>
            <div className="w-full max-w-[560px] rounded-[14px] border border-[#E7E1E1] bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start gap-3">
                    <img src={IncubatorTrackingIcon} alt="Track Incubator" className="w-6 h-6 mt-0.5" />
                    <div>
                        <h2 className="text-[20px] font-semibold leading-none text-black">Track Incubator Quality</h2>
                        <p className="mt-2 text-xs text-[#5A5A5A]">
                            {isManagerAdmin ? 'Please select a branch and incubator' : 'Please select an incubator'}
                        </p>
                    </div>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative w-full" ref={branchDropdownRef}>
                        <div
                            className={`relative w-full border rounded-[10px] px-3 py-2.5 text-sm ${
                                branchesError ? 'border-red-500' : 'border-gray-300'
                            } ${
                                !isManagerAdmin
                                    ? 'bg-gray-50 cursor-not-allowed text-gray-500'
                                    : branchesLoading
                                    ? 'bg-gray-100 cursor-not-allowed text-gray-400'
                                    : 'cursor-pointer ' + (!selectedBranchName ? 'text-gray-400' : 'text-black')
                            }`}
                            onClick={() => {
                                if (!isManagerAdmin || branchesLoading) return;
                                if (!isBranchDropdownOpen) updateBranchMenuPosition();
                                setIsBranchDropdownOpen(!isBranchDropdownOpen);
                            }}
                            role={isManagerAdmin ? 'button' : undefined}
                            tabIndex={isManagerAdmin ? 0 : undefined}
                            onKeyDown={(e) => {
                                if (!isManagerAdmin || branchesLoading) return;
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isBranchDropdownOpen) updateBranchMenuPosition(); setIsBranchDropdownOpen(!isBranchDropdownOpen); }
                                if (e.key === 'Escape') setIsBranchDropdownOpen(false);
                            }}
                        >
                            <span className="pr-6 block truncate">
                                {branchesLoading ? 'Loading...' : selectedBranchName || 'Select Branch'}
                            </span>
                            {isManagerAdmin && (
                                <svg className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${isBranchDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            )}
                        </div>
                        {branchesError && <p className="text-xs text-red-500 mt-1">{branchesError}</p>}
                    </div>

                    <div className="relative w-full" ref={incubatorDropdownRef}>
                        <div
                            className={`relative w-full border rounded-[10px] px-3 py-2.5 text-sm ${
                                !selectedBranchId
                                    ? 'bg-gray-50 cursor-not-allowed text-gray-300 border-gray-200'
                                    : incubasLoading
                                    ? 'bg-gray-100 cursor-not-allowed text-gray-400 border-gray-200'
                                    : 'border-gray-300 cursor-pointer ' + (!selectedIncubatorLabel ? 'text-gray-400' : 'text-black')
                            }`}
                            onClick={() => {
                                if (!selectedBranchId || incubasLoading || incubators.length === 0) return;
                                if (!isIncubatorDropdownOpen) updateIncubatorMenuPosition();
                                setIsIncubatorDropdownOpen(!isIncubatorDropdownOpen);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (!selectedBranchId || incubasLoading) return;
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isIncubatorDropdownOpen) updateIncubatorMenuPosition(); setIsIncubatorDropdownOpen(!isIncubatorDropdownOpen); }
                                if (e.key === 'Escape') setIsIncubatorDropdownOpen(false);
                            }}
                        >
                            <span className="pr-6 block truncate">
                                {incubasLoading ? 'Loading incubators...' : !selectedBranchId ? 'Select branch first' : selectedIncubatorLabel || 'Select Incubator'}
                            </span>
                            <svg className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${isIncubatorDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    {isManagerAdmin && isBranchDropdownOpen && branches.length > 0 && branchMenuStyle &&
                        createPortal(
                            <div ref={branchMenuRef} className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-sm"
                                style={{ top: branchMenuStyle.top, left: branchMenuStyle.left, width: branchMenuStyle.width, transform: branchMenuStyle.placement === 'top' ? 'translateY(-100%)' : undefined }}>
                                {branches.map((b) => (
                                    <div key={b.branch_id}
                                        className={`px-3 py-1.5 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${selectedBranchId === b.branch_id ? 'bg-[#8b2a96] text-white' : 'text-black'}`}
                                        onClick={() => {
                                            setSelectedBranchName(b.branch_name);
                                            setSelectedBranchId(b.branch_id);
                                            setIsBranchDropdownOpen(false);
                                        }}>
                                        {b.branch_name}
                                    </div>
                                ))}
                            </div>,
                            document.body
                        )}

                    {isIncubatorDropdownOpen && incubators.length > 0 && incubatorMenuStyle &&
                        createPortal(
                            <div ref={incubatorMenuRef} className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-sm"
                                style={{ top: incubatorMenuStyle.top, left: incubatorMenuStyle.left, width: incubatorMenuStyle.width, transform: incubatorMenuStyle.placement === 'top' ? 'translateY(-100%)' : undefined }}>
                                {incubators.map((inc) => (
                                    <div key={inc.incubator_id}
                                        className={`px-3 py-1.5 cursor-pointer hover:bg-[#8b2a96] hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${selectedIncubatorId === inc.incubator_id ? 'bg-[#8b2a96] text-white' : 'text-black'}`}
                                        onClick={() => {
                                            setSelectedIncubatorId(inc.incubator_id);
                                            setSelectedIncubatorLabel(inc.label);
                                            setIsIncubatorDropdownOpen(false);
                                        }}>
                                        {inc.label}
                                    </div>
                                ))}
                            </div>,
                            document.body
                        )}

                    <div className="flex justify-end gap-3">
                        <button
                            id="onboarding-modal-cancel-btn"
                            type="button"
                            onClick={() => navigate('/dashboard')}
                            className="px-5 py-2.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            id="onboarding-modal-track-btn"
                            type="submit"
                            className="px-5 py-2.5 rounded-md bg-[#650458] text-white hover:opacity-95 disabled:opacity-50"
                            disabled={!selectedIncubatorId}
                        >
                            Track
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
