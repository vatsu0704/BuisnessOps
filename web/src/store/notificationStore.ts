import { create } from 'zustand';
import { extractErrorMessage } from '@/api/client';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/notifications';
import type { AppNotification } from '@/types/notification';

/**
 * The notification list, held once — the bell's count and the centre's list are
 * the same data, as in the app's `notificationStore`. Same rules as branchStore:
 * `loadedFor`, one request at a time, a failed refresh keeps the list.
 *
 * Marking read is optimistic: the dot goes at once and, if the server refuses, the
 * next fetch puts it back — the right way round, since a notification shown read
 * that is not is the worse mistake to leave standing.
 */
type NotificationStore = {
  loadedFor: string | null;
  notifications: AppNotification[];
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
};

let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useNotificationStore = create<NotificationStore>((set, get) => {
  async function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const notifications = await listNotifications(businessId);
        set({ notifications, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        set({ isLoading: false, error: extractErrorMessage(err) });
      } finally {
        if (pending?.businessId === businessId) pending = null;
      }
    })();

    pending = { businessId, promise };
    return promise;
  }

  return {
    loadedFor: null,
    notifications: [],
    isLoading: false,
    error: null,

    async load(businessId) {
      if (!businessId) {
        get().reset();
        return;
      }
      if (get().loadedFor === businessId) return;
      await fetchFor(businessId);
    },

    async refresh() {
      const { loadedFor } = get();
      if (loadedFor) await fetchFor(loadedFor);
    },

    async markRead(notificationId) {
      const { loadedFor, notifications } = get();
      if (!loadedFor) return;
      const target = notifications.find((n) => n.id === notificationId);
      if (!target || target.status === 'READ') return;

      set({
        notifications: notifications.map((n) =>
          n.id === notificationId ? { ...n, status: 'READ', readAt: new Date().toISOString() } : n
        ),
      });
      try {
        await markNotificationRead(loadedFor, notificationId);
      } catch {
        await fetchFor(loadedFor);
      }
    },

    async markAllRead() {
      const { loadedFor, notifications } = get();
      if (!loadedFor) return;
      const readAt = new Date().toISOString();
      set({ notifications: notifications.map((n) => ({ ...n, status: 'READ', readAt })) });
      try {
        await markAllNotificationsRead(loadedFor);
      } catch {
        await fetchFor(loadedFor);
      }
    },

    reset() {
      pending = null;
      set({ loadedFor: null, notifications: [], isLoading: false, error: null });
    },
  };
});
