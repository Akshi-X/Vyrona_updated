/**
 * Push Notification Service
 * Handles push subscription CRUD and per-user/per-device notification preferences.
 */

import { BaseApiService } from './baseApiService';

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface SubscribePushRequest {
  endpoint: string;
  keys: PushSubscriptionKeys;
  device_label?: string;
}

export interface PushSubscriptionSummary {
  id: number;
  device_label: string | null;
  user_agent: string | null;
  enabled: boolean;
  current: boolean;
  created_at: string | null;
  last_used_at: string | null;
}

export interface PushPreferences {
  push_enabled: boolean;
  subscriptions: PushSubscriptionSummary[];
}

class PushNotificationService extends BaseApiService {
  async getVapidPublicKey(): Promise<{ public_key: string }> {
    return this.get<{ public_key: string }>('/api/push/vapid-public-key');
  }

  async subscribe(payload: SubscribePushRequest): Promise<{ id: number; device_label: string | null; enabled: boolean }> {
    return this.post('/api/push/subscribe', payload);
  }

  async unsubscribe(endpoint: string): Promise<{ deleted: boolean }> {
    return this.request('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  }

  async getPreferences(endpoint?: string): Promise<PushPreferences> {
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    return this.get<PushPreferences>(`/api/push/preferences${query}`);
  }

  async updatePreferences(pushEnabled: boolean): Promise<{ push_enabled: boolean }> {
    return this.put('/api/push/preferences', { push_enabled: pushEnabled });
  }

  async updateSubscription(id: number, enabled: boolean): Promise<{ id: number; enabled: boolean }> {
    return this.patch(`/api/push/subscriptions/${id}`, { enabled });
  }

  async deleteSubscription(id: number): Promise<{ deleted: boolean }> {
    return this.delete(`/api/push/subscriptions/${id}`);
  }

  async sendTest(): Promise<{ sent: number; total: number }> {
    return this.post('/api/push/test', {});
  }
}

export const pushNotificationService = new PushNotificationService();
