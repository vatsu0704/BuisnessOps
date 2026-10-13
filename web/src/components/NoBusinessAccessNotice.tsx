import { useTranslation } from 'react-i18next';
import { IoLockClosedOutline } from 'react-icons/io5';
import styles from './NoBusinessAccessNotice.module.css';

/**
 * Signed in, but revoked from every business. Said out loud, because otherwise
 * Home renders a dashboard of zeros with buttons that fail.
 */
export default function NoBusinessAccessNotice() {
  const { t } = useTranslation();
  return (
    <div className={styles.card} role="status">
      <IoLockClosedOutline className={styles.icon} size={18} aria-hidden="true" />
      <div>
        <p className={styles.title}>{t('settings.noAccessTitle')}</p>
        <p className={styles.body}>{t('settings.noAccessBody')}</p>
      </div>
    </div>
  );
}
