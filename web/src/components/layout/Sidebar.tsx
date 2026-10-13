import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoClose } from 'react-icons/io5';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import { NAV_GROUPS, SETTINGS_ENTRY, type NavEntry } from '@/constants/navigation';
import { useMembership } from '@/hooks/useBusinessId';
import { cx } from '@/utils/cx';
import { passesAnyGate } from '@/utils/permissions';
import styles from './Sidebar.module.css';

type Props = {
  id: string;
  /** Only meaningful below the desktop breakpoint, where the sidebar is a drawer. */
  open: boolean;
  onClose: () => void;
};

function NavItem({ entry }: { entry: NavEntry }) {
  const { t } = useTranslation();
  const Icon = entry.icon;
  return (
    <li>
      <NavLink
        to={entry.path}
        end={entry.path === '/'}
        className={({ isActive }) => cx(styles.link, isActive && styles.active)}
      >
        <Icon size={18} aria-hidden="true" className={styles.linkIcon} />
        <span className={styles.linkLabel}>{t(entry.labelKey)}</span>
      </NavLink>
    </li>
  );
}

/**
 * The navigation: always visible on a wide window, a drawer on a narrow one.
 * Groups with nothing this role can open are left out entirely.
 */
export default function Sidebar({ id, open, onClose }: Props) {
  const { t } = useTranslation();
  const membership = useMembership();
  const closeRef = useRef<HTMLButtonElement>(null);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => passesAnyGate(membership, entry.gates)),
  })).filter((group) => group.entries.length > 0);

  // As a drawer: Escape closes it, and focus moves into it when it opens.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open ? <div className={styles.backdrop} onClick={onClose} aria-hidden="true" /> : null}
      <aside id={id} className={cx(styles.sidebar, open && styles.open)}>
        <div className={styles.brand}>
          <BrandMark width={34} />
          <Wordmark size={18} className={styles.wordmark} />
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('web.shell.closeMenu')}
          >
            <IoClose size={22} aria-hidden="true" />
          </button>
        </div>

        <nav className={styles.nav} aria-label={t('web.shell.mainNav')}>
          {groups.map((group) => (
            <div key={group.key} className={styles.group}>
              <p className={styles.groupLabel}>{t(group.labelKey)}</p>
              <ul className={styles.list}>
                {group.entries.map((entry) => (
                  <NavItem key={entry.key} entry={entry} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <ul className={cx(styles.list, styles.footer)}>
          <NavItem entry={SETTINGS_ENTRY} />
        </ul>
      </aside>
    </>
  );
}
