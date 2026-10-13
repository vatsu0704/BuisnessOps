import { useEffect, useMemo } from 'react';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useNotificationStore } from '@/store/notificationStore';
import type { AppNotification } from '@/types/notification';

const NONE: AppNotification[] = [];

/** The notifications for the business being acted under, and how many are unread. */
export function useNotifications() {
  const businessId = useBusinessId();

  const load = useNotificationStore((s) => s.load);
  const refresh = useNotificationStore((s) => s.refresh);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const error = useNotificationStore((s) => s.error);
  const notifications = useNotificationStore((s) => (s.loadedFor === businessId ? s.notifications : NONE));
  const isLoading = useNotificationStore((s) => (businessId ? s.isLoading || s.loadedFor !== businessId : false));

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  const unreadCount = useMemo(() => notifications.filter((n) => n.status === 'UNREAD').length, [notifications]);

  return { notifications, unreadCount, isLoading, error, refresh, markRead, markAllRead };
}

/** How often the bell asks while the tab is in view. Browser push (W13) would replace it. */
export const NOTIFICATION_POLL_MS = 60_000;

/**
 * Keep the bell current without push: ask again when the tab comes back into
 * view, and every minute while it is in view. A hidden tab asks nothing — that
 * check is what stops a forgotten tab polling all night.
 */
export function useNotificationPolling() {
  const refresh = useNotificationStore((s) => s.refresh);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = window.setInterval(tick, NOTIFICATION_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);
}
