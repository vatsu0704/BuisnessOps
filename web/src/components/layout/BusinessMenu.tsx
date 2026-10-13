import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmark, IoChevronDown } from 'react-icons/io5';
import Pill from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import popover from '@/components/ui/Popover.module.css';
import { useDismiss } from '@/hooks/useDismiss';
import { useMembership } from '@/hooks/useBusinessId';
import { useAuthStore } from '@/store/authStore';
import { cx } from '@/utils/cx';
import { switchableMemberships } from '@/utils/permissions';
import styles from './BusinessMenu.module.css';

/**
 * The business and role in the top bar — and, for someone in more than one
 * business, the way to switch. A web app is expected to keep that one click away;
 * Settings has the same choice as a card (and is where it lives on a phone).
 */
export default function BusinessMenu() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const switchBusiness = useAuthStore((s) => s.switchBusiness);
  const isSwitching = useAuthStore((s) => s.isSwitchingBusiness);
  const membership = useMembership();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close, buttonRef);

  const memberships = switchableMemberships(user);
  const role = membership ? <Pill label={t(`role.${membership.role}`)} tone="muted" /> : null;

  if (memberships.length < 2) {
    return (
      <div className={styles.static}>
        {business ? <p className={styles.name}>{business.name}</p> : null}
        {role}
      </div>
    );
  }

  return (
    <div className={cx(popover.wrap, styles.wrap)} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t('businessSwitcher.title')}: ${business?.name ?? ''}`}
      >
        <span className={styles.name}>{business?.name}</span>
        {isSwitching ? <Spinner size={14} /> : <IoChevronDown size={15} aria-hidden="true" />}
      </button>
      {role}

      {open ? (
        <ul id={menuId} className={cx(popover.panel, popover.panelLeft, styles.panel)} aria-label={t('businessSwitcher.title')}>
          {memberships.map((m) => {
            const selected = m.businessId === activeBusinessId;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={cx(popover.option, selected && popover.optionSelected)}
                  aria-current={selected || undefined}
                  disabled={isSwitching}
                  onClick={() => {
                    close();
                    buttonRef.current?.focus();
                    // A failed switch leaves the current business in place;
                    // Settings' switcher is where the reason is shown.
                    void switchBusiness(m.businessId).catch(() => undefined);
                  }}
                >
                  <span className={styles.optionText}>
                    <span className={styles.optionName}>{m.business.name}</span>
                    <span className={styles.optionRole}>{t(`role.${m.role}`)}</span>
                  </span>
                  {selected ? <IoCheckmark size={16} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
