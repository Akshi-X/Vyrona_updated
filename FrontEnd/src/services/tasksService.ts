/**
 * Tasks Service
 * Handles all tasks-related API calls
 */

import { BaseApiService } from './baseApiService';

export interface Task {
  id: number;
  task_name: string;
  description?: string;
  assignee_id: number;
  assignee_name: string;
  patient_id?: string;
  due_date?: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Not started' | 'In progress' | 'Done';
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at?: string;
  can_edit: boolean;
  can_delete: boolean;
  can_update_status: boolean;
}

export interface TaskListResponse {
  tasks: Task[];
  total_count: number;
  can_create: boolean;
}

export class TasksService extends BaseApiService {
  /**
   * Get all tasks for current user
   */
  async getMyTasks(): Promise<TaskListResponse> {
    return await this.request<TaskListResponse>('/api/tasks', {
      method: 'GET',
    });
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: number): Promise<Task> {
    return await this.request<Task>(`/api/tasks/${taskId}`, {
      method: 'GET',
    });
  }

  /**
   * Create new task (Manager only)
   */
  async createTask(taskData: {
    task_name: string;
    description?: string;
    assignee_id: number;
    patient_id?: string;
    due_date?: string;
    priority: 'Low' | 'Medium' | 'High';
    status?: 'Not started' | 'In progress' | 'Done';
  }): Promise<{ message: string; task_id: number }> {
    return await this.request<{ message: string; task_id: number }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }

  /**
   * Update task
   */
  async updateTask(taskId: number, taskData: {
    task_name?: string;
    description?: string;
    assignee_id?: number;
    patient_id?: string;
    due_date?: string;
    priority?: 'Low' | 'Medium' | 'High';
  }): Promise<{ message: string; task_id: number }> {
    return await this.request<{ message: string; task_id: number }>(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: number, status: 'Not started' | 'In progress' | 'Done'): Promise<{ message: string; task_id: number }> {
    return await this.request<{ message: string; task_id: number }>(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: number): Promise<{ message: string; task_id: number }> {
    return await this.request<{ message: string; task_id: number }>(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const tasksService = new TasksService();
