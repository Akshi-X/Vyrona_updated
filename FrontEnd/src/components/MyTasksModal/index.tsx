import React, { useState, useEffect, useRef } from "react";
import AlertCard from "../AlertCard";
import MyTasksIcon from "../../assets/DashBoardIcons/My_Tasks.svg";
import { tasksService } from "../../services/tasksService";
import { userService } from "../../services/userService";
import type { UserListItem } from "../../services/userService";
import { TASK_FIELD_ERRORS } from "../../constants/validation";

// MyTasksModal component with API integration

export interface MyTask {
    id: string;
    patientId: string;
    canisterNumber?: string;
    tankCode?: string;
    tankId?: number;
    assigneeId?: string; // user_id (stored for update calls)
    taskName: string;
    description: string;
    assigneeBy: string;
    assignedTo: string;
    dueDate: string;
    priority: "Low" | "Medium" | "High";
    status: "Not started" | "In progress" | "Done" | "Cancelled";
}

interface MyTasksModalProps {
    isOpen: boolean;
    onClose: () => void;
    tasks: MyTask[];
    loading?: boolean;
    onAdd?: () => void;
    onEdit?: (task: MyTask) => void | Promise<void>;
    onDelete?: (taskId: string) => void;
    variant?: "dashboard" | "track" | "ivf"; // Add variant to differentiate between Dashboard, Track & Trace and IVF
    currentUserName?: string; // Current user's full name for "Assigned by" field
    currentUserId?: string; // Current user's ID
    onTaskCreated?: () => void; // Callback to refresh tasks after creation
    userRole?: string; // User's role for role-based access control
    defaultPatientId?: string; // Default patient ID to pre-fill when adding a new task
    defaultCanisterNumber?: string; // Default canister number to pre-fill when adding a new IVF task
    defaultTankId?: number; // Default tank ID for exact IVF task mapping
    id?: string;
}

