import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Users, UserPlus } from "lucide-react";
import PageLayout from "../../components/PageLayout";
import { useAuth } from "../../contexts/AuthContext";
import { userService } from "../../services/userService";
import type { HospitalUserItem } from "../../services/userService";
import { ivfService } from "../../services/ivfService";

type FilterState = {
    role: string;
    branch: string;
};

export default function UsersPage() {
    const { isAuthenticated, userRole } = useAuth();
    const canManageUsers = ["admin", "manager"].includes((userRole || "").toLowerCase());

    const [users, setUsers] = useState<HospitalUserItem[]>([]);
    const [allBranches, setAllBranches] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<FilterState>({ role: "All", branch: "All" });
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const [resendingId, setResendingId] = useState<string | null>(null);
    const [resetLinkSendingId, setResetLinkSendingId] = useState<string | null>(null);
    const [statusTogglingId, setStatusTogglingId] = useState<string | null>(null);

    const [editingUser, setEditingUser] = useState<HospitalUserItem | null>(null);
    const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "" });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [branchEditingUser, setBranchEditingUser] = useState<HospitalUserItem | null>(null);
    const [branchSelection, setBranchSelection] = useState("");
    const [branchSaving, setBranchSaving] = useState(false);
    const [branchError, setBranchError] = useState<string | null>(null);

    const [confirmDisableUser, setConfirmDisableUser] = useState<HospitalUserItem | null>(null);

    // Onboarding: open invite modal via event so tour can walk through it
    useEffect(() => {
        const fn = () => setShowInviteModal(true);
        document.addEventListener("onboarding:open-invite-modal", fn);
        return () => document.removeEventListener("onboarding:open-invite-modal", fn);
    }, []);

    const handleResendInvite = async (userId: string) => {
        setResendingId(userId);
        try {
            await userService.resendInvite(userId);
        } finally {
            setResendingId(null);
        }
    };

    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("User");
    const [inviteBranch, setInviteBranch] = useState("");
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteStatus, setInviteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    useEffect(() => {
        if (!isAuthenticated) return;

        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [res, branchesData, profile] = await Promise.all([
                    userService.getHospitalUsers(),
                    ivfService.getBranches().catch(() => ({ branches: [] })),
                    userService.getProfile().catch(() => null),
                ]);
                setUsers(res.users ?? []);
                setAllBranches(
                    (branchesData.branches ?? [])
                        .map((b) => b.branch_name)
                        .filter(Boolean)
                        .sort()
                );
                setCurrentUserId(profile?.user_id ?? null);
            } catch (err) {
                setError((err as Error)?.message || "Failed to load users");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isAuthenticated]);

    const roleOptions = useMemo(() => {
        const roles = Array.from(new Set(users.map((u) => u.role).filter(Boolean)));
        return ["All", ...roles.sort()];
    }, [users]);

    const branchOptions = useMemo(() => ["All", ...allBranches], [allBranches]);

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (filters.role !== "All" && u.role !== filters.role) return false;
            if (filters.branch !== "All" && (u.branch_name ?? "-") !== filters.branch) return false;
            return true;
        });
    }, [users, filters]);

    const handleReset = () => setFilters({ role: "All", branch: "All" });

    const handleSendResetLink = async (user: HospitalUserItem) => {
        setResetLinkSendingId(user.user_id);
        try {
            await userService.sendPasswordResetLink(user.user_id);
            toast.success(`Password reset link sent to ${user.email}`);
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to send reset link");
        } finally {
            setResetLinkSendingId(null);
        }
    };

    const handleToggleStatus = async (user: HospitalUserItem) => {
        if (user.status) {
            setConfirmDisableUser(user);
            return;
        }
        setStatusTogglingId(user.user_id);
        try {
            const updated = await userService.updateHospitalUserStatus(user.user_id, true);
            setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
            toast.success("User enabled");
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to enable user");
        } finally {
            setStatusTogglingId(null);
        }
    };

    const confirmDisable = async () => {
        if (!confirmDisableUser) return;
        const userId = confirmDisableUser.user_id;
        setStatusTogglingId(userId);
        try {
            const updated = await userService.updateHospitalUserStatus(userId, false);
            setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
            toast.success("User disabled");
            setConfirmDisableUser(null);
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to disable user");
        } finally {
            setStatusTogglingId(null);
        }
    };

    const openEditModal = (user: HospitalUserItem) => {
        setEditingUser(user);
        setEditForm({
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            phone_number: user.phone_number ?? "",
        });
        setEditError(null);
    };

    const closeEditModal = () => {
        setEditingUser(null);
        setEditError(null);
    };

    const handleSaveDetails = async () => {
        if (!editingUser) return;
        if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
            setEditError("First and last name are required.");
            return;
        }
        if (!validateEmail(editForm.email)) {
            setEditError("Enter a valid email address.");
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            const updated = await userService.updateHospitalUserDetails(editingUser.user_id, {
                first_name: editForm.first_name.trim(),
                last_name: editForm.last_name.trim(),
                email: editForm.email.trim(),
                phone_number: editForm.phone_number.trim() || null,
            });
            setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
            toast.success("User details updated");
            closeEditModal();
        } catch (err) {
            setEditError((err as Error)?.message || "Failed to update user");
        } finally {
            setEditSaving(false);
        }
    };

    const openBranchModal = (user: HospitalUserItem) => {
        setBranchEditingUser(user);
        setBranchSelection(user.branch_name ?? "");
        setBranchError(null);
    };

    const closeBranchModal = () => {
        setBranchEditingUser(null);
        setBranchError(null);
    };

    const handleSaveBranch = async () => {
        if (!branchEditingUser || !branchSelection) return;
        setBranchSaving(true);
        setBranchError(null);
        try {
            const updated = await userService.updateHospitalUserBranch(branchEditingUser.user_id, branchSelection);
            setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
            toast.success("Branch updated");
            closeBranchModal();
        } catch (err) {
            setBranchError((err as Error)?.message || "Failed to update branch");
        } finally {
            setBranchSaving(false);
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim() || !validateEmail(inviteEmail)) {
            setInviteEmailError("Enter a valid email address.");
            return;
        }
        if (inviteRole === "User" && !inviteBranch) return;
        setInviteLoading(true);
        setInviteStatus(null);
        try {
            const branch = inviteBranch || undefined;
            await userService.inviteHospitalUser(inviteEmail.trim(), inviteRole, branch);
            toast.success("Invite sent successfully");
            closeInviteModal();
        } catch (err) {
            setInviteStatus({ type: "error", message: (err as Error)?.message || "Failed to send invite" });
        } finally {
            setInviteLoading(false);
        }
    };

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setInviteEmail("");
        setInviteRole("User");
        setInviteBranch("");
        setInviteStatus(null);
        setInviteEmailError(null);
    };

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-red-600">Please login to access this page.</p>
            </div>
        );
    }

    return (
        <>
        {showInviteModal && (
            <div id="onboarding-users-invite-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                <div id="onboarding-users-invite-modal-card" className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-md mx-4 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Invite User</h3>
                    <p className="text-sm text-gray-500 mb-1">Enter the email and role to send an invite link.</p>
                    <p className="text-xs text-amber-600 mb-5">The invite link will expire in 1 week.</p>

                    <div className="flex flex-col gap-4">
                        <div id="onboarding-users-invite-email" className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Email</label>
                            <input
                                type="email"
                                placeholder="user@example.com"
                                className={`border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${inviteEmailError ? "border-red-400" : "border-line"}`}
                                value={inviteEmail}
                                onChange={(e) => { setInviteEmail(e.target.value); setInviteEmailError(null); }}
                                disabled={inviteLoading}
                            />
                            {inviteEmailError && <p className="text-xs text-red-500">{inviteEmailError}</p>}
                        </div>

                        <div id="onboarding-users-invite-role" className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Role</label>
                            <select
                                className="border border-line rounded-md px-3 py-2 text-sm"
                                value={inviteRole}
                                onChange={(e) => { setInviteRole(e.target.value); setInviteBranch(""); }}
                                disabled={inviteLoading}
                            >
                                <option value="User">User</option>
                                <option value="Manager">Manager</option>
                                <option value="Admin">Admin</option>
                            </select>
                        </div>

                        {inviteRole === "User" && (
                            <div id="onboarding-users-invite-branch" className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-600">Branch</label>
                                <select
                                    className="border border-line rounded-md px-3 py-2 text-sm"
                                    value={inviteBranch}
                                    onChange={(e) => setInviteBranch(e.target.value)}
                                    disabled={inviteLoading}
                                >
                                    <option value="">Select branch</option>
                                    {allBranches.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {inviteStatus && (
                            <p className={`text-sm font-medium ${inviteStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                                {inviteStatus.message}
                            </p>
                        )}
                    </div>

                    <div id="onboarding-users-invite-actions" className="flex gap-3 justify-end mt-6">
                        <button
                            type="button"
                            onClick={closeInviteModal}
                            disabled={inviteLoading}
                            className="px-4 py-2 bg-primary-bg text-primary rounded-md text-sm font-semibold hover:bg-[#E8D4F0] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            id="onboarding-users-invite-send"
                            type="button"
                            onClick={handleInvite}
                            disabled={
                                inviteLoading ||
                                !inviteEmail.trim() ||
                                !validateEmail(inviteEmail) ||
                                (inviteRole === "User" && !inviteBranch)
                            }
                            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors disabled:opacity-50"
                        >
                            {inviteLoading ? "Sending..." : "Send Invite"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {editingUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-md mx-4 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Edit User</h3>
                    <p className="text-sm text-gray-500 mb-5">Update name, email, or phone number.</p>

                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-600">First Name</label>
                                <input
                                    type="text"
                                    className="border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    value={editForm.first_name}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                                    disabled={editSaving}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-600">Last Name</label>
                                <input
                                    type="text"
                                    className="border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    value={editForm.last_name}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                                    disabled={editSaving}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Email</label>
                            <input
                                type="email"
                                className="border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                value={editForm.email}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                                disabled={editSaving}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Phone Number</label>
                            <input
                                type="tel"
                                placeholder="Optional"
                                className="border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                value={editForm.phone_number}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                                disabled={editSaving}
                            />
                        </div>

                        {editError && <p className="text-sm font-medium text-red-600">{editError}</p>}
                    </div>

                    <div className="flex gap-3 justify-end mt-6">
                        <button
                            type="button"
                            onClick={closeEditModal}
                            disabled={editSaving}
                            className="px-4 py-2 bg-primary-bg text-primary rounded-md text-sm font-semibold hover:bg-[#E8D4F0] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveDetails}
                            disabled={editSaving}
                            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors disabled:opacity-50"
                        >
                            {editSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {branchEditingUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-sm mx-4 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Change Branch</h3>
                    <p className="text-sm text-gray-500 mb-5">
                        Reassign {branchEditingUser.first_name} {branchEditingUser.last_name} to a different branch.
                    </p>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600">Branch</label>
                        <select
                            className="border border-line rounded-md px-3 py-2 text-sm"
                            value={branchSelection}
                            onChange={(e) => setBranchSelection(e.target.value)}
                            disabled={branchSaving}
                        >
                            <option value="">Select branch</option>
                            {allBranches.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {branchError && <p className="mt-3 text-sm font-medium text-red-600">{branchError}</p>}

                    <div className="flex gap-3 justify-end mt-6">
                        <button
                            type="button"
                            onClick={closeBranchModal}
                            disabled={branchSaving}
                            className="px-4 py-2 bg-primary-bg text-primary rounded-md text-sm font-semibold hover:bg-[#E8D4F0] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveBranch}
                            disabled={branchSaving || !branchSelection}
                            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors disabled:opacity-50"
                        >
                            {branchSaving ? "Saving..." : "Save Branch"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {confirmDisableUser && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-sm mx-4 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">Disable User</h3>
                    <p className="text-sm text-gray-500 mb-5">
                        {confirmDisableUser.first_name} {confirmDisableUser.last_name} will no longer be able to log in. You can re-enable them anytime.
                    </p>

                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={() => setConfirmDisableUser(null)}
                            disabled={statusTogglingId === confirmDisableUser.user_id}
                            className="px-4 py-2 bg-primary-bg text-primary rounded-md text-sm font-semibold hover:bg-[#E8D4F0] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmDisable}
                            disabled={statusTogglingId === confirmDisableUser.user_id}
                            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                            {statusTogglingId === confirmDisableUser.user_id ? "Disabling..." : "Disable User"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        <PageLayout
            title="Users"
            description="Manage your team's roles and branch access."
            lucideIcon={Users}
            patternBackground
            actions={
                <button
                    id="onboarding-users-add-btn"
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors"
                >
                    <UserPlus className="w-4 h-4" />
                    Add User
                </button>
            }
        >
            {/* Filters */}
            <section id="onboarding-users-filters" className="bg-white border border-line rounded-lg p-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-base font-semibold text-black">Filters</h2>
                        <p className="text-xs text-gray-500">Filter users by role or branch.</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="px-3 py-2 border border-line rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Reset Filters
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div id="onboarding-users-filter-role" className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-gray-600">Role</label>
                        <select
                            className="border border-line rounded-md px-3 py-2 text-sm"
                            value={filters.role}
                            onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
                        >
                            {roleOptions.map((role) => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>

                    <div id="onboarding-users-filter-branch" className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-gray-600">Branch</label>
                        <select
                            className="border border-line rounded-md px-3 py-2 text-sm"
                            value={filters.branch}
                            onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
                        >
                            {branchOptions.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            {/* Results */}
            <section id="onboarding-users-results" className="bg-white border border-line rounded-lg p-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-base font-semibold text-black">Users</h2>
                        <p className="text-xs text-gray-500">
                            {loading
                                ? "Loading users..."
                                : `Showing ${filteredUsers.length} of ${users.length} users`}
                        </p>
                    </div>
                </div>

                {error && <div className="mt-4 text-sm text-red-500">{error}</div>}

                <div id="onboarding-users-table" className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface">
                            <tr>
                                <th id="onboarding-users-col-name" className="px-4 py-3 text-left font-semibold text-primary">Name</th>
                                <th id="onboarding-users-col-email" className="px-4 py-3 text-left font-semibold text-primary">Email</th>
                                <th id="onboarding-users-col-role" className="px-4 py-3 text-left font-semibold text-primary">Role</th>
                                <th id="onboarding-users-col-branch" className="px-4 py-3 text-left font-semibold text-primary">Branch</th>
                                <th id="onboarding-users-col-status" className="px-4 py-3 text-left font-semibold text-primary">Status</th>
                                <th id="onboarding-users-col-approved" className="px-4 py-3 text-left font-semibold text-primary">Approved</th>
                                <th id="onboarding-users-col-lastlogin" className="px-4 py-3 text-left font-semibold text-primary">Last Login</th>
                                <th id="onboarding-users-col-invite" className="px-4 py-3 text-left font-semibold text-primary">Invite</th>
                                {canManageUsers && (
                                    <th className="px-4 py-3 text-left font-semibold text-primary">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {loading
                                ? Array.from({ length: 6 }).map((_, i) => (
                                    <tr key={i} className="border-b border-primary-bg bg-white">
                                        {(canManageUsers ? [120, 160, 80, 100, 70, 80, 110, 100, 140] : [120, 160, 80, 100, 70, 80, 110, 100]).map((w, col) => (
                                            <td key={col} className="px-4 py-3">
                                                <div className="relative overflow-hidden h-4 rounded-md bg-gray-200" style={{ width: `${w}px` }}>
                                                    <div
                                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
                                                        style={{ width: "50%", animationDelay: `${i * 0.08}s` }}
                                                    />
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))
                                : filteredUsers.map((user) => (
                                    <tr key={user.user_id} className="border-b border-primary-bg">
                                        <td className="px-4 py-3 text-gray-700">
                                            {user.invite_pending ? (
                                                <span className="text-gray-400 italic">Pending…</span>
                                            ) : (
                                                `${user.first_name} ${user.last_name}`
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{user.email}</td>
                                        <td className="px-4 py-3 text-gray-700">{user.role}</td>
                                        <td className="px-4 py-3 text-gray-700">{user.branch_name ?? "-"}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.status ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                {user.status ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                user.approved_status === "approved" ? "bg-green-100 text-green-700" :
                                                user.approved_status === "rejected" ? "bg-red-100 text-red-600" :
                                                "bg-amber-100 text-amber-700"
                                            }`}>
                                                {user.approved_status.charAt(0).toUpperCase() + user.approved_status.slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                                            {user.last_login
                                                ? new Date(user.last_login).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                                : <span className="text-gray-400">Never</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            {user.invite_pending ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleResendInvite(user.user_id)}
                                                    disabled={resendingId === user.user_id}
                                                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                                                >
                                                    {resendingId === user.user_id ? "Sending…" : "Resend Invite"}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        {canManageUsers && (
                                            <td className="px-4 py-3">
                                                {user.invite_pending ? (
                                                    <span className="text-xs text-gray-400">—</span>
                                                ) : (
                                                    <div className="flex items-center gap-3 whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(user)}
                                                            className="text-xs font-semibold text-primary hover:underline"
                                                        >
                                                            Edit
                                                        </button>
                                                        {user.role !== "Manager" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openBranchModal(user)}
                                                                className="text-xs font-semibold text-primary hover:underline"
                                                            >
                                                                Branch
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendResetLink(user)}
                                                            disabled={resetLinkSendingId === user.user_id}
                                                            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                                                        >
                                                            {resetLinkSendingId === user.user_id ? "Sending…" : "Reset Link"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleStatus(user)}
                                                            disabled={statusTogglingId === user.user_id || user.user_id === currentUserId}
                                                            title={user.user_id === currentUserId ? "You cannot disable your own account" : undefined}
                                                            className={`text-xs font-semibold hover:underline disabled:opacity-50 disabled:no-underline ${user.status ? "text-red-600" : "text-green-600"}`}
                                                        >
                                                            {statusTogglingId === user.user_id ? "..." : user.status ? "Disable" : "Enable"}
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            {!loading && filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={canManageUsers ? 9 : 8} className="px-4 py-6 text-center text-gray-400">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </PageLayout>
        </>
    );
}
