import { useCallback, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoLogOutOutline, IoOptionsOutline } from 'react-icons/io5';
import { useDismiss } from '@/hooks/useDismiss';
import { useMembership } from '@/hooks/useBusinessId';
import { useAuthStore } from '@/store/authStore';
import { initials } from '@/utils/initials';
import styles from './UserMenu.module.css';

/**
 * The avatar in the top bar: who is signed in, as what, and the way out. On the
 * phone this lives in Settings; a web app is expected to keep it one click away.
 */
export default function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const logout = useAuthStore((s) => s.logout);
  const membership = useMembership();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close, buttonRef);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatar}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('web.shell.accountMenu')}
      >
        {initials(user?.name, user?.email)}
      </button>

      {open ? (
        <div id={menuId} className={styles.menu}>
          <div className={styles.identity}>
            <p className={styles.name}>{user?.name || user?.email}</p>
            {user?.name ? <p className={styles.email}>{user.email}</p> : null}
            {membership ? (
              <p className={styles.role}>
                {t(`role.${membership.role}`)}
                {business ? ` · ${business.name}` : ''}
              </p>
            ) : null}
          </div>
          <Link to="/settings" className={styles.item} onClick={close}>
            <IoOptionsOutline size={17} aria-hidden="true" />
            <span>{t('tabs.settings')}</span>
          </Link>
          <button
            type="button"
            className={`${styles.item} ${styles.danger}`}
            onClick={() => {
              close();
              logout();
              navigate('/login', { replace: true });
            }}
          >
            <IoLogOutOutline size={17} aria-hidden="true" />
            <span>{t('settings.logout')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