const MyTasksModal: React.FC<MyTasksModalProps> = ({
    isOpen,
    onClose,
    tasks,
    loading = false,
    onAdd,
    onEdit,
    variant = "dashboard",
    currentUserName = "",
    currentUserId = "",
    onTaskCreated,
    userRole = "",
    defaultPatientId = "",
    defaultCanisterNumber = "",
    defaultTankId,
    id,
}) => {
    const isUserRole = userRole?.toLowerCase() === "user";
    const isIvfVariant = variant === "ivf";
    const [showInputRow, setShowInputRow] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(
        new Set(),
    );
    const [newTask, setNewTask] = useState({
        patientId: "",
        canisterNumber: "",
        taskName: "",
        description: "",
        assigneeBy: currentUserName || "",
        assignedTo: "",
        assigneeId: "", // User ID for API
        dueDate: "",
        priority: "Medium" as "Low" | "Medium" | "High",
        status: "Not started" as
            | "Not started"
            | "In progress"
            | "Done"
            | "Cancelled",
    });
    const [editedTask, setEditedTask] = useState<MyTask | null>(null);
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string>
    >({});
    const [isSaving, setIsSaving] = useState(false);
    const [isEditSaving, setIsEditSaving] = useState(false);
    const [users, setUsers] = useState<UserListItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    // Filter states
    const [assignedByFilter, setAssignedByFilter] = useState<string>("all");
    const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Dropdown open states
    const [isAssignedByFilterOpen, setIsAssignedByFilterOpen] = useState(false);
    const [isAssignedToFilterOpen, setIsAssignedToFilterOpen] = useState(false);
    const [isPriorityFilterOpen, setIsPriorityFilterOpen] = useState(false);
    const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);

    // Refs for dropdowns
    const assignedByFilterRef = useRef<HTMLDivElement | null>(null);
    const assignedToFilterRef = useRef<HTMLDivElement | null>(null);
    const priorityFilterRef = useRef<HTMLDivElement | null>(null);
    const statusFilterRef = useRef<HTMLDivElement | null>(null);

    const handleAddClick = () => {
        setShowInputRow(true);
        setValidationErrors({});
        // Reset form with current user as default and pre-fill patientId/canisterNumber if provided
        setNewTask({
            patientId: isIvfVariant ? "" : defaultPatientId || "",
            canisterNumber: isIvfVariant ? defaultCanisterNumber || "" : "",
            taskName: "",
            description: "",
            assigneeBy: currentUserName || "",
            assignedTo: "",
            assigneeId: currentUserId || "",
            dueDate: "",
            priority: "Medium",
            status: "Not started",
        });
    };

    const validateTask = (): boolean => {
        const requiredFields: Record<string, string> = {
            taskName: TASK_FIELD_ERRORS.taskName,
            description: TASK_FIELD_ERRORS.description,
            dueDate: TASK_FIELD_ERRORS.dueDate,
            assigneeId: TASK_FIELD_ERRORS.assigneeId,
        };

        // CGT uses patient_id, IVF uses canister_number
        if (isIvfVariant) {
            requiredFields.canisterNumber = TASK_FIELD_ERRORS.canisterNumber;
        } else {
            requiredFields.patientId = TASK_FIELD_ERRORS.patientId;
        }

        const errors: Record<string, string> = {};

        Object.entries(requiredFields).forEach(([key, message]) => {
            const value = newTask[key as keyof typeof newTask];
            if (!value || !String(value).trim()) {
                // Map assigneeId validation to assigneeBy UI field for error rendering
                const errorKey = key === "assigneeId" ? "assigneeBy" : key;
                errors[errorKey] = message;
            }
        });

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSaveAdd = async () => {
        // Validate all fields
        if (!validateTask()) {
            return;
        }

        setIsSaving(true);
        try {
            const normalizedCanisterNumber = newTask.canisterNumber.trim();
            const normalizedTankId =
                isIvfVariant && Number.isFinite(defaultTankId)
                    ? Number(defaultTankId)
                    : undefined;

            // Map frontend fields to API format
            // assignee_id should be the user_id (string) to assign the task to
            // For now, we default to current user (self-assignment)
            const taskData = {
                task_name: newTask.taskName.trim(),
                description: newTask.description.trim(),
                assignee_id: newTask.assigneeId || currentUserId, // Use assigneeId or fallback to current user
                patient_id: isIvfVariant
                    ? undefined
                    : newTask.patientId.trim() || undefined,
                tank_id: isIvfVariant ? normalizedTankId : undefined,
                tank_code:
                    isIvfVariant && normalizedTankId === undefined
                        ? normalizedCanisterNumber || undefined
                        : undefined,
                due_date: newTask.dueDate
                    ? new Date(newTask.dueDate).toISOString()
                    : undefined,
                priority: newTask.priority,
                status: newTask.status as
                    | "Not started"
                    | "In progress"
                    | "Done",
            };

            // Call API to create task
            await tasksService.createTask(taskData);

            // Call the onAdd callback if provided
            if (onAdd) {
                onAdd();
            }

            // Call callback to refresh tasks
            if (onTaskCreated) {
                onTaskCreated();
            }

            // Reset the input row and new task
            setShowInputRow(false);
            setValidationErrors({});
            setNewTask({
                patientId: "",
                canisterNumber: "",
                taskName: "",
                description: "",
                assigneeBy: currentUserName || "",
                assignedTo: "",
                assigneeId: currentUserId || "",
                dueDate: "",
                priority: "Medium",
                status: "Not started",
            });
        } catch {
            setValidationErrors({
                submit: "Failed to create task. Please try again.",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelAdd = () => {
        // Reset the input row and new task
        setShowInputRow(false);
        setValidationErrors({});
        setNewTask({
            patientId: "",
            canisterNumber: "",
            taskName: "",
            description: "",
            assigneeBy: currentUserName || "",
            assignedTo: "",
            assigneeId: currentUserId || "",
            dueDate: "",
            priority: "Medium",
            status: "Not started",
        });
    };

    const handleInputChange = (field: keyof typeof newTask, value: string) => {
        setNewTask((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleEditInputChange = (field: keyof MyTask, value: string) => {
        if (editedTask) {
            setEditedTask((prev) =>
                prev
                    ? {
                          ...prev,
                          [field]: value,
                      }
                    : null,
            );
        }
    };

    const handleSaveEdit = async () => {
        if (editedTask && onEdit) {
            setIsEditSaving(true);
            try {
                let assigneeId = editedTask.assigneeId;
                if (!assigneeId && editedTask.assignedTo) {
                    const user = findUserByName(editedTask.assignedTo);
                    if (user) assigneeId = user.user_id;
                }
                const taskToSave = assigneeId
                    ? { ...editedTask, assigneeId, status: editedTask.status }
                    : { ...editedTask, status: editedTask.status };
                await onEdit(taskToSave);
            } finally {
                setIsEditSaving(false);
            }
        }
        setEditingTaskId(null);
        setEditedTask(null);
    };

    const handleCancelEdit = () => {
        setEditingTaskId(null);
        setEditedTask(null);
    };

    // Fetch users list when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchUsers();
        }
    }, [isOpen]);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const response = await userService.getAllUsersInCompany();
            setUsers(response.users || []);
        } catch {
            setUsers([]);
        } finally {
            setLoadingUsers(false);
        }
    };

    // Helper function to find user by full name
    const findUserByName = (fullName: string): UserListItem | undefined => {
        return users.find((u) => {
            const userFullName = `${u.first_name} ${u.last_name}`.trim();
            return userFullName.toLowerCase() === fullName.toLowerCase();
        });
    };

    // Update form when user info changes
    useEffect(() => {
        if (!showInputRow) {
            setNewTask((prev) => ({
                ...prev,
                assigneeBy: currentUserName || prev.assigneeBy,
                assigneeId: currentUserId || prev.assigneeId,
            }));
        }
    }, [currentUserName, currentUserId, showInputRow]);

    // Reset input row and edit mode when modal closes
    useEffect(() => {
        if (!isOpen) {
            setShowInputRow(false);
            setEditingTaskId(null);
            setEditedTask(null);
            setDeletedTaskIds(new Set());
            setValidationErrors({});
            setAssignedByFilter("all");
            setAssignedToFilter("all");
            setPriorityFilter("all");
            setStatusFilter("all");
            setIsAssignedByFilterOpen(false);
            setIsAssignedToFilterOpen(false);
            setIsPriorityFilterOpen(false);
            setIsStatusFilterOpen(false);
            setNewTask({
                patientId: "",
                canisterNumber: "",
                taskName: "",
                description: "",
                assigneeBy: currentUserName || "",
                assignedTo: "",
                assigneeId: currentUserId || "",
                dueDate: "",
                priority: "Medium",
                status: "Not started",
            });
        }
    }, [isOpen, currentUserName, currentUserId]);

    // Onboarding: pre-fill the new task form with valid demo data so the
    // user can click Save without hitting validation errors.
    useEffect(() => {
        const handler = () => {
            setShowInputRow(true);
            setValidationErrors({});
            setNewTask({
                patientId: "",
                canisterNumber: defaultCanisterNumber || "T-161",
                taskName: "Schedule LN2 top-up",
                description: "LN2 level approaching L1 threshold. Top-up required.",
                assigneeBy: currentUserName || "Demo User",
                assignedTo: currentUserName || "Demo User",
                assigneeId: currentUserId || "USR-DEMO",
                dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
                priority: "High",
                status: "Not started",
            });
        };
        document.addEventListener("onboarding:prefill-task-form", handler);
        return () => document.removeEventListener("onboarding:prefill-task-form", handler);
    }, [currentUserName, currentUserId, defaultCanisterNumber]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                assignedByFilterRef.current &&
                !assignedByFilterRef.current.contains(event.target as Node)
            ) {
                setIsAssignedByFilterOpen(false);
            }
            if (
                assignedToFilterRef.current &&
                !assignedToFilterRef.current.contains(event.target as Node)
            ) {
                setIsAssignedToFilterOpen(false);
            }
            if (
                priorityFilterRef.current &&
                !priorityFilterRef.current.contains(event.target as Node)
            ) {
                setIsPriorityFilterOpen(false);
            }
            if (
                statusFilterRef.current &&
                !statusFilterRef.current.contains(event.target as Node)
            ) {
                setIsStatusFilterOpen(false);
            }
        };

        if (
            isAssignedByFilterOpen ||
            isAssignedToFilterOpen ||
            isPriorityFilterOpen ||
            isStatusFilterOpen
        ) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
            };
        }
    }, [
        isAssignedByFilterOpen,
        isAssignedToFilterOpen,
        isPriorityFilterOpen,
        isStatusFilterOpen,
    ]);

    // Filter out deleted tasks and apply filters
    // Ensure tasks is always an array
    const tasksArray = Array.isArray(tasks) ? tasks : [];
    const visibleTasks = tasksArray.filter((task) => {
        // Filter out deleted tasks
        if (deletedTaskIds.has(task.id)) {
            return false;
        }
        // Apply assignedBy filter
        if (
            assignedByFilter !== "all" &&
            task.assigneeBy !== assignedByFilter
        ) {
            return false;
        }
        // Apply assignedTo filter
        if (
            assignedToFilter !== "all" &&
            task.assignedTo !== assignedToFilter
        ) {
            return false;
        }
        // Apply priority filter
        if (priorityFilter !== "all" && task.priority !== priorityFilter) {
            return false;
        }
        // Apply status filter
        if (statusFilter !== "all" && task.status !== statusFilter) {
            return false;
        }
        return true;
    });

    // Get unique values for filters
    const uniqueAssignedBy = Array.from(
        new Set(tasksArray.map((t) => t.assigneeBy).filter(Boolean)),
    ).sort();
    const uniqueAssignedTo = Array.from(
        new Set(tasksArray.map((t) => t.assignedTo).filter(Boolean)),
    ).sort();
    const priorities: ("Low" | "Medium" | "High")[] = ["Low", "Medium", "High"];
    const statuses: ("Not started" | "In progress" | "Done" | "Cancelled")[] = [
        "Not started",
        "In progress",
        "Done",
        "Cancelled",
    ];

    // Helper function to check if task is created by current user
    const isTaskCreatedByMe = (task: MyTask): boolean => {
        return (
            task.assigneeBy?.trim().toLowerCase() ===
            currentUserName?.trim().toLowerCase()
        );
    };

    // Helper function to check if task is assigned to current user
    const isTaskAssignedToMe = (task: MyTask): boolean => {
        return (
            task.assignedTo?.trim().toLowerCase() ===
            currentUserName?.trim().toLowerCase()
        );
    };

    // Helper function to check if user can edit this task
    const canEditTask = (task: MyTask): boolean => {
        return isTaskCreatedByMe(task) || isTaskAssignedToMe(task);
    };

    // Helper function to get editable fields for a task
    const getEditableFields = (task: MyTask): Set<string> => {
        if (isTaskCreatedByMe(task)) {
            return new Set(["taskName", "description", "status"]);
        } else if (isTaskAssignedToMe(task)) {
            return new Set(["status"]);
        }
        return new Set();
    };

    return (
        <AlertCard
            isOpen={isOpen}
            onClose={onClose}
            id={id}
            title={
                variant === "track"
                    ? "My Tasks (Track & Trace)"
                    : variant === "ivf"
                      ? "My Tasks (Cryocan Quality Tracking)"
                      : "My Tasks"
            }
            description="Manage and track your assigned tasks"
            icon={
                <img
                    src={MyTasksIcon}
                    alt="My Tasks"
                    className="w-[24px] h-[24px]"
                />
            }
            headerAction={
                onAdd && (!isUserRole || isIvfVariant) ? (
                    <button
                        id="onboarding-my-tasks-add-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAddClick();
                        }}
                        className="px-4 py-2 bg-[#6b1176] hover:bg-[#8b2a96] text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                            />
                        </svg>
                        ADD
                    </button>
                ) : undefined
            }
            containerClassName="w-full max-w-[750px]"
            contentHeightClassName="md:h-[520px]"
            loading={loading}
            loadingText="Loading tasks..."
            emptyText="No tasks found"
            dataLength={
                showInputRow
                    ? Math.max(visibleTasks.length, 1)
                    : Math.max(visibleTasks.length, 1)
            }
        >
            {validationErrors.submit && (
                <div className="px-4 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm mb-4">
                    {validationErrors.submit}
                </div>
            )}
            <div ref={scrollContainerRef}>
                <style>{`
                  input[type="date"]::-webkit-calendar-picker-indicator {
                    cursor: pointer;
                    filter: invert(27%) sepia(51%) saturate(2878%) hue-rotate(270deg) brightness(94%) contrast(97%);
                  }
                  input[type="date"]:not(:placeholder-shown) {
                    color: #6b1176;
                    font-weight: 500;
                  }
                  input[type="date"] { color-scheme: light; }
                `}</style>

                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#eeeeee] bg-[#faf5ff]">
                    {/* Assigned by filter */}
                    <div className="relative" ref={assignedByFilterRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsAssignedByFilterOpen(!isAssignedByFilterOpen); }}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                assignedByFilter !== "all"
                                    ? "bg-[#6b1176] text-white border-[#6b1176]"
                                    : "bg-white text-gray-600 border-gray-300 hover:border-[#6b1176] hover:text-[#6b1176]"
                            }`}
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            Assigned by{assignedByFilter !== "all" ? `: ${assignedByFilter}` : ""}
                        </button>
                        {isAssignedByFilterOpen && (
                            <div className="absolute left-0 top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] max-h-60 overflow-y-auto flex flex-col">
                                <button onClick={() => { setAssignedByFilter("all"); setIsAssignedByFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${assignedByFilter === "all" ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>All</button>
                                {uniqueAssignedBy.map((name) => (
                                    <button key={name} onClick={() => { setAssignedByFilter(name); setIsAssignedByFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${assignedByFilter === name ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>{name}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Assigned to filter */}
                    <div className="relative" ref={assignedToFilterRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsAssignedToFilterOpen(!isAssignedToFilterOpen); }}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                assignedToFilter !== "all"
                                    ? "bg-[#6b1176] text-white border-[#6b1176]"
                                    : "bg-white text-gray-600 border-gray-300 hover:border-[#6b1176] hover:text-[#6b1176]"
                            }`}
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            Assigned to{assignedToFilter !== "all" ? `: ${assignedToFilter}` : ""}
                        </button>
                        {isAssignedToFilterOpen && (
                            <div className="absolute left-0 top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] max-h-60 overflow-y-auto flex flex-col">
                                <button onClick={() => { setAssignedToFilter("all"); setIsAssignedToFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${assignedToFilter === "all" ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>All</button>
                                {uniqueAssignedTo.map((name) => (
                                    <button key={name} onClick={() => { setAssignedToFilter(name); setIsAssignedToFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${assignedToFilter === name ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>{name}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Priority filter */}
                    <div className="relative" ref={priorityFilterRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsPriorityFilterOpen(!isPriorityFilterOpen); }}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                priorityFilter !== "all"
                                    ? "bg-[#6b1176] text-white border-[#6b1176]"
                                    : "bg-white text-gray-600 border-gray-300 hover:border-[#6b1176] hover:text-[#6b1176]"
                            }`}
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            Priority{priorityFilter !== "all" ? `: ${priorityFilter}` : ""}
                        </button>
                        {isPriorityFilterOpen && (
                            <div className="absolute left-0 top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] flex flex-col">
                                <button onClick={() => { setPriorityFilter("all"); setIsPriorityFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${priorityFilter === "all" ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>All</button>
                                {priorities.map((p) => (
                                    <button key={p} onClick={() => { setPriorityFilter(p); setIsPriorityFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${priorityFilter === p ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>{p}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Status filter */}
                    <div className="relative" ref={statusFilterRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsStatusFilterOpen(!isStatusFilterOpen); }}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                statusFilter !== "all"
                                    ? "bg-[#6b1176] text-white border-[#6b1176]"
                                    : "bg-white text-gray-600 border-gray-300 hover:border-[#6b1176] hover:text-[#6b1176]"
                            }`}
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            Status{statusFilter !== "all" ? `: ${statusFilter}` : ""}
                        </button>
                        {isStatusFilterOpen && (
                            <div className="absolute left-0 top-full mt-1 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] flex flex-col">
                                <button onClick={() => { setStatusFilter("all"); setIsStatusFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${statusFilter === "all" ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>All</button>
                                {statuses.map((s) => (
                                    <button key={s} onClick={() => { setStatusFilter(s); setIsStatusFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${statusFilter === s ? "bg-[#6b1176] text-white" : "text-[#6b1176] hover:bg-gray-100"}`}>{s}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Clear filters */}
                    {(assignedByFilter !== "all" || assignedToFilter !== "all" || priorityFilter !== "all" || statusFilter !== "all") && (
                        <button
                            onClick={() => { setAssignedByFilter("all"); setAssignedToFilter("all"); setPriorityFilter("all"); setStatusFilter("all"); }}
                            className="text-xs text-gray-500 hover:text-[#6b1176] underline ml-1"
                        >
                            Clear all
                        </button>
                    )}
                </div>

                {/* New task form card */}
                {showInputRow && (
                    <div id="onboarding-my-tasks-input-row" className="mx-4 mt-4 mb-2 border border-[#6b1176] rounded-xl bg-purple-50 p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">{isIvfVariant ? "Canister ID" : "Patient ID"}</label>
                                <input
                                    type="text"
                                    value={isIvfVariant ? newTask.canisterNumber : newTask.patientId}
                                    onChange={(e) => handleInputChange(isIvfVariant ? "canisterNumber" : "patientId", e.target.value)}
                                    placeholder={isIvfVariant ? "Canister ID" : "Patient ID"}
                                    readOnly
                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg bg-white text-gray-700 cursor-not-allowed focus:outline-none ${(isIvfVariant ? validationErrors.canisterNumber : validationErrors.patientId) ? "border-red-400" : "border-gray-300"}`}
                                />
                                {(isIvfVariant ? validationErrors.canisterNumber : validationErrors.patientId) && <p className="text-xs text-red-500 mt-0.5">{isIvfVariant ? validationErrors.canisterNumber : validationErrors.patientId}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">Task Name</label>
                                <input
                                    type="text"
                                    value={newTask.taskName}
                                    onChange={(e) => handleInputChange("taskName", e.target.value)}
                                    placeholder="Task Name"
                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 ${validationErrors.taskName ? "border-red-400" : "border-gray-300"}`}
                                />
                                {validationErrors.taskName && <p className="text-xs text-red-500 mt-0.5">{validationErrors.taskName}</p>}
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">Description</label>
                                <input
                                    type="text"
                                    value={newTask.description}
                                    onChange={(e) => handleInputChange("description", e.target.value)}
                                    placeholder="Description"
                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 ${validationErrors.description ? "border-red-400" : "border-gray-300"}`}
                                />
                                {validationErrors.description && <p className="text-xs text-red-500 mt-0.5">{validationErrors.description}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">Assigned by</label>
                                <input type="text" value={newTask.assigneeBy} disabled className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed select-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">Assign to</label>
                                <select
                                    value={newTask.assigneeId || ""}
                                    onChange={(e) => {
                                        const selectedUserId = e.target.value;
                                        const selectedUser = users.find((u) => u.user_id === selectedUserId);
                                        handleInputChange("assigneeId", selectedUserId);
                                        handleInputChange("assignedTo", selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}`.trim() : "");
                                    }}
                                    disabled={loadingUsers}
                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 ${validationErrors.assignedTo ? "border-red-400" : "border-gray-300"} ${loadingUsers ? "bg-gray-100 cursor-not-allowed" : ""}`}
                                >
                                    <option value="">Select a user</option>
                                    {users.map((user) => (
                                        <option key={user.user_id} value={user.user_id}>{user.first_name} {user.last_name}</option>
                                    ))}
                                </select>
                                {validationErrors.assignedTo && <p className="text-xs text-red-500 mt-0.5">{validationErrors.assignedTo}</p>}
                                {validationErrors.assigneeBy && <p className="text-xs text-red-500 mt-0.5">{validationErrors.assigneeBy}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">Due Date</label>
                                <input
                                    type="date"
                                    value={newTask.dueDate}
                                    onChange={(e) => handleInputChange("dueDate", e.target.value)}
                                    min={new Date().toISOString().split("T")[0]}
                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 ${validationErrors.dueDate ? "border-red-400" : "border-gray-300"}`}
                                />
                                {validationErrors.dueDate && <p className="text-xs text-red-500 mt-0.5">{validationErrors.dueDate}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#6b1176] mb-1">Priority</label>
                                <select
                                    value={newTask.priority}
                                    onChange={(e) => handleInputChange("priority", e.target.value)}
                                    className={`w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 font-semibold ${newTask.priority === "High" ? "bg-red-50 text-red-800" : newTask.priority === "Medium" ? "bg-orange-50 text-orange-800" : "bg-green-50 text-green-800"}`}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-purple-200">
                            <button
                                id="onboarding-my-tasks-save-btn"
                                onClick={handleSaveAdd}
                                disabled={isSaving}
                                className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${isSaving ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-[#6b1176] text-white hover:bg-[#8b2a96]"}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Save
                            </button>
                            <button
                                onClick={handleCancelAdd}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Card list */}
                <div className="flex flex-col gap-3 p-4">
                    {visibleTasks.length === 0 && !showInputRow && (
                        <div className="text-center text-gray-500 text-sm py-8">No tasks match the current filters</div>
                    )}
                    {visibleTasks.map((task) => {
                        const isEditing = editingTaskId === task.id;
                        const displayTask = isEditing && editedTask ? editedTask : task;
                        const canEdit = canEditTask(task);
                        const editableFields = getEditableFields(task);
                        const isCreatedByMe = isTaskCreatedByMe(task);

                        const priorityAccent = task.priority === "High"
                            ? "bg-red-50/40"
                            : task.priority === "Medium"
                            ? "bg-orange-50/40"
                            : "bg-green-50/40";

                        return (
                            <div
                                key={task.id}
                                className={`border rounded-xl p-4 shadow-sm transition-all ${isEditing ? "border-[#6b1176] bg-purple-50" : `border-gray-200 ${priorityAccent} hover:shadow-md`}`}
                            >
                                {/* Card header */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                            {task.tankCode || (isIvfVariant ? task.canisterNumber || "N/A" : task.patientId)}
                                        </span>
                                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${task.priority === "High" ? "bg-red-100 text-red-700 ring-1 ring-red-300" : task.priority === "Medium" ? "bg-orange-100 text-orange-700 ring-1 ring-orange-300" : "bg-green-100 text-green-700 ring-1 ring-green-300"}`}>
                                            {task.priority}
                                        </span>
                                        {isEditing && editableFields.has("status") ? (
                                            <select
                                                value={displayTask.status}
                                                onChange={(e) => handleEditInputChange("status", e.target.value as "Not started" | "In progress" | "Done" | "Cancelled")}
                                                className={`px-2 py-0.5 text-xs font-semibold border rounded-full focus:outline-none focus:ring-1 focus:ring-purple-300 ${displayTask.status === "Done" ? "bg-green-100 text-green-800 border-green-300" : displayTask.status === "In progress" ? "bg-blue-100 text-blue-800 border-blue-300" : displayTask.status === "Cancelled" ? "bg-red-100 text-red-800 border-red-300" : "bg-gray-100 text-gray-800 border-gray-300"}`}
                                            >
                                                <option value="Not started">Not started</option>
                                                <option value="In progress">In progress</option>
                                                <option value="Done">Done</option>
                                                <option value="Cancelled">Cancelled</option>
                                            </select>
                                        ) : (
                                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${task.status === "Done" ? "bg-green-100 text-green-800" : task.status === "In progress" ? "bg-blue-100 text-blue-800" : task.status === "Cancelled" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                                                {task.status}
                                            </span>
                                        )}
                                    </div>
                                    {(variant === "track" || variant === "ivf") && canEdit && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            {isEditing ? (
                                                <>
                                                    <button onClick={handleSaveEdit} disabled={isEditSaving} className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${isEditSaving ? "text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed" : "text-green-700 bg-green-50 border-green-300 hover:bg-green-100"}`} title="Save changes">
                                                        {isEditSaving ? (
                                                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                                        ) : (
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                        )}
                                                        {isEditSaving ? "Saving..." : "Save"}
                                                    </button>
                                                    <button onClick={handleCancelEdit} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" title="Cancel">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditingTaskId(task.id);
                                                        const formattedTask = { ...task };
                                                        if (task.dueDate && task.dueDate !== "N/A") {
                                                            try {
                                                                const dateObj = new Date(task.dueDate);
                                                                if (!isNaN(dateObj.getTime())) {
                                                                    const year = dateObj.getFullYear();
                                                                    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
                                                                    const day = String(dateObj.getDate()).padStart(2, "0");
                                                                    formattedTask.dueDate = `${year}-${month}-${day}`;
                                                                }
                                                            } catch { formattedTask.dueDate = task.dueDate; }
                                                        }
                                                        setEditedTask(formattedTask);
                                                    }}
                                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:border-[#6b1176] hover:text-[#6b1176] transition-colors"
                                                    title={isCreatedByMe ? "Edit task" : "Edit status"}
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                                                    Edit
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Task name */}
                                {isEditing && editableFields.has("taskName") ? (
                                    <input type="text" value={displayTask.taskName || ""} onChange={(e) => handleEditInputChange("taskName", e.target.value)} className="w-full px-2 py-1 text-sm font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 mb-1" />
                                ) : (
                                    <p className="text-sm font-semibold text-[#333] mb-1" title={task.taskName}>{task.taskName}</p>
                                )}

                                {/* Description */}
                                {isEditing && editableFields.has("description") ? (
                                    <input type="text" value={displayTask.description || ""} onChange={(e) => handleEditInputChange("description", e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 mb-2 text-gray-600" />
                                ) : (
                                    <p className="text-xs text-gray-500 mb-3" title={task.description}>{task.description}</p>
                                )}

                                {/* Meta row */}
                                <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-gray-100">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Assigned by</p>
                                        <p className="text-xs text-gray-700 truncate">{task.assigneeBy || "—"}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Assigned to</p>
                                        {isEditing && editableFields.has("assignedTo") ? (
                                            <select
                                                value={(() => { const u = findUserByName(displayTask.assignedTo || ""); return u?.user_id || ""; })()}
                                                onChange={(e) => {
                                                    const selectedUserId = e.target.value;
                                                    const selectedUser = users.find((u) => u.user_id === selectedUserId);
                                                    if (selectedUser && editedTask) {
                                                        setEditedTask({ ...editedTask, assignedTo: `${selectedUser.first_name} ${selectedUser.last_name}`.trim(), assigneeId: selectedUserId });
                                                    }
                                                }}
                                                className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-200"
                                            >
                                                <option value="">Select a user</option>
                                                {users.map((user) => <option key={user.user_id} value={user.user_id}>{user.first_name} {user.last_name}</option>)}
                                            </select>
                                        ) : (
                                            <p className="text-xs text-gray-700 truncate">{task.assignedTo || "—"}</p>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Due date</p>
                                        {isEditing && editableFields.has("dueDate") ? (
                                            <input type="date" value={displayTask.dueDate || ""} onChange={(e) => handleEditInputChange("dueDate", e.target.value)} min={new Date().toISOString().split("T")[0]} className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-200" />
                                        ) : (
                                            <p className="text-xs text-gray-700">{task.dueDate || "—"}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AlertCard>
    );
};

export default MyTasksModal;
