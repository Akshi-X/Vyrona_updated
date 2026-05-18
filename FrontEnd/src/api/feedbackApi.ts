/**
 * Feedback API Service - DEPRECATED
 * This file is deprecated. Use the new service structure:
 * - Import from '../services/feedbackService' for feedback operations
 * - Import from '../services/userService' for user operations
 * - Import from '../services/authService' for authentication
 */

// Re-export from new service structure for backward compatibility
export {
  feedbackService as feedbackApi,
  type FeedbackSubmission,
  type FeedbackResponse,
  type UserTicketSummary,
  type CommentItemDto,
  type FeedbackDetailResponse,
} from '../services/feedbackService';

export {
  userService,
  type UserProfileDto,
} from '../services/userService';

export {
  authService,
  type LoginCredentials,
  type RegisterData,
  type AuthResponse,
} from '../services/authService';
