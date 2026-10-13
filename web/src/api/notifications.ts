import { apiClient } from './client';
import type { AppNotification, NotificationCategory, NotificationPreference } from '@/types/notification';

const base = (businessId: string) => `/businesses/${businessId}`;

/** Per account, not per business: what to be told about, everywhere. */
export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data } = await apiClient.get<NotificationPreference[]>('/notifications/preferences');
  return data;
}

export async function setNotificationPreference(
  category: NotificationCategory,
  enabled: boolean
): Promise<NotificationPreference[]> {
  const { data } = await apiClient.patch<NotificationPreference[]>(`/notifications/preferences/${category}`, {
    enabled,
  });
  return data;
}

/** The business's notifications for this person, newest first. */
export async function listNotifications(businessId: string): Promise<AppNotification[]> {
  const { data } = await apiClient.get<AppNotification[]>(`${base(businessId)}/notifications`);
  return data;
}

export async function markNotificationRead(businessId: string, notificationId: string): Promise<AppNotification> {
  const { data } = await apiClient.post<AppNotification>(`${base(businessId)}/notifications/${notificationId}/read`);
  return data;
}

export async function markAllNotificationsRead(businessId: string): Promise<{ count: number }> {
  const { data } = await apiClient.post<{ count: number }>(`${base(businessId)}/notifications/read-all`);
  return data;
}
