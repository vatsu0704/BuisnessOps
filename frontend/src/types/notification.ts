import type { AppStackParamList } from '@/navigation/AppNavigator';

/**
 * Notifications — requirements 2 and 8.
 *
 * A notification is stored as a **code and its values**, never a sentence. The
 * list re-renders `t('notifications.<code>', params)` every time it draws, so
 * one received last week appears in whatever language is selected now — the
 * same contract the error catalog uses, for the same reason.
 *
 * The push that arrived alongside it carried rendered text as well, because
 * Android draws the lock screen before any app code runs. That copy keeps the
 * language it arrived in, which is correct: it was written at the time it was
 * sent.
 */

/** Mirrors `NOTIFICATION_CODES` in `backend/src/notifications/labels.js`. */
export type NotificationCode =
  | 'ATTENDANCE_MARKED_PRESENT'
  | 'ATTENDANCE_MARKED_ABSENT'
  | 'ATTENDANCE_MARKED_HALF_DAY'
  | 'ATTENDANCE_MARKED_LEAVE'
  | 'SUPPLY_ORDER_PLACED'
  | 'SUPPLY_ORDER_ACCEPTED'
  | 'SUPPLY_ORDER_PACKED'
  | 'SUPPLY_ORDER_DISPATCHED'
  | 'SUPPLY_ORDER_DELIVERED'
  | 'SUPPLY_ORDER_REJECTED'
  | 'SUPPLY_ORDER_DELAYED'
  | 'SUPPLY_PAYMENT_VERIFIED'
  | 'SUPPLY_ORDER_ASSIGNED';

/** The groups a person can switch off. `attendance` deliberately cannot. */
export type NotificationCategory = 'attendance' | 'orders' | 'delays' | 'payments' | 'deliveries';

/**
 * Where tapping one goes.
 *
 * Typed against the real param list rather than `string`, so a route renamed in
 * the navigator fails `tsc` here instead of becoming a tap that does nothing.
 */
export interface NotificationDeepLink {
  route: keyof AppStackParamList;
  params?: Record<string, string>;
}

export interface AppNotification {
  id: string;
  businessId: string;
  branchId: string | null;
  code: NotificationCode;
  params: Record<string, string | number>;
  deepLink: NotificationDeepLink | null;
  status: 'UNREAD' | 'READ';
  readAt: string | null;
  /** Null with no error means nobody had a device registered — not a failure. */
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  category: NotificationCategory;
  enabled: boolean;
  /** Rendered as fixed rather than as a switch that would silently do nothing. */
  required: boolean;
}
