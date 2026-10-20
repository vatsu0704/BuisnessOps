import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCalendarOutline, IoChevronDown } from 'react-icons/io5';
import { formatDateLong, formatDateMedium } from '@shared/utils/date';
import { useDismiss } from '@/hooks/useDismiss';
import { cx } from '@/utils/cx';
import Calendar from './Calendar';
import styles from './DatePicker.module.css';

type Props = {
  /** YYYY-MM-DD, or '' for nothing chosen yet. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** The control's accessible name. Rendered by `DateField`, not by this. */
  label: string;
  id?: string;
  describedBy?: string;
  /** The short form, for a cursor strip rather than a form. */
  compact?: boolean;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * A date, chosen from the app's own calendar.
 *
 * The field is a **button**, not an `<input type="date">`. The native input
 * brings the browser's calendar with it, and that panel cannot be styled at
 * all — `::-webkit-calendar-picker-indicator` reaches the little icon and
 * nothing behind it. It also draws in the browser's language rather than the
 * one chosen in Settings, and differs in Chrome, Firefox and Safari.
 *
 * What is given up with the native input is its text entry — typing 20/10/2026
 * instead of paging to it. The calendar's month chooser covers the long jumps
 * that made that worth having, and every date in this app is within a few
 * months of today except a hire date.
 */
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  label,
  id,
  describedBy,
  compact,
  disabled,
  invalid,
}: Props) {
  const { t } = useTranslation();
  const fallbackId = useId();
  const fieldId = id ?? fallbackId;
  const panelId = `${fieldId}-panel`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useDismiss(wrapRef, open, () => setOpen(false), triggerRef);

  /**
   * A date field near the foot of a form opens its panel below the fold, and a
   * calendar you have to scroll to is one nobody finds. Flipping it above the
   * field in CSS would need to know the room there is, which only the browser
   * does — so ask the browser to bring the whole panel into view instead.
   *
   * `block: 'nearest'` scrolls only as far as it has to, so a panel that already
   * fits does not move the page at all.
   */
  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  return (
    <div className={cx(styles.wrap, compact && styles.wrapCompact)} ref={wrapRef}>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        className={cx(
          styles.field,
          compact && styles.fieldCompact,
          open && styles.fieldOpen,
          invalid && styles.fieldInvalid
        )}
        // `MultiPicker` is the other `aria-haspopup=dialog` on these pages, so
        // the screenshot harness needs a name for this one specifically.
        data-testid="date-picker"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
      >
        {compact ? null : (
          <span className={styles.iconBox} aria-hidden="true">
            <IoCalendarOutline size={18} />
          </span>
        )}
        <span className={cx(styles.value, !value && styles.placeholder)}>
          {value ? (compact ? formatDateMedium(value, t) : formatDateLong(value, t)) : t('dateField.pick')}
        </span>
        <span className={styles.chevron} aria-hidden="true">
          <IoChevronDown size={compact ? 14 : 16} />
        </span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          aria-modal="false"
          className={cx(styles.panel, compact && styles.panelCentred)}
        >
          <Calendar
            value={value || null}
            min={min}
            max={max}
            autoFocus
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
