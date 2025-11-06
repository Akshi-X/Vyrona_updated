import React, { useState, useEffect } from 'react';
import AlertCard from '../AlertCard';
import { tasksService } from '../../services/tasksService';

// MyTasksModal component with API integration

export interface MyTask {
  id: string;
  patientId: string;
  taskName: string;
  description: string;
  assigneeBy: string;
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
  onDelete,
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
    assigneeId: '', // User ID for API
    dueDate: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    status: 'Not started' as 'Not started' | 'In progress' | 'Done'
  });
  const [editedTask, setEditedTask] = useState<MyTask | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleAddClick = () => {
    setShowInputRow(true);
    setValidationErrors({});
    // Reset form with current user as default
    setNewTask({
      patientId: '',
      taskName: '',
      description: '',
      assigneeBy: currentUserName || '',
      assigneeId: currentUserId || '',
      dueDate: '',
      priority: 'Medium',
      status: 'Not started'
    });
  };

  const validateTask = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!newTask.taskName || !newTask.taskName.trim()) {
      errors.taskName = 'Task name is required';
    }
    
    if (!newTask.description || !newTask.description.trim()) {
      errors.description = 'Description is required';
    }
    
    if (!newTask.patientId || !newTask.patientId.trim()) {
      errors.patientId = 'Patient ID is required';
    }
    
    if (!newTask.dueDate || !newTask.dueDate.trim()) {
      errors.dueDate = 'Due date is required';
    }
    
    if (!newTask.assigneeId || !newTask.assigneeId.trim()) {
      errors.assigneeBy = 'Assignee is required';
    }
    
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
      onEdit(editedTask);
    }
    setEditingTaskId(null);
    setEditedTask(null);
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditedTask(null);
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
        assigneeId: currentUserId || '',
        dueDate: '',
        priority: 'Medium',
        status: 'Not started'
      });
    }
  }, [isOpen, currentUserName, currentUserId]);

  // Filter out deleted tasks from display
  const visibleTasks = tasks.filter(task => !deletedTaskIds.has(task.id));

  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title={variant === 'track' ? 'My Tasks (Track & Trace)' : 'My Tasks (Dashboard)'}
      description="Manage and track your assigned tasks"
      icon={
        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      }
      headerAction={
        onAdd && !isUserRole ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleAddClick(); }}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1"
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
      <table className="alert-card-table w-full divide-y divide-gray-200 table-fixed">
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          {variant === 'track' && (
            <>
              <col style={{ width: '6%' }} />
            </>
          )}
        </colgroup>
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Patient ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Task Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Description</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Assigned by</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Due date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider bg-purple-50">Status</th>
            {variant === 'track' && (
              <>
                <th className="pl-4 pr-0 py-3 text-right"></th>
                <th className="pl-4 pr-0 py-3 text-right"></th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {/* Input row for new task */}
          {showInputRow && (
            <tr className="bg-gray-50 border-b border-gray-200">
              <td className="px-4 py-3">
                <div>
                  <input
                    type="text"
                    value={newTask.patientId}
                    onChange={(e) => handleInputChange('patientId', e.target.value)}
                    placeholder="Patient ID"
                    required
                    className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
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
              <td className="px-4 py-3">
                <div>
                  <input
                    type="text"
                    value={newTask.taskName}
                    onChange={(e) => handleInputChange('taskName', e.target.value)}
                    placeholder="Task Name"
                    required
                    className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
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
              <td className="px-4 py-3">
                <div>
                  <input
                    type="text"
                    value={newTask.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Description"
                    required
                    className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 ${
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
              <td className="px-4 py-3">
                <input
                  type="text"
                  value={newTask.assigneeBy}
                  readOnly
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700 cursor-not-allowed"
                />
              </td>
              <td className="px-4 py-3">
                <div>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => handleInputChange('dueDate', e.target.value)}
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
              <td className="px-4 py-3 relative" style={{ overflow: 'visible' }}>
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
              <td className="px-4 py-3 relative" style={{ overflow: 'visible' }}>
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
                <>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
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
                  <td className="px-4 py-3"></td>
                </>
              )}
            </tr>
          )}
          {visibleTasks.map((task) => {
            const isEditing = editingTaskId === task.id;
            const displayTask = isEditing && editedTask ? editedTask : task;
            
            return (
              <tr key={task.id} className={`hover:bg-gray-50 ${isEditing ? 'bg-gray-50' : ''}`}>
                <td className="px-4 py-4">
                  {isEditing && !isUserRole ? (
                    <input
                      type="text"
                      value={displayTask.patientId || ''}
                      onChange={(e) => handleEditInputChange('patientId', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200 font-mono"
                    />
                  ) : (
                    <div className="text-sm text-gray-900 font-mono font-normal truncate">
                {task.patientId}
                    </div>
                  )}
              </td>
              <td className="px-4 py-4">
                  {isEditing && !isUserRole ? (
                    <input
                      type="text"
                      value={displayTask.taskName || ''}
                      onChange={(e) => handleEditInputChange('taskName', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                <div className="text-sm font-normal text-gray-900 truncate" title={task.taskName}>{task.taskName}</div>
                  )}
              </td>
                <td className="px-4 py-4">
                  {isEditing && !isUserRole ? (
                    <input
                      type="text"
                      value={displayTask.description || ''}
                      onChange={(e) => handleEditInputChange('description', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                    <div className="text-sm text-gray-900 truncate" title={task.description}>{task.description}</div>
                  )}
              </td>
                <td className="px-4 py-4">
                  {isEditing && !isUserRole ? (
                    <input
                      type="text"
                      value={displayTask.assigneeBy || ''}
                      onChange={(e) => handleEditInputChange('assigneeBy', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                    <div className="text-sm text-gray-900 truncate">{task.assigneeBy}</div>
                  )}
              </td>
              <td className="px-4 py-4">
                  {isEditing && !isUserRole ? (
                    <input
                      type="date"
                      value={displayTask.dueDate || ''}
                      onChange={(e) => handleEditInputChange('dueDate', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  ) : (
                    <div className="text-sm text-gray-500 truncate">{task.dueDate}</div>
                  )}
                </td>
              <td className="px-4 py-4 relative" style={{ overflow: 'visible' }}>
                  {isEditing && !isUserRole ? (
                    <div className="relative" style={{ zIndex: 1000 }}>
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
                          zIndex: 1000,
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
              <td className="px-4 py-4 whitespace-nowrap relative" style={{ overflow: 'visible' }}>
                  {isEditing ? (
                    <div className="relative" style={{ zIndex: 1000 }}>
                      <select
                        value={displayTask.status}
                        onChange={(e) => handleEditInputChange('status', e.target.value)}
                        className={`w-full px-2 py-1 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-200 text-xs font-semibold ${
                          displayTask.status === 'Done' ? 'bg-green-100 text-green-800' :
                          displayTask.status === 'In progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                        style={{ 
                          minHeight: '32px', 
                          position: 'relative', 
                          zIndex: 1000,
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
                {variant === 'track' && !isUserRole && (
                  <>
                    <td className="pl-4 pr-0 py-4 whitespace-nowrap text-right">
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
                            setEditedTask({ ...task });
                          }}
                          className="inline-flex items-center justify-center px-2 py-1 text-gray-600 hover:text-gray-800 rounded transition-colors"
                          title="Edit task"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="pl-4 pr-0 py-4 whitespace-nowrap text-right">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setDeletedTaskIds(prev => new Set([...prev, task.id]));
                            if (onDelete) {
                              onDelete(task.id);
                            }
                          }}
                          className="inline-flex items-center justify-center px-2 py-1 text-gray-600 hover:text-gray-800 rounded transition-colors"
                          title="Delete task"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                        </button>
                      )}
                    </td>
                  </>
                )}
                {variant === 'track' && isUserRole && (
                  <td className="pl-4 pr-0 py-4 whitespace-nowrap text-right">
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
                          setEditedTask({ ...task });
                        }}
                        className="inline-flex items-center justify-center px-2 py-1 text-gray-600 hover:text-gray-800 rounded transition-colors"
                        title="Edit status"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                      </button>
                    )}
              </td>
                )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </AlertCard>
  );
};

export default MyTasksModal;
