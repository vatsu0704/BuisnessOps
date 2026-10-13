import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { IconType } from 'react-icons';
import {
  IoBicycle,
  IoCalendarClear,
  IoCard,
  IoCart,
  IoCheckmarkCircle,
  IoCheckmarkDone,
  IoCheckmarkDoneOutline,
  IoCloseCircle,
  IoContrast,
  IoCube,
  IoFlag,
  IoNavigate,
  IoNotificationsOffOutline,
  IoPaperPlane,
  IoTime,
  IoWallet,
} from 'react-icons/io5';
import Button from '@/components/ui/Button';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { useMembership } from '@/hooks/useBusinessId';
import { useNotifications } from '@/hooks/useNotifications';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { resolveDeepLink } from '@/routes/deepLink';
import { step } from '@/theme/motion';
import type { AppNotification, NotificationCode } from '@/types/notification';
import type { SupplyPaymentMode } from '@/types/supply';
import { cx } from '@/utils/cx';
import { dateKeyFromApi, formatDate, formatTime } from '@/utils/date';
import styles from './NotificationsPage.module.css';

/** `Record`s over every code, so a new notification fails `tsc` until it has an icon and a colour. */
const ICONS: Record<NotificationCode, IconType> = {
  ATTENDANCE_MARKED_PRESENT: IoCheckmarkCircle,
  ATTENDANCE_MARKED_ABSENT: IoCloseCircle,
  ATTENDANCE_MARKED_HALF_DAY: IoContrast,
  ATTENDANCE_MARKED_LEAVE: IoCalendarClear,
  SUPPLY_ORDER_PLACED: IoCart,
  SUPPLY_ORDER_ACCEPTED: IoCheckmarkDone,
  SUPPLY_ORDER_PACKED: IoCube,
  SUPPLY_ORDER_DISPATCHED: IoBicycle,
  SUPPLY_ORDER_DELIVERED: IoFlag,
  SUPPLY_ORDER_REJECTED: IoCloseCircle,
  SUPPLY_ORDER_DELAYED: IoTime,
  SUPPLY_PAYMENT_VERIFIED: IoCard,
  SUPPLY_ORDER_ASSIGNED: IoNavigate,
  SUPPLY_ORDER_SENT_TO_VENDOR: IoPaperPlane,
  SUPPLY_ORDER_READY_TO_PAY: IoWallet,
  SUPPLY_PAYMENT_SENT: IoCard,
};

const TINTS: Record<NotificationCode, string> = {
  ATTENDANCE_MARKED_PRESENT: 'var(--color-success)',
  ATTENDANCE_MARKED_ABSENT: 'var(--color-error)',
  ATTENDANCE_MARKED_HALF_DAY: 'var(--color-warning)',
  ATTENDANCE_MARKED_LEAVE: 'var(--color-text-secondary)',
  SUPPLY_ORDER_PLACED: 'var(--color-primary)',
  SUPPLY_ORDER_ACCEPTED: 'var(--color-primary)',
  SUPPLY_ORDER_PACKED: 'var(--color-primary)',
  SUPPLY_ORDER_DISPATCHED: 'var(--color-primary)',
  SUPPLY_ORDER_DELIVERED: 'var(--color-success)',
  SUPPLY_ORDER_REJECTED: 'var(--color-error)',
  SUPPLY_ORDER_DELAYED: 'var(--color-warning)',
  SUPPLY_PAYMENT_VERIFIED: 'var(--color-success)',
  SUPPLY_ORDER_ASSIGNED: 'var(--color-primary)',
  SUPPLY_ORDER_SENT_TO_VENDOR: 'var(--color-primary)',
  SUPPLY_ORDER_READY_TO_PAY: 'var(--color-warning)',
  SUPPLY_PAYMENT_SENT: 'var(--color-warning)',
};

const PAYMENT_MODES: SupplyPaymentMode[] = ['ONLINE', 'COD', 'ACCOUNTS'];

/** A payment mode arrives as its enum name and is put into words here, as the app does. */
function withPaymentWord(params: AppNotification['params'], t: TFunction): AppNotification['params'] {
  const mode = params?.payment;
  if (typeof mode !== 'string' || !PAYMENT_MODES.includes(mode as SupplyPaymentMode)) return params;
  return { ...params, payment: t(`supplyPaymentMode.${mode as SupplyPaymentMode}`) };
}

/**
 * The notification centre — the app's Notifications screen. Every sentence is
 * rebuilt from its code each time it draws, so changing language re-renders the
 * whole history. Opening one marks it read and goes where it points, or Home when
 * this person can no longer open that page.
 */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const membership = useMembership();
  const { notifications, unreadCount, isLoading, error, refresh, markRead, markAllRead } = useNotifications();
  useRefreshOnFocus(refresh);

  function open(notification: AppNotification) {
    void markRead(notification.id);
    if (notification.deepLink) navigate(resolveDeepLink(membership, notification.deepLink));
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('notificationCentre.title')}
        subtitle={
          unreadCount > 0 ? t('notificationCentre.unreadBadge', { count: unreadCount }) : t('notificationCentre.subtitle')
        }
        actions={
          unreadCount > 0 ? (
            <Button
              icon={IoCheckmarkDoneOutline}
              title={t('notificationCentre.markAllRead')}
              onClick={() => void markAllRead()}
            />
          ) : null
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      {isLoading && notifications.length === 0 ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : notifications.length === 0 ? (
        <Enter className={styles.empty}>
          <IoNotificationsOffOutline size={28} aria-hidden="true" />
          <p className={styles.emptyTitle}>{t('notificationCentre.empty')}</p>
          <p className={styles.emptyBody}>{t('notificationCentre.emptyBody')}</p>
        </Enter>
      ) : (
        <ul className={styles.list}>
          {notifications.map((notification, index) => {
            const unread = notification.status === 'UNREAD';
            const Icon = ICONS[notification.code];
            return (
              <Enter as="li" key={notification.id} delay={step(Math.min(index, 5))}>
                <button
                  type="button"
                  className={cx(styles.row, unread && styles.rowUnread)}
                  onClick={() => open(notification)}
                >
                  <span className={styles.icon} style={{ color: TINTS[notification.code] }} aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className={styles.body}>
                    <span className={cx(styles.message, unread && styles.messageUnread)}>
                      {t(
                        `notifications.${notification.code}` as 'notifications.SUPPLY_ORDER_PLACED',
                        withPaymentWord(notification.params, t)
                      )}
                    </span>
                    <span className={styles.when}>
                      {formatDate(dateKeyFromApi(notification.createdAt), t)} · {formatTime(notification.createdAt, t)}
                    </span>
                  </span>
                  {unread ? (
                    <>
                      <span className={styles.dot} aria-hidden="true" />
                      <span className="visually-hidden">{t('web.notifications.unread')}</span>
                    </>
                  ) : null}
                </button>
              </Enter>
            );
          })}
        </ul>
      )}
    </div>
  );
}
