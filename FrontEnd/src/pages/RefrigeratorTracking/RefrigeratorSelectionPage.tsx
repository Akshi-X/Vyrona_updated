import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Snowflake } from 'lucide-react';
import HamburgerButton from '../../components/HamburgerButton';
import { useAuth } from '../../contexts/AuthContext';
import { ivfService, type IvfBranch } from '../../services/ivfService';
import { userService } from '../../services/userService';
import { shipmentService } from '../../services/shipmentService';

export default function RefrigeratorSelectionPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preselectedBranchId = searchParams.get('branchId');
    const { userRole } = useAuth();
    const normalizedRole = (userRole || '').trim().toLowerCase();
    const isManagerAdmin = normalizedRole.includes('manager') || normalizedRole.includes('admin');

    const [branches, setBranches] = useState<IvfBranch[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [branchesError, setBranchesError] = useState<string | null>(null);
    const [selectedBranchName, setSelectedBranchName] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

    const [refrigerators, setRefrigerators] = useState<{ refrigerator_id: number; label: string }[]>([]);
    const [refrigeratorsLoading, setRefrigeratorsLoading] = useState(false);
    const [selectedRefrigeratorId, setSelectedRefrigeratorId] = useState<number | null>(null);
    const [selectedRefrigeratorLabel, setSelectedRefrigeratorLabel] = useState('');
    const [isRefrigeratorDropdownOpen, setIsRefrigeratorDropdownOpen] = useState(false);

    const branchDropdownRef = useRef<HTMLDivElement | null>(null);
    const branchMenuRef = useRef<HTMLDivElement | null>(null);
    const [branchMenuStyle, setBranchMenuStyle] = useState<{ top: number; left: number; width: number; placement: 'bottom' | 'top' } | null>(null);

    const refrigeratorDropdownRef = useRef<HTMLDivElement | null>(null);
    const refrigeratorMenuRef = useRef<HTMLDivElement | null>(null);
    const [refrigeratorMenuStyle, setRefrigeratorMenuStyle] = useState<{ top: number; left: number; width: number; placement: 'bottom' | 'top' } | null>(null);

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

    const updateRefrigeratorMenuPosition = useCallback(() => {
        const el = refrigeratorDropdownRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const placement: 'bottom' | 'top' = availableBelow < 176 && availableAbove > availableBelow ? 'top' : 'bottom';
        setRefrigeratorMenuStyle({ top: placement === 'bottom' ? rect.bottom + margin : rect.top - margin, left: rect.left, width: rect.width, placement });
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
        if (!isRefrigeratorDropdownOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!refrigeratorDropdownRef.current?.contains(t) && !refrigeratorMenuRef.current?.contains(t)) {
                setIsRefrigeratorDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isRefrigeratorDropdownOpen]);

    useEffect(() => {
        if (!isRefrigeratorDropdownOpen) return;
        updateRefrigeratorMenuPosition();
        window.addEventListener('resize', updateRefrigeratorMenuPosition);
        window.addEventListener('scroll', updateRefrigeratorMenuPosition, true);
        return () => {
            window.removeEventListener('resize', updateRefrigeratorMenuPosition);
            window.removeEventListener('scroll', updateRefrigeratorMenuPosition, true);
        };
    }, [isRefrigeratorDropdownOpen, updateRefrigeratorMenuPosition]);

    useEffect(() => {
        let cancelled = false;
        setBranchesLoading(true);
        setBranchesError(null);

        if (!isManagerAdmin) {
            shipmentService.getActiveRefrigerators()
                .then((res) => {
                    if (cancelled) return;
                    const branch = res.branches?.[0];
                    if (branch) {
                        setSelectedBranchId(branch.branch_id);
                        setSelectedBranchName(branch.branch_name);
                        setRefrigerators(branch.refrigerators.map((ref) => ({
                            refrigerator_id: ref.refrigerator_id,
                            label: ref.refrigerator_code || `R${ref.refrigerator_id}`,
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

    // Pre-select the branch passed via URL param (e.g. from the dashboard map popup)
    useEffect(() => {
        if (!isManagerAdmin || !preselectedBranchId || branches.length === 0 || selectedBranchId !== null) return;
        const id = parseInt(preselectedBranchId, 10);
        const found = branches.find((b) => b.branch_id === id);
        if (found) {
            setSelectedBranchId(found.branch_id);
            setSelectedBranchName(found.branch_name);
        }
    }, [branches, isManagerAdmin, preselectedBranchId, selectedBranchId]);

    useEffect(() => {
        if (!isManagerAdmin || !selectedBranchId) {
            if (isManagerAdmin) {
                setRefrigerators([]);
                setSelectedRefrigeratorId(null);
                setSelectedRefrigeratorLabel('');
            }
            return;
        }
        setRefrigeratorsLoading(true);
        setSelectedRefrigeratorId(null);
        setSelectedRefrigeratorLabel('');
        shipmentService.getActiveRefrigerators({ branch_id: selectedBranchId })
            .then((res) => {
                const branch = res.branches?.find((b) => b.branch_id === selectedBranchId);
                setRefrigerators((branch?.refrigerators ?? []).map((ref) => ({
                    refrigerator_id: ref.refrigerator_id,
                    label: ref.refrigerator_code || `R${ref.refrigerator_id}`,
                })));
            })
            .catch(() => setRefrigerators([]))
            .finally(() => setRefrigeratorsLoading(false));
    }, [isManagerAdmin, selectedBranchId]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRefrigeratorId) return;
        navigate(`/refrigerator-tracking/${selectedRefrigeratorId}`);
    };

    return (
        <div className="flex-1 min-h-screen flex items-center justify-center relative">
            <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'url(/ivf_pattern.png)', backgroundSize: '20%', backgroundRepeat: 'repeat', opacity: 0.6 }} />
            <div className="fixed top-3 left-4 z-30 md:hidden">
                <HamburgerButton />
            </div>
            <div className="relative z-10 w-full max-w-[560px] rounded-[14px] border border-line bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
                <div className="mb-5 flex items-start gap-3">
                    <Snowflake className="w-6 h-6 mt-0.5 text-gray-700" />
                    <div>
                        <h2 className="text-[20px] font-semibold leading-none text-black">Track Refrigerator Quality</h2>
                        <p className="mt-2 text-xs text-[#5A5A5A]">
                            {isManagerAdmin ? 'Please select a branch and refrigerator' : 'Please select a refrigerator'}
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

                    <div className="relative w-full" ref={refrigeratorDropdownRef}>
                        <div
                            className={`relative w-full border rounded-[10px] px-3 py-2.5 text-sm ${
                                !selectedBranchId
                                    ? 'bg-gray-50 cursor-not-allowed text-gray-300 border-gray-200'
                                    : refrigeratorsLoading
                                    ? 'bg-gray-100 cursor-not-allowed text-gray-400 border-gray-200'
                                    : 'border-gray-300 cursor-pointer ' + (!selectedRefrigeratorLabel ? 'text-gray-400' : 'text-black')
                            }`}
                            onClick={() => {
                                if (!selectedBranchId || refrigeratorsLoading || refrigerators.length === 0) return;
                                if (!isRefrigeratorDropdownOpen) updateRefrigeratorMenuPosition();
                                setIsRefrigeratorDropdownOpen(!isRefrigeratorDropdownOpen);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (!selectedBranchId || refrigeratorsLoading) return;
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isRefrigeratorDropdownOpen) updateRefrigeratorMenuPosition(); setIsRefrigeratorDropdownOpen(!isRefrigeratorDropdownOpen); }
                                if (e.key === 'Escape') setIsRefrigeratorDropdownOpen(false);
                            }}
                        >
                            <span className="pr-6 block truncate">
                                {refrigeratorsLoading ? 'Loading refrigerators...' : !selectedBranchId ? 'Select branch first' : selectedRefrigeratorLabel || 'Select Refrigerator'}
                            </span>
                            <svg className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${isRefrigeratorDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                        className={`px-3 py-1.5 cursor-pointer hover:bg-primary-light hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${selectedBranchId === b.branch_id ? 'bg-primary-light text-white' : 'text-black'}`}
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

                    {isRefrigeratorDropdownOpen && refrigerators.length > 0 && refrigeratorMenuStyle &&
                        createPortal(
                            <div ref={refrigeratorMenuRef} className="fixed z-[1000] bg-white border border-gray-300 rounded-[10px] shadow-lg max-h-44 overflow-y-auto text-sm"
                                style={{ top: refrigeratorMenuStyle.top, left: refrigeratorMenuStyle.left, width: refrigeratorMenuStyle.width, transform: refrigeratorMenuStyle.placement === 'top' ? 'translateY(-100%)' : undefined }}>
                                {refrigerators.map((ref) => (
                                    <div key={ref.refrigerator_id}
                                        className={`px-3 py-1.5 cursor-pointer hover:bg-primary-light hover:text-white transition-colors first:rounded-t-[10px] last:rounded-b-[10px] ${selectedRefrigeratorId === ref.refrigerator_id ? 'bg-primary-light text-white' : 'text-black'}`}
                                        onClick={() => {
                                            setSelectedRefrigeratorId(ref.refrigerator_id);
                                            setSelectedRefrigeratorLabel(ref.label);
                                            setIsRefrigeratorDropdownOpen(false);
                                        }}>
                                        {ref.label}
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
                            disabled={!selectedRefrigeratorId}
                        >
                            Track
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
