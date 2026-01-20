/**
 * Feedback Service
 * Handles all feedback-related API calls
 */

import { BaseApiService } from './baseApiService';

export interface FeedbackSubmission {
  department: string;
  feedback_type: string;
  subject: string;
  description: string;
  priority: string;
  affected_modules: string[];
  attachments?: File[];
}

export interface FeedbackResponse {
  message: string;
  ticket_id: string;
  feedback_id: string;
  status: string;
}

export interface UserTicketSummary {
  feedback_id: string;
  feedback: string;
  type: string;
  status: string;
  submitted_on: string;
}

export interface CommentItemDto {
  id: number;
  comment: string;
  commented_by: string;
  created_at: string;
}

export interface FeedbackDetailResponse {
  id: string;
  ticket_id: string;
  department: string;
  feedback_type: string;
  subject: string;
  description: string;
  attachment_paths?: string[];
  priority: string;
  affected_modules: string[];
  status: string;
  submitted_by: string;
  submitted_by_email: string;
  submitted_on: string;
  created_at: string;
  updated_at?: string;
  comments: CommentItemDto[];
}

export class FeedbackService extends BaseApiService {
  /**
   * Submit feedback ticket
   */
  async submitFeedback(data: FeedbackSubmission): Promise<FeedbackResponse> {
    const formData = new FormData();
    
    const requestData = {
      department: data.department,
      feedback_type: data.feedback_type,
      subject: data.subject,
      description: data.description,
      priority: data.priority,
      affected_modules: data.affected_modules,
    };
    
    formData.append('request', JSON.stringify(requestData));
    
    // Append all attachments
    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    return await this.requestFormData<FeedbackResponse>('/api/feedback/create', formData, {
      method: 'POST',
    });
  }

  /**
   * Get user tickets
   */
  async getUserTickets(userId: string): Promise<UserTicketSummary[]> {
    return await this.request<UserTicketSummary[]>(`/api/feedback/user/${encodeURIComponent(userId)}`, {
      method: 'GET',
    });
  }

  /**
   * Get user tickets by email
   */
  async getUserTicketsByEmail(email: string): Promise<UserTicketSummary[]> {
    return await this.request<UserTicketSummary[]>(`/api/feedback/by-email/${encodeURIComponent(email)}`, {
      method: 'GET',
    });
  }

  /**
   * Get feedback details
   */
  async getFeedbackDetails(feedbackId: string): Promise<FeedbackDetailResponse> {
    return await this.request<FeedbackDetailResponse>(`/api/feedback/${encodeURIComponent(feedbackId)}`, {
      method: 'GET',
    });
  }

  /**
   * Get feedback comments
   */
  async getComments(feedbackId: string): Promise<CommentItemDto[]> {
    return await this.request<CommentItemDto[]>(`/api/feedback/${encodeURIComponent(feedbackId)}/comments`, {
      method: 'GET',
    });
  }

  /**
   * Add comment to feedback
   */
  async addComment(feedbackId: string, comment: string, sendEmail: boolean = true): Promise<{ message: string; comment_id: number; ticket_id: string }> {
    return await this.request<{ message: string; comment_id: number; ticket_id: string }>(
      `/api/feedback/${encodeURIComponent(feedbackId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ comment, send_email: sendEmail }),
      }
    );
  }

  /**
   * Update feedback status
   */
  async updateFeedbackStatus(feedbackId: string, status: string, sendEmail: boolean = true): Promise<{ message: string; ticket_id: string; old_status: string; new_status: string }> {
    const requestBody = { 
      status: status,
      send_email: sendEmail 
    };
    
    return await this.request<{ message: string; ticket_id: string; old_status: string; new_status: string }>(
      `/api/feedback/${encodeURIComponent(feedbackId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      }
    );
  }

  /**
   * Get all feedback tickets (admin only)
   */
  async getAllFeedbackTickets(filters?: {
    feedback_type?: string;
    status?: string;
    submitted_on?: string;
  }): Promise<UserTicketSummary[]> {
    const queryParams = new URLSearchParams();
    if (filters?.feedback_type) queryParams.append('feedback_type', filters.feedback_type);
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.submitted_on) queryParams.append('submitted_on', filters.submitted_on);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/api/feedback/admin?${queryString}` : '/api/feedback/admin';
    
    return await this.request<UserTicketSummary[]>(endpoint, {
      method: 'GET',
    });
  }

  /**
   * Get attachment URL for viewing/downloading attachments
   */
  getAttachmentUrl(attachmentPath: string): string {
    // Remove leading slash if present to avoid double slashes
    const cleanPath = attachmentPath.startsWith('/') ? attachmentPath.slice(1) : attachmentPath;
    return `${this.getBaseUrl()}/${cleanPath}`;
  }
}

// Export singleton instance
export const feedbackService = new FeedbackService();


