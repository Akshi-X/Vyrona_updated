import React, { useState, useEffect, useRef } from 'react';
import AlertCard from '../AlertCard';
import { tasksService } from '../../services/tasksService';
import { userService } from '../../services/userService';
import type { UserListItem } from '../../services/userService';
import { TASK_FIELD_ERRORS } from '../../constants/validation';

// MyTasksModal component with API integration

export interface MyTask {
  id: string;
  patientId: string;
  taskName: string;
  description: string;
  assigneeBy: string;
  assignedTo: string;
  dueDate: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Not started' | 'In progress' | 'Done';
}

interface MyTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: MyTask[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (task: MyTask) => void;
  onDelete?: (taskId: string) => void;
  variant?: 'dashboard' | 'track'; // Add variant to differentiate between Dashboard and Track & Trace
  currentUserName?: string; // Current user's full name for "Assigned by" field
  currentUserId?: string; // Current user's ID
  onTaskCreated?: () => void; // Callback to refresh tasks after creation
  userRole?: string; // User's role for role-based access control
}

const MyTasksModal: React.FC<MyTasksModalProps> = ({
  isOpen,
  onClose,
  tasks,
  loading = false,
  onAdd,
  onEdit,
  onDelete: _onDelete, // Reserved for future delete functionality
  variant = 'dashboard',
  currentUserName = '',
  currentUserId = '',
  onTaskCreated,
  userRole = ''
}) => {
  const isUserRole = userRole?.toLowerCase() === 'user';
  const [showInputRow, setShowInputRow] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(new Set());
  const [newTask, setNewTask] = useState({
    patientId: '',
    taskName: '',
    description: '',
    assigneeBy: currentUserName || '',
    assignedTo: '',
    assigneeId: '', // User ID for API
    dueDate: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    status: 'Not started' as 'Not started' | 'In progress' | 'Done'
  });
  const [editedTask, setEditedTask] = useState<MyTask | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const statusCellRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleAddClick = () => {
    setShowInputRow(true);
    setValidationErrors({});
    // Reset form with current user as default
    setNewTask({
      patientId: '',
      taskName: '',
      description: '',
      assigneeBy: currentUserName || '',
      assignedTo: '',
      assigneeId: currentUserId || '',
      dueDate: '',
      priority: 'Medium',
      status: 'Not started'
    });
  };

  const validateTask = (): boolean => {
    const requiredFields: Record<string, string> = {
      taskName: TASK_FIELD_ERRORS.taskName,
      description: TASK_FIELD_ERRORS.description,
      patientId: TASK_FIELD_ERRORS.patientId,
      dueDate: TASK_FIELD_ERRORS.dueDate,
      assigneeId: TASK_FIELD_ERRORS.assigneeId,
    };

    const errors: Record<string, string> = {};

    Object.entries(requiredFields).forEach(([key, message]) => {
      const value = newTask[key as keyof typeof newTask];
      if (!value || !String(value).trim()) {
        // Map assigneeId validation to assigneeBy UI field for error rendering
        const errorKey = key === 'assigneeId' ? 'assigneeBy' : key;
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
      // Map frontend fields to API format
      // assignee_id should be the user_id (string) to assign the task to
      // For now, we default to current user (self-assignment)
      const taskData = {
        task_name: newTask.taskName.trim(),
        description: newTask.description.trim(),
        assignee_id: newTask.assigneeId || currentUserId, // Use assigneeId or fallback to current user
        patient_id: newTask.patientId.trim() || undefined,
        due_date: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined,
        priority: newTask.priority,
        status: newTask.status as 'Not started' | 'In progress' | 'Done'
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
        patientId: '',
        taskName: '',
        description: '',
        assigneeBy: currentUserName || '',
        assignedTo: '',
        assigneeId: currentUserId || '',
        dueDate: '',
        priority: 'Medium',
        status: 'Not started'
      });
    } catch (error) {
      console.error('Error creating task:', error);
      setValidationErrors({ submit: 'Failed to create task. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelAdd = () => {
    // Reset the input row and new task
    setShowInputRow(false);
    setValidationErrors({});
    setNewTask({
      patientId: '',
      taskName: '',
      description: '',
      assigneeBy: currentUserName || '',
      assignedTo: '',
      assigneeId: currentUserId || '',
      dueDate: '',
      priority: 'Medium',
      status: 'Not started'
    });
  };

  const handleInputChange = (field: keyof typeof newTask, value: string) => {
    setNewTask(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEditInputChange = (field: keyof MyTask, value: string) => {
    if (editedTask) {
      setEditedTask(prev => prev ? ({
        ...prev,
        [field]: value
      }) : null);
    }
  };

  const handleSaveEdit = () => {
    if (editedTask && onEdit) {
      // Find assigneeId from the selected user name if not already stored
      let assigneeId = (editedTask as any).assigneeId;
      if (!assigneeId && editedTask.assignedTo) {
        const user = findUserByName(editedTask.assignedTo);
        if (user) {
          assigneeId = user.user_id;
        }
      }
      // Pass the task with assigneeId if available, ensuring status is included
      const taskToSave = assigneeId 
        ? { ...editedTask, ...({ assigneeId } as any), status: editedTask.status }
        : { ...editedTask, status: editedTask.status };
      onEdit(taskToSave);
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
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Helper function to find user by full name
  const findUserByName = (fullName: string): UserListItem | undefined => {
    return users.find(u => {
      const userFullName = `${u.first_name} ${u.last_name}`.trim();
      return userFullName.toLowerCase() === fullName.toLowerCase();
    });
  };

  // Update form when user info changes
  useEffect(() => {
    if (!showInputRow) {
      setNewTask(prev => ({
        ...prev,
        assigneeBy: currentUserName || prev.assigneeBy,
        assigneeId: currentUserId || prev.assigneeId
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
      setNewTask({
        patientId: '',
        taskName: '',
        description: '',
        assigneeBy: currentUserName || '',
        assignedTo: '',
        assigneeId: currentUserId || '',
        dueDate: '',
        priority: 'Medium',
        status: 'Not started'
      });
    }
  }, [isOpen, currentUserName, currentUserId]);

  // Filter out deleted tasks from display
  // Ensure tasks is always an array
  const tasksArray = Array.isArray(tasks) ? tasks : [];
  const visibleTasks = tasksArray.filter(task => !deletedTaskIds.has(task.id));

  // Helper function to check if task is created by current user
  const isTaskCreatedByMe = (task: MyTask): boolean => {
    return task.assigneeBy?.trim().toLowerCase() === currentUserName?.trim().toLowerCase();
  };

  // Helper function to check if task is assigned to current user
  const isTaskAssignedToMe = (task: MyTask): boolean => {
    return task.assignedTo?.trim().toLowerCase() === currentUserName?.trim().toLowerCase();
  };

  // Helper function to check if user can edit this task
  const canEditTask = (task: MyTask): boolean => {
    return isTaskCreatedByMe(task) || isTaskAssignedToMe(task);
  };

  // Helper function to get editable fields for a task
  const getEditableFields = (task: MyTask): Set<string> => {
    if (isTaskCreatedByMe(task)) {
      // Creator can edit all fields except "Assigned by"
      return new Set(['patientId', 'taskName', 'description', 'assignedTo', 'dueDate', 'priority', 'status']);
    } else if (isTaskAssignedToMe(task)) {
      // Assignee can only edit status
      return new Set(['status']);
    }
    return new Set();
  };


  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title={variant === 'track' ? 'My Tasks (Track & Trace)' : 'My Tasks (Dashboard)'}
      description="Manage and track your assigned tasks"
      icon={
        <svg className="w-[18px] h-[18px] text-[#6b1176]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      }
      headerAction={
        onAdd && !isUserRole ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleAddClick(); }}
            className="px-4 py-2 bg-[#6b1176] hover:bg-[#8b2a96] text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            ADD
          </button>
        ) : undefined
      }
      loading={loading}
      loadingText="Loading tasks..."
      emptyText="No tasks found"
      dataLength={visibleTasks.length}
    >
      {validationErrors.submit && (
        <div className="px-4 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm mb-4">
          {validationErrors.submit}
        </div>
      )}
      <div className="relative" ref={scrollContainerRef}>
        <style>{`
          /* Date picker styling - purple selected date */
          input[type="date"]::-webkit-calendar-picker-indicator {
            cursor: pointer;
            filter: invert(27%) sepia(51%) saturate(2878%) hue-rotate(270deg) brightness(94%) contrast(97%);
          }
          input[type="date"]::-webkit-datetime-edit-text {
            color: #333;
          }
          input[type="date"]::-webkit-datetime-edit-month-field,
          input[type="date"]::-webkit-datetime-edit-day-field,
          input[type="date"]::-webkit-datetime-edit-year-field {
            color: #333;
          }
          input[type="date"]:focus::-webkit-datetime-edit-month-field,
          input[type="date"]:focus::-webkit-datetime-edit-day-field,
          input[type="date"]:focus::-webkit-datetime-edit-year-field {
            color: #6b1176;
          }
          /* Style the calendar popup - selected date purple */
          input[type="date"]::-webkit-calendar-picker-indicator:hover {
            filter: invert(27%) sepia(51%) saturate(2878%) hue-rotate(270deg) brightness(94%) contrast(97%);
          }
          /* For Firefox */
          input[type="date"] {
            color-scheme: light;
          }
          /* Additional styling for date input value */
          input[type="date"]:not(:placeholder-shown) {
            color: #6b1176;
            font-weight: 500;
          }
          .alert-card-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
          }
          .alert-card-table thead {
            position: sticky;
            top: 0;
            z-index: 30;
            background-color: rgb(250 245 255);
          }
          .alert-card-table th.sticky,
          .alert-card-table td.sticky {
            position: sticky;
            right: 0;
            background-color: inherit;
          }
          .alert-card-table thead th.sticky {
            background-color: rgb(250 245 255) !important;
            z-index: 31;
          }
          .alert-card-table tbody td.sticky {
            background-color: white !important;
            z-index: 1010;
          }
          .alert-card-table tbody tr:hover td.sticky {
            background-color: white !important;
          }
          .alert-card-table tbody tr.bg-gray-50 td.sticky {
            background-color: rgb(249 250 251) !important;
          }
          .alert-card-table th,
          .alert-card-table td {
            display: table-cell !important;
            visibility: visible !important;
            overflow: visible !important;
          }
          .alert-card-table th:not(:last-child):not(.sticky),
          .alert-card-table td:not(:last-child):not(.sticky) {
            padding-right: 20px !important;
          }
          .alert-card-table th:not(:first-child):not(.sticky),
          .alert-card-table td:not(:first-child):not(.sticky) {
            padding-left: 15px !important;
          }
        `}</style>
        <table className="alert-card-table divide-y divide-gray-200" style={{ width: '100%', tableLayout: 'auto' }}>
        <colgroup>
          <col style={{ width: 'auto', minWidth: '100px' }} />
          <col style={{ width: 'auto', minWidth: '150px' }} />
          <col style={{ width: 'auto', minWidth: '80px' }} />
          <col style={{ width: 'auto', minWidth: '130px' }} />
          <col style={{ width: 'auto', minWidth: '150px' }} />
          <col style={{ width: 'auto', minWidth: '130px' }} />
          <col style={{ width: 'auto', minWidth: '100px' }} />
          <col style={{ width: 'auto', minWidth: '100px' }} />
          {variant === 'track' && <col style={{ width: '80px', minWidth: '80px' }} />}
        </colgroup>
        <thead className="bg-[#fdeeff]">
          <tr className="border-b border-[#eeeeee]">
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Patient ID</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Task Name</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Description</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Assigned by</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Assigned to</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Due date</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Priority</th>
            <th className="p-[15px] font-semibold text-[#6b1176] text-sm text-left whitespace-nowrap">Status</th>
            {variant === 'track' && <th className="p-[15px] sticky right-0 bg-[#fdeeff] z-20"></th>}
          </tr>
        </thead>
        <tbody>
          {/* Input row for new task */}
          {showInputRow && (
            <tr className="border-b border-[#eeeeee]">
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <div>
                  <input
                    type="text"
                    value={newTask.patientId}
                    onChange={(e) => handleInputChange('patientId', e.target.value)}
                    placeholder="Patient ID"
                    required
                    className={`w-full min-w-0 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
                      validationErrors.patientId 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-purple-200'
                    }`}
                  />
                  {validationErrors.patientId && (
                    <div className="text-xs text-red-500 mt-1">{validationErrors.patientId}</div>
                  )}
                </div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <div>
                  <input
                    type="text"
                    value={newTask.taskName}
                    onChange={(e) => handleInputChange('taskName', e.target.value)}
                    placeholder="Task Name"
                    required
                    className={`w-full min-w-0 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
                      validationErrors.taskName 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-purple-200'
                    }`}
                  />
                  {validationErrors.taskName && (
                    <div className="text-xs text-red-500 mt-1">{validationErrors.taskName}</div>
                  )}
                </div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <div>
                  <input
                    type="text"
                    value={newTask.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Description"
                    required
                    className={`w-full min-w-0 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
                      validationErrors.description 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-purple-200'
                    }`}
                  />
                  {validationErrors.description && (
                    <div className="text-xs text-red-500 mt-1">{validationErrors.description}</div>
                  )}
                </div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <input
                  type="text"
                  value={newTask.assigneeBy}
                  readOnly
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700 cursor-not-allowed"
                />
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <div>
                  <select
                    value={newTask.assigneeId || ''}
                    onChange={(e) => {
                      const selectedUserId = e.target.value;
                      const selectedUser = users.find(u => u.user_id === selectedUserId);
                      handleInputChange('assigneeId', selectedUserId);
                      handleInputChange('assignedTo', selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}`.trim() : '');
                    }}
                    required
                    disabled={loadingUsers}
                    className={`w-full min-w-0 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
                      validationErrors.assignedTo 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-purple-200'
                    } ${loadingUsers ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">Select a user</option>
                    {users.map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.first_name} {user.last_name}
                      </option>
                    ))}
                  </select>
                  {validationErrors.assignedTo && (
                    <div className="text-xs text-red-500 mt-1">{validationErrors.assignedTo}</div>
                  )}
                </div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                <div>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => handleInputChange('dueDate', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    required
                    className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
                      validationErrors.dueDate 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-purple-200'
                    }`}
                  />
                  {validationErrors.dueDate && (
                    <div className="text-xs text-red-500 mt-1">{validationErrors.dueDate}</div>
                  )}
                </div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm relative" style={{ overflow: 'visible' }}>
                <div className="relative" style={{ zIndex: 1000 }}>
                  <select
                    value={newTask.priority}
                    onChange={(e) => handleInputChange('priority', e.target.value)}
                    className={`w-full px-2 py-1 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-200 text-xs font-semibold ${
                      newTask.priority === 'High' ? 'bg-red-100 text-red-800' :
                      newTask.priority === 'Medium' ? 'bg-orange-100 text-orange-800' :
                      'bg-green-100 text-green-800'
                    }`}
                    style={{ 
                      minHeight: '32px', 
                      position: 'relative', 
                      zIndex: 1000,
                      backgroundColor: newTask.priority === 'High' ? '#fee2e2' :
                                      newTask.priority === 'Medium' ? '#fed7aa' :
                                      '#dcfce7'
                    }}
                  >
                    <option value="Low" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Low</option>
                    <option value="Medium" style={{ backgroundColor: '#fed7aa', color: '#9a3412' }}>Medium</option>
                    <option value="High" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>High</option>
                  </select>
                </div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm relative" style={{ overflow: 'visible' }}>
                <div className="relative" style={{ zIndex: 1000 }}>
                  <select
                    value={newTask.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className={`w-full px-2 py-1 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-200 text-xs font-semibold ${
                      newTask.status === 'Done' ? 'bg-green-100 text-green-800' :
                      newTask.status === 'In progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}
                    style={{ 
                      minHeight: '32px', 
                      position: 'relative', 
                      zIndex: 1000,
                      backgroundColor: newTask.status === 'Done' ? '#dcfce7' :
                                      newTask.status === 'In progress' ? '#dbeafe' :
                                      '#f3f4f6'
                    }}
                  >
                    <option value="Not started" style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>Not started</option>
                    <option value="In progress" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>In progress</option>
                    <option value="Done" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Done</option>
                  </select>
                </div>
              </td>
              {variant === 'track' && (
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap text-center sticky z-10">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={handleSaveAdd}
                        disabled={isSaving}
                        className={`inline-flex items-center justify-center px-2 py-1 text-sm font-medium rounded transition-colors ${
                          isSaving 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                        }`}
                        title="Save new task"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancelAdd}
                        className="inline-flex items-center justify-center px-2 py-1 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                        title="Cancel adding task"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
              )}
            </tr>
          )}
          {visibleTasks.map((task) => {
            const isEditing = editingTaskId === task.id;
            const displayTask = isEditing && editedTask ? editedTask : task;
            const canEdit = canEditTask(task);
            const editableFields = getEditableFields(task);
            const isCreatedByMe = isTaskCreatedByMe(task);
            
            return (
              <tr key={task.id} className={`border-b border-[#eeeeee] hover:bg-white/50 ${isEditing ? 'bg-gray-50' : ''}`}>
                <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                  {isEditing && editableFields.has('patientId') ? (
                    <input
                      type="text"
                      value={displayTask.patientId || ''}
                      onChange={(e) => handleEditInputChange('patientId', e.target.value)}
                      className="w-full min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200 font-mono"
                    />
                  ) : (
                    <div className="font-mono truncate">
                {task.patientId}
                    </div>
                  )}
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                  {isEditing && editableFields.has('taskName') ? (
                    <input
                      type="text"
                      value={displayTask.taskName || ''}
                      onChange={(e) => handleEditInputChange('taskName', e.target.value)}
                      className="w-full min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                    <div className="truncate overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: '100%' }} title={task.taskName}>{task.taskName}</div>
                  )}
              </td>
                <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                  {isEditing && editableFields.has('description') ? (
                    <input
                      type="text"
                      value={displayTask.description || ''}
                      onChange={(e) => handleEditInputChange('description', e.target.value)}
                      className="w-full min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                    <div className="truncate overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: '100%' }} title={task.description}>{task.description}</div>
                  )}
              </td>
                <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                  {/* Assigned by is always read-only, even when editing */}
                  <div className="whitespace-nowrap" title={task.assigneeBy}>{task.assigneeBy}</div>
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                  {isEditing && editableFields.has('assignedTo') ? (
                    <select
                      value={(() => {
                        // Find user ID from assignedTo name
                        const user = findUserByName(displayTask.assignedTo || '');
                        return user?.user_id || '';
                      })()}
                      onChange={(e) => {
                        const selectedUserId = e.target.value;
                        const selectedUser = users.find(u => u.user_id === selectedUserId);
                        if (selectedUser && editedTask) {
                          const fullName = `${selectedUser.first_name} ${selectedUser.last_name}`.trim();
                          // Update both assignedTo name and store assigneeId in a way we can access it
                          setEditedTask({ 
                            ...editedTask, 
                            assignedTo: fullName,
                            // Store assigneeId as a property we can access later
                            ...({ assigneeId: selectedUserId } as any)
                          });
                        }
                      }}
                      className="w-full min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    >
                      <option value="">Select a user</option>
                      {users.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.first_name} {user.last_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="whitespace-nowrap" title={task.assignedTo || 'N/A'}>{task.assignedTo || 'N/A'}</div>
                  )}
              </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm">
                  {isEditing && editableFields.has('dueDate') ? (
                    <input
                      type="date"
                      value={displayTask.dueDate || ''}
                      onChange={(e) => handleEditInputChange('dueDate', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                    <div className="whitespace-nowrap" title={task.dueDate}>{task.dueDate}</div>
                  )}
                </td>
              <td className="bg-white p-[15px] font-normal text-[#333333] text-sm relative" style={{ overflow: 'hidden' }}>
                  {isEditing && editableFields.has('priority') ? (
                    <div className="relative" style={{ zIndex: 1 }}>
                      <select
                        value={displayTask.priority}
                        onChange={(e) => handleEditInputChange('priority', e.target.value)}
                        className={`w-full px-2 py-1 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-200 text-xs font-semibold ${
                          displayTask.priority === 'High' ? 'bg-red-100 text-red-800' :
                          displayTask.priority === 'Medium' ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}
                        style={{ 
                          minHeight: '32px', 
                          position: 'relative', 
                          zIndex: 1,
                          backgroundColor: displayTask.priority === 'High' ? '#fee2e2' :
                                          displayTask.priority === 'Medium' ? '#fed7aa' :
                                          '#dcfce7'
                        }}
                      >
                        <option value="Low" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Low</option>
                        <option value="Medium" style={{ backgroundColor: '#fed7aa', color: '#9a3412' }}>Medium</option>
                        <option value="High" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>High</option>
                      </select>
                    </div>
                  ) : (
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  task.priority === 'High' ? 'bg-red-100 text-red-800' :
                  task.priority === 'Medium' ? 'bg-orange-100 text-orange-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {task.priority}
                </span>
                  )}
              </td>
              <td 
                ref={(el) => { statusCellRefs.current[task.id] = el; }}
                className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap relative" 
                style={{ overflow: 'hidden' }}
              >
                  {isEditing && editableFields.has('status') ? (
                    <div className="relative" style={{ zIndex: 1 }}>
                      <select
                        value={displayTask.status}
                        onChange={(e) => {
                          const newStatus = e.target.value as 'Not started' | 'In progress' | 'Done';
                          handleEditInputChange('status', newStatus);
                        }}
                        className={`w-full px-2 py-1 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-200 text-xs font-semibold ${
                          displayTask.status === 'Done' ? 'bg-green-100 text-green-800' :
                          displayTask.status === 'In progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                        style={{ 
                          minHeight: '32px', 
                          position: 'relative', 
                          zIndex: 1,
                          backgroundColor: displayTask.status === 'Done' ? '#dcfce7' :
                                          displayTask.status === 'In progress' ? '#dbeafe' :
                                          '#f3f4f6'
                        }}
                      >
                        <option value="Not started" style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>Not started</option>
                        <option value="In progress" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>In progress</option>
                        <option value="Done" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Done</option>
                      </select>
                    </div>
                  ) : (
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  task.status === 'Done' ? 'bg-green-100 text-green-800' :
                  task.status === 'In progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {task.status}
                </span>
                  )}
              </td>
              {variant === 'track' && (
                <td className="bg-white p-[15px] font-normal text-[#333333] text-sm whitespace-nowrap text-right sticky" style={{ zIndex: 1010 }}>
                  {canEdit && (
                  <>
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="inline-flex items-center justify-center px-2 py-1 text-sm font-medium text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                            title="Save changes"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="inline-flex items-center justify-center px-2 py-1 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                            title="Cancel editing"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingTaskId(task.id);
                            // Convert dueDate to YYYY-MM-DD format for date input
                            const formattedTask = { ...task };
                            if (task.dueDate && task.dueDate !== 'N/A') {
                              try {
                                // Try to parse the date - handle both locale format and ISO format
                                const dateObj = new Date(task.dueDate);
                                if (!isNaN(dateObj.getTime())) {
                                  // Format as YYYY-MM-DD for HTML date input
                                  const year = dateObj.getFullYear();
                                  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                                  const day = String(dateObj.getDate()).padStart(2, '0');
                                  formattedTask.dueDate = `${year}-${month}-${day}`;
                                }
                              } catch (e) {
                                // If parsing fails, keep original value
                                formattedTask.dueDate = task.dueDate;
                              }
                            }
                            setEditedTask(formattedTask);
                            // If user is not the creator (only status is editable), scroll to status column
                            if (!isCreatedByMe) {
                              setTimeout(() => {
                                const statusCell = statusCellRefs.current[task.id];
                                if (statusCell) {
                                  // Find the scrollable container (parent with overflow-x-auto)
                                  let container: HTMLElement | null = statusCell.parentElement;
                                  while (container && !container.classList.contains('overflow-x-auto')) {
                                    container = container.parentElement;
                                  }
                                  if (container) {
                                    const cellRect = statusCell.getBoundingClientRect();
                                    const containerRect = container.getBoundingClientRect();
                                    const scrollLeft = container.scrollLeft + (cellRect.left - containerRect.left) - (containerRect.width / 2) + (cellRect.width / 2);
                                    container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
                                  }
                                }
                              }, 100);
                            }
                          }}
                          className="inline-flex items-center justify-center px-2 py-1 text-gray-600 hover:text-gray-800 rounded transition-colors"
                          title={isCreatedByMe ? "Edit task" : "Edit status"}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                          </svg>
                        </button>
                      )}
                    </>
                    )}
              </td>
                )}
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </AlertCard>
  );
};

export default MyTasksModal;
