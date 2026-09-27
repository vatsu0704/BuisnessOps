import { create } from 'zustand';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications';
import { extractErrorMessage } from '@/api/client';
import type { AppNotification } from '@/types/notification';

/**
 * The notification list and its unread count, held once for the whole app.
 *
 * A store rather than per-screen state for the reason `branchStore`'s header
 * sets out at length: **two** components read this — the badge in Home's top
 * bar and the centre itself — and both live in tab screens that never unmount.
 * Private copies would mean marking one read on the centre leaving the badge
 * claiming it is still unread until the app was killed.
 *
 * The count is derived from the list rather than fetched separately, so the two
 * cannot disagree. There is a `/unread-count` endpoint for anywhere that wants
 * the number without the rows; nothing in the app currently does, because the
 * list is small and bounded at fifty.
 */

type NotificationStore = {
  /** The business the current list belongs to. null means nothing is loaded. */
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

/** In flight, kept OUT of the store — see branchStore for why. */
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
        // The previous list stays. A failed refresh should not empty a screen
        // that was reading fine a second ago.
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

    /**
     * Marked locally first, then on the server.
     *
     * Tapping a notification navigates away in the same gesture, so waiting for
     * a round trip would leave the badge counting it for as long as the request
     * took — on a slow connection, long enough to look broken. If the request
     * fails the next refresh puts it back, which is the right way round: a
     * notification wrongly shown as read for a minute costs less than one that
     * appears to ignore the tap.
     */
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

/** Refetch from outside React — for the push listener, which is not a component. */
export function refreshNotifications() {
  return useNotificationStore.getState().refresh();
}
