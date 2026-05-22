/**
 * Tasks Service
 * Handles all tasks-related API calls
 */

import { BaseApiService } from './baseApiService';

export type TaskStatus = 'Not started' | 'In progress' | 'Done' | 'Cancelled';
export interface Task {
  id: number;
  task_name: string;
  description?: string;
  assignee: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  };
  created_by: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  };
  patient_id?: string;
  canister_number?: string | null;
  tank_code?: string | null;
  tank_id?: number | null;
  incubator_id?: number | null;
  chamber_id?: string | null;
  refrigerator_id?: number | null;
  zone_id?: string | null;
  due_date?: string;
  priority: 'Low' | 'Medium' | 'High';
  status: TaskStatus;
  created_at: string;
  updated_at?: string;
  permissions?: {
    can_edit_all: boolean;
    can_edit_status_only: boolean;
  };
}

export interface TaskListResponse {
  created_tasks?: Task[];
  assigned_tasks?: Task[];
  total_created: number;
  total_assigned: number;
}

export interface ScopedTaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
  message: string;
  patient_id?: string | null;
  canister_number?: string | null;
}

export interface TaskMutationResponse {
  message: string;
  task: Task;
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
   * Get tasks for a specific patient
   * Returns PatientTaskListResponse with tasks array inside
   */
  async getPatientTasks(patientId: string): Promise<ScopedTaskListResponse> {
    return await this.request<ScopedTaskListResponse>(`/api/patients/${encodeURIComponent(patientId)}/tasks`, {
      method: 'GET',
    });
  }

  /**
   * Get tasks for a specific tank (IVF flow)
   * Returns PatientTaskListResponse with tasks array inside
   */
  async getCanisterTasks(tankId: string | number): Promise<ScopedTaskListResponse> {
    return await this.request<ScopedTaskListResponse>(`/api/canisters/${encodeURIComponent(tankId)}/tasks`, {
      method: 'GET',
    });
  }

  /**
   * Get tasks for a specific incubator (optionally filtered by chamber)
   */
  async getIncubatorTasks(incubatorId: number, chamberId?: string): Promise<ScopedTaskListResponse> {
    const query = chamberId ? `?chamber_id=${encodeURIComponent(chamberId)}` : '';
    return await this.request<ScopedTaskListResponse>(`/api/incubators/${incubatorId}/tasks${query}`, {
      method: 'GET',
    });
  }

  /**
   * Get tasks for a specific refrigerator (optionally filtered by zone)
   */
  async getRefrigeratorTasks(refrigeratorId: number, zoneId?: string): Promise<ScopedTaskListResponse> {
    const query = zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : '';
    return await this.request<ScopedTaskListResponse>(`/api/refrigerators/${refrigeratorId}/tasks${query}`, {
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
    assignee_id: string;
    patient_id?: string;
    tank_code?: string;
    tank_id?: number;
    incubator_id?: number;
    chamber_id?: string;
    refrigerator_id?: number;
    zone_id?: string;
    due_date?: string;
    priority: 'Low' | 'Medium' | 'High';
    status?: TaskStatus;
  }): Promise<TaskMutationResponse> {
    return await this.request<TaskMutationResponse>('/api/tasks', {
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
    assignee_id?: string;
    patient_id?: string;
    tank_code?: string;
    tank_id?: number;
    due_date?: string;
    priority?: 'Low' | 'Medium' | 'High';
    status?: TaskStatus;
  }): Promise<TaskMutationResponse> {
    return await this.request<TaskMutationResponse>(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: number, status: TaskStatus): Promise<TaskMutationResponse> {
    return await this.request<TaskMutationResponse>(`/api/tasks/${taskId}/status`, {
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
