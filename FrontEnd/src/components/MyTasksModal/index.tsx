import React from 'react';
import AlertCard from '../AlertCard';

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
}

const MyTasksModal: React.FC<MyTasksModalProps> = ({
  isOpen,
  onClose,
  tasks,
  loading = false
}) => {
  return (
    <AlertCard
      isOpen={isOpen}
      onClose={onClose}
      title="My Tasks"
      description="Manage and track your assigned tasks"
      icon={
        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      }
      loading={loading}
      loadingText="Loading tasks..."
      emptyText="No tasks found"
      dataLength={tasks.length}
    >
      <table className="w-full divide-y divide-gray-200">
        <thead className="bg-purple-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Patient ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Task Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Description</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Assigned by</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Due date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50">
              <td className="px-4 py-4 text-sm text-gray-900 font-mono font-normal truncate">
                {task.patientId}
              </td>
              <td className="px-4 py-4">
                <div className="text-sm font-normal text-gray-900 truncate" title={task.taskName}>{task.taskName}</div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-900">
                <div className="truncate" title={task.description}>{task.description}</div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-900 truncate">
                {task.assigneeBy}
              </td>
              <td className="px-4 py-4 text-sm text-gray-500 truncate">
                {task.dueDate}
              </td>
              <td className="px-4 py-4">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  task.priority === 'High' ? 'bg-red-100 text-red-800' :
                  task.priority === 'Medium' ? 'bg-orange-100 text-orange-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {task.priority}
                </span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  task.status === 'Done' ? 'bg-green-100 text-green-800' :
                  task.status === 'In progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {task.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AlertCard>
  );
};

export default MyTasksModal;
