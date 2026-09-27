import { useEffect, useMemo } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { AppNotification } from '@/types/notification';

/** Stable empty array, so the selector does not return a new one each render. */
const NONE: AppNotification[] = [];

/**
 * This person's notifications in the business they are currently acting under.
 *
 * Scoped to the active business on purpose: switching business changes what the
 * list shows, the way every other screen does — and the badge counts the same
 * scope, so it cannot claim unread items the centre has no way to display.
 */
export function useNotifications() {
  const businessId = useBusinessId();

  const load = useNotificationStore((s) => s.load);
  const refresh = useNotificationStore((s) => s.refresh);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const error = useNotificationStore((s) => s.error);

  // Checking `loadedFor` rather than trusting the array is what stops the
  // previous tenant's notifications flashing for a frame after a switch.
  const notifications = useNotificationStore((s) =>
    s.loadedFor === businessId ? s.notifications : NONE
  );
  const isLoading = useNotificationStore((s) =>
    businessId ? s.isLoading || s.loadedFor !== businessId : false
  );

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.status === 'UNREAD').length,
    [notifications]
  );

  return { notifications, unreadCount, isLoading, error, refresh, markRead, markAllRead };
}
