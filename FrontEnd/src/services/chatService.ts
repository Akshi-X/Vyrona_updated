import { BaseApiService } from './baseApiService';

// ============================================
// CHAT INTERFACES
// ============================================

export interface ChatMessageResponse {
  id: number;
  message_content: string;
  patient_id?: string | null; // For CGT flow
  canister_number?: string | null; // For IVF flow
  sender_id: string;
  sender_name: string;
  sender_role?: string;
  tagged_user_ids: string[];
  created_at: string;
  is_read: boolean;
  read_at?: string;
}

export interface UnreadMessageResponse {
  message_id: number;
  message_content: string;
  patient_id?: string | null; // For CGT flow
  canister_number?: string | null; // For IVF flow (legacy)
  tank_code?: string | null; // For IVF flow
  patient_name?: string | null; // Patient name for CGT
  sender_id: string;
  sender_name: string;
  created_at: string;
}

export interface UnreadMessagesResponse {
  unread_messages: UnreadMessageResponse[];
  total_unread: number;
  unread_by_patient: Record<string, number>; // For CGT flow
  unread_by_canister: Record<string, number>; // For IVF flow
}

export interface PatientMessagesResponse {
  patient_id?: string | null; // For CGT flow
  canister_number?: string | null; // For IVF flow
  patient_name?: string | null; // Patient name for CGT
  messages: ChatMessageResponse[];
  total_messages: number;
  unread_count: number;
}

export interface IncubatorMessagesResponse {
  incubator_id: number;
  chamber_id?: string | null;
  messages: ChatMessageResponse[];
  total_messages: number;
  unread_count: number;
}

export interface ChatMessageCreateRequest {
  message_content: string;
  patient_id?: string; // For CGT flow
  canister_number?: string; // For IVF flow
  tank_code?: string; // For IVF flow (alternative)
  incubator_id?: number; // For incubator flow
  chamber_id?: string; // For incubator flow (optional chamber)
  tagged_user_ids?: string[];
}

export interface ChatMessageCreateResponse {
  message_id: number;
  message_content: string;
  patient_id?: string | null; // For CGT flow
  canister_number?: string | null; // For IVF flow
  sender_id: string;
  sender_name: string;
  sender_role?: string | null;
  tagged_user_ids: string[];
  tagged_user_names?: string[] | null;
  created_at: string;
}

// ============================================
// CHAT SERVICE
// ============================================

export class ChatService extends BaseApiService {
  /**
   * Get unread messages for the current user
   */
  async getUnreadMessages(): Promise<UnreadMessagesResponse> {
    return await this.request<UnreadMessagesResponse>('/api/chat/unread', {
      method: 'GET',
    });
  }

  /**
   * Get all messages for a specific patient (CGT flow)
   */
  async getPatientMessages(patientId: string): Promise<PatientMessagesResponse> {
    return await this.request<PatientMessagesResponse>(`/api/chat/patients/${patientId}/messages`, {
      method: 'GET',
    });
  }

  /**
   * Get all messages for a specific tank (IVF flow)
   */
  async getCanisterMessages(tankId: string | number): Promise<PatientMessagesResponse> {
    return await this.request<PatientMessagesResponse>(`/api/chat/canisters/${encodeURIComponent(tankId)}/messages`, {
      method: 'GET',
    });
  }

  /**
   * Send a chat message (supports both CGT and IVF flows)
   */
  async sendMessage(data: ChatMessageCreateRequest): Promise<ChatMessageCreateResponse> {
    return await this.request<ChatMessageCreateResponse>('/api/chat/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Mark patient messages as read (CGT flow)
   */
  async markPatientAsRead(patientId: string): Promise<{
    success: boolean;
    message: string;
    patient_id: string;
    last_read_message_id: number;
    unread_count: number;
  }> {
    return await this.request(`/api/chat/patients/${patientId}/mark-read`, {
      method: 'POST',
    });
  }

  /**
   * Mark tank messages as read (IVF flow)
   */
  async markCanisterAsRead(tankId: string | number): Promise<{
    success: boolean;
    message: string;
    tank_id?: number;
    tank_code?: string;
    last_read_message_id: number;
    unread_count: number;
  }> {
    return await this.request(`/api/chat/canisters/${encodeURIComponent(tankId)}/mark-read`, {
      method: 'POST',
    });
  }

  /**
   * Get all messages for a specific incubator (optionally filtered by chamber)
   */
  async getIncubatorMessages(incubatorId: number, chamberId?: string): Promise<IncubatorMessagesResponse> {
    const query = chamberId ? `?chamber_id=${encodeURIComponent(chamberId)}` : '';
    return await this.request<IncubatorMessagesResponse>(
      `/api/chat/incubators/${incubatorId}/messages${query}`,
      { method: 'GET' }
    );
  }

  /**
   * Mark incubator messages as read
   */
  async markIncubatorAsRead(incubatorId: number, chamberId?: string): Promise<{
    success: boolean;
    incubator_id: number;
    last_read_message_id: number;
    unread_count: number;
  }> {
    const query = chamberId ? `?chamber_id=${encodeURIComponent(chamberId)}` : '';
    return await this.request(`/api/chat/incubators/${incubatorId}/mark-read${query}`, {
      method: 'POST',
    });
  }

  /**
   * Health check for chat service
   */
  async healthCheck(): Promise<{ status: string; service: string; message: string }> {
    return await this.request<{ status: string; service: string; message: string }>('/api/chat/health', {
      method: 'GET',
    });
  }
}

// Export singleton instance
export const chatService = new ChatService();
