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
  affected_modules: string;
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
  attachment_path?: string;
  priority: string;
  affected_modules: string;
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
  async addComment(feedbackId: string, comment: string): Promise<{ message: string; comment_id: number; ticket_id: string }> {
    return await this.request<{ message: string; comment_id: number; ticket_id: string }>(
      `/api/feedback/${encodeURIComponent(feedbackId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      }
    );
  }

  /**
   * Update feedback status
   */
  async updateFeedbackStatus(feedbackId: string, status: string): Promise<{ message: string; status: string }> {
    return await this.request<{ message: string; status: string }>(
      `/api/feedback/${encodeURIComponent(feedbackId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  }
}

// Export singleton instance
export const feedbackService = new FeedbackService();


