import { apiClient } from '@/api/client';
import type {
  AppNotification,
  NotificationCategory,
  NotificationPreference,
} from '@/types/notification';

/**
 * Two groups, mounted at two places, for the reason set out in
 * `backend/src/routes/notification.routes.js`:
 *
 * - **Device and preference calls are not business-scoped.** A phone belongs to
 *   a person, and it has to be registered the moment they log in — before any
 *   business is chosen, and for someone who belongs to none.
 * - **The list is business-scoped**, because switching business must change
 *   what it shows, the way every other screen does.
 */

const base = (businessId: string) => `/businesses/${businessId}`;

// --- This device ------------------------------------------------------------

/**
 * `locale` is the language THIS DEVICE is showing, not the account's stored
 * preference. It is what lets the server render a lock-screen notification the
 * reader can actually read — see `DeviceToken.locale`.
 */
export async function registerDeviceToken(payload: {
  token: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  locale: string;
}): Promise<void> {
  await apiClient.post('/notifications/device-token', payload);
}

export async function unregisterDeviceToken(token: string): Promise<void> {
  await apiClient.delete('/notifications/device-token', { data: { token } });
}

// --- Preferences ------------------------------------------------------------

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data } = await apiClient.get<NotificationPreference[]>('/notifications/preferences');
  return data;
}

export async function setNotificationPreference(
  category: NotificationCategory,
  enabled: boolean
): Promise<NotificationPreference[]> {
  const { data } = await apiClient.patch<NotificationPreference[]>(
    `/notifications/preferences/${category}`,
    { enabled }
  );
  return data;
}

// --- The centre -------------------------------------------------------------

export async function listNotifications(
  businessId: string,
  options: { unreadOnly?: boolean } = {}
): Promise<AppNotification[]> {
  const { data } = await apiClient.get<AppNotification[]>(`${base(businessId)}/notifications`, {
    params: options.unreadOnly ? { status: 'UNREAD' } : undefined,
  });
  return data;
}

export async function getUnreadCount(businessId: string): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>(
    `${base(businessId)}/notifications/unread-count`
  );
  return data.count;
}

export async function markNotificationRead(
  businessId: string,
  notificationId: string
): Promise<AppNotification> {
  const { data } = await apiClient.post<AppNotification>(
    `${base(businessId)}/notifications/${notificationId}/read`
  );
  return data;
}

export async function markAllNotificationsRead(businessId: string): Promise<{ count: number }> {
  const { data } = await apiClient.post<{ count: number }>(
    `${base(businessId)}/notifications/read-all`
  );
  return data;
}
