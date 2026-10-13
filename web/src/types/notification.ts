/**
 * The app's `types/notification.ts`, kept as a copy: the app types a deep link's
 * route against its navigator, which the web cannot import. Here the route is the
 * app's route name as a string, and `routes/deepLink.ts` turns it into an address.
 */
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
  | 'SUPPLY_ORDER_ASSIGNED'
  | 'SUPPLY_ORDER_SENT_TO_VENDOR'
  | 'SUPPLY_ORDER_READY_TO_PAY'
  | 'SUPPLY_PAYMENT_SENT';

export type NotificationCategory = 'attendance' | 'orders' | 'delays' | 'payments' | 'deliveries';

export interface NotificationDeepLink {
  /** An app route name — `SupplyOrderDetail`, `Attendance`, `SupplyPayments`. */
  route: string;
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
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  category: NotificationCategory;
  enabled: boolean;
  required: boolean;
}
