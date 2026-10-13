import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { monthKeyShortLabel } from '@/utils/date';
import { cx } from '@/utils/cx';
import styles from './MonthStrip.module.css';

/**
 * Which month every card is showing — the app's `MonthStrip`. Chips sized by
 * their own label in a row that scrolls sideways inside itself, never the page.
 * It starts scrolled to the end, because the month a person wants is almost
 * always the latest, and it is the one furthest along.
 */
export default function MonthStrip({
  months,
  selected,
  onSelect,
  label,
}: {
  months: string[];
  selected: string;
  onSelect: (month: string) => void;
  /** The group's accessible name. */
  label: string;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);

  // Once per window: a refresh re-renders the same months and must not yank the
  // row back while somebody is reading an earlier one.
  const scrolledFor = useRef('');
  const windowKey = months.join(',');
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || scrolledFor.current === windowKey) return;
    scrolledFor.current = windowKey;
    row.scrollLeft = row.scrollWidth;
  }, [windowKey]);

  return (
    <div ref={rowRef} className={styles.row} role="group" aria-label={label}>
      {months.map((month) => {
        const isSelected = month === selected;
        return (
          <button
            key={month}
            type="button"
            className={cx(styles.chip, isSelected && styles.selected)}
            aria-pressed={isSelected}
            onClick={() => onSelect(month)}
          >
            {monthKeyShortLabel(month, t)}
          </button>
        );
      })}
    </div>
  );
}
