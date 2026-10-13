import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoNotifications, IoNotificationsOutline } from 'react-icons/io5';
import { useNotifications } from '@/hooks/useNotifications';
import { pathTo } from '@/routes/paths';
import { cx } from '@/utils/cx';
import styles from './NotificationBell.module.css';

/** The bell in the top bar: how many are unread, and the way to the centre. */
export default function NotificationBell() {
  const { t } = useTranslation();
  const { unreadCount } = useNotifications();
  const unread = unreadCount > 0;

  return (
    <Link
      to={pathTo('notifications')}
      className={cx(styles.bell, unread && styles.unread)}
      aria-label={unread ? t('notificationCentre.unreadBadge', { count: unreadCount }) : t('notificationCentre.title')}
    >
      {unread ? <IoNotifications size={18} aria-hidden="true" /> : <IoNotificationsOutline size={18} aria-hidden="true" />}
      {/* Overhangs the button, so the bell inside stays centred and readable. */}
      {unread ? (
        <span className={styles.badge} aria-hidden="true">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
