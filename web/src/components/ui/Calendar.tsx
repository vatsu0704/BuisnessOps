import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { IoChevronBack, IoChevronDown, IoChevronForward } from 'react-icons/io5';
import { addMonths, monthLabel, todayISO, weekdayName, weekdayOfISO } from '@shared/utils/date';
import {
  DAYS_IN_WEEK,
  WEEKS,
  buildMonthGrid,
  clampISO,
  isWithin,
  monthBounds,
  shiftISODays,
  shiftISOMonths,
} from '@/utils/calendarGrid';
import { cx } from '@/utils/cx';
import styles from './Calendar.module.css';

type Props = {
  /** YYYY-MM-DD, or null for a field nothing has been chosen in yet. */
  value: string | null;
  onSelect: (iso: string) => void;
  min?: string;
  max?: string;
  /** Take focus as it appears. For a popover, which opened because of a click. */
  autoFocus?: boolean;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * A month of days.
 *
 * ## Why this is hand-built
 *
 * It replaces `<input type="date">`'s own calendar, which is the browser's, not
 * this app's: a different panel in Chrome, Firefox and Safari, none of them
 * carrying a token from `tokens.css`, and all of them printing month and weekday
 * names from the **browser's** locale. A shop with the app in Gujarati got an
 * English calendar, because the language lives in `localStorage` and Chrome has
 * never heard of it.
 *
 * A date-picker package would fix the styling and not that: react-day-picker and
 * the rest take their month names from `date-fns`/`Intl` locales, so the web
 * would print one set of month names and the app — which reads `month.1` from
 * the same four locale files this does — another. Those files are the project's
 * single source for a month name precisely because Hermes has no dependable
 * `Intl`, and a package would quietly reintroduce the second source. The grid
 * itself is `buildMonthGrid`, which is forty lines and tested.
 *
 * ## Moving around it
 *
 * Arrows a day and a week, PageUp/PageDown a month, Home/End to the ends of the
 * week, Enter or Space to choose. One cell is tabbable at a time (a roving
 * tabindex), so Tab leaves the grid rather than walking 42 buttons.
 *
 * Out-of-range days are `aria-disabled`, never `disabled`: a disabled button
 * cannot hold focus, and the roving tabindex would fall out of the grid the
 * moment it landed on one.
 */
export default function Calendar({ value, onSelect, min, max, autoFocus }: Props) {
  const { t } = useTranslation();
  const today = todayISO();

  /**
   * One piece of state for two jobs: which cell the arrows are on, **and** which
   * month is drawn. They were separate at first, and a month paged with the
   * chevron then had no tabbable cell at all — the roving index was still on a
   * day in the month you had just left, so every cell on screen was
   * `tabIndex={-1}` and the keyboard could not get into the grid. Deriving the
   * month from the focused day makes that impossible rather than fixed.
   *
   * It opens on the chosen day, else today, else the nearest day offered.
   */
  const [focused, setFocused] = useState(() => clampISO(value ?? today, min, max));
  const [pickingMonth, setPickingMonth] = useState(false);
  const cursor = { month: Number(focused.slice(5, 7)), year: Number(focused.slice(0, 4)) };

  const gridRef = useRef<HTMLDivElement>(null);
  // Focus follows the roving index, but only when it moved by keyboard —
  // otherwise clicking a chevron would throw focus into the grid and you could
  // not press it twice.
  const wantsFocus = useRef(Boolean(autoFocus));

  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus();
  }, [focused, pickingMonth]);

  /** Move the roving index, bringing the month on screen with it. */
  function placeCursor(iso: string, takeFocus: boolean) {
    setFocused(clampISO(iso, min, max));
    if (takeFocus) wantsFocus.current = true;
  }

  const moveTo = (iso: string) => placeCursor(iso, true);

  function choose(iso: string) {
    if (!isWithin(iso, min, max)) return;
    onSelect(iso);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

    if (key in moves) {
      event.preventDefault();
      moveTo(shiftISODays(focused, moves[key]));
      return;
    }
    switch (key) {
      case 'PageUp':
        event.preventDefault();
        moveTo(shiftISOMonths(focused, -1));
        break;
      case 'PageDown':
        event.preventDefault();
        moveTo(shiftISOMonths(focused, 1));
        break;
      case 'Home':
        event.preventDefault();
        moveTo(shiftISODays(focused, -weekdayOfISO(focused)));
        break;
      case 'End':
        event.preventDefault();
        moveTo(shiftISODays(focused, 6 - weekdayOfISO(focused)));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(focused);
        break;
      default:
        break;
    }
  }

  // A year at a time while the months are showing, a month at a time otherwise.
  // The pointer keeps its focus on the chevron, so it can be pressed again.
  const step = (delta: number) => placeCursor(shiftISOMonths(focused, pickingMonth ? delta * 12 : delta), false);

  // Nothing to page to when every day beyond this month is out of range.
  const previous = addMonths(cursor.month, cursor.year, -1);
  const next = addMonths(cursor.month, cursor.year, 1);
  const canGoBack = pickingMonth
    ? !min || monthBounds(12, cursor.year - 1).last >= min
    : !min || monthBounds(previous.month, previous.year).last >= min;
  const canGoForward = pickingMonth
    ? !max || monthBounds(1, cursor.year + 1).first <= max
    : !max || monthBounds(next.month, next.year).first <= max;

  const cells = buildMonthGrid(cursor.month, cursor.year);
  const weeks = Array.from({ length: WEEKS }, (_, row) =>
    cells.slice(row * DAYS_IN_WEEK, (row + 1) * DAYS_IN_WEEK)
  );
  const todayTarget = clampISO(today, min, max);

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.step}
          disabled={!canGoBack}
          aria-label={pickingMonth ? t('web.calendar.previousYear') : t('web.month.previous')}
          onClick={() => step(-1)}
        >
          <IoChevronBack size={16} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={styles.caption}
          aria-expanded={pickingMonth}
          aria-label={t('web.calendar.chooseMonth')}
          onClick={() => setPickingMonth((open) => !open)}
        >
          <span>{pickingMonth ? cursor.year : monthLabel(cursor.month, cursor.year, t)}</span>
          <IoChevronDown size={14} aria-hidden="true" className={cx(pickingMonth && styles.captionOpen)} />
        </button>

        <button
          type="button"
          className={styles.step}
          disabled={!canGoForward}
          aria-label={pickingMonth ? t('web.calendar.nextYear') : t('web.month.next')}
          onClick={() => step(1)}
        >
          <IoChevronForward size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Twelve months rather than a year of paging: a hire date five years back
          is sixty presses of the chevron otherwise. */}
      {pickingMonth ? (
        <div className={styles.months}>
          {MONTHS.map((month) => {
            const bounds = monthBounds(month, cursor.year);
            const offered = (!min || bounds.last >= min) && (!max || bounds.first <= max);
            const isCurrent = month === cursor.month;
            return (
              <button
                key={month}
                type="button"
                className={cx(styles.month, isCurrent && styles.monthSelected)}
                disabled={!offered}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  placeCursor(shiftISOMonths(focused, month - cursor.month), false);
                  setPickingMonth(false);
                }}
              >
                {t(`month.short.${month}` as 'month.short.1')}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className={styles.weekdays} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <span key={day} className={styles.weekday}>
                {weekdayName(day, t)}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            role="grid"
            className={styles.grid}
            aria-label={monthLabel(cursor.month, cursor.year, t)}
            onKeyDown={onKeyDown}
          >
            {/* A grid's cells must sit in rows. `display: contents` supplies the
                role without putting a box between the grid and its columns. */}
            {weeks.map((week) => (
              <div key={week[0].iso} role="row" className={styles.row}>
                {week.map((cell) => {
                  const offered = isWithin(cell.iso, min, max);
                  const selected = cell.iso === value;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      role="gridcell"
                      data-focused={cell.iso === focused}
                      // One stop for the whole grid; the arrows do the rest.
                      tabIndex={cell.iso === focused ? 0 : -1}
                      aria-selected={selected}
                      aria-disabled={!offered}
                      aria-current={cell.iso === today ? 'date' : undefined}
                      aria-label={formatCellLabel(cell.iso, t)}
                      className={cx(
                        styles.day,
                        cell.outside && styles.dayOutside,
                        cell.iso === today && styles.dayToday,
                        selected && styles.daySelected,
                        !offered && styles.dayDisabled
                      )}
                      onClick={() => {
                        setFocused(cell.iso);
                        choose(cell.iso);
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.today}
          // `max` is the *branch's* today on the counter, which may be a day
          // behind the machine's — so choose the nearest day actually offered.
          onClick={() => choose(todayTarget)}
        >
          {t('web.calendar.today')}
        </button>
      </div>
    </div>
  );
}

/**
 * "Tuesday, 20 October 2026" — what a screen reader says on each cell.
 *
 * The long weekday, not the heading's "Tue": the headings are `aria-hidden`
 * because a column heading is a visual aid, so each cell has to carry its own
 * day of the week or the grid reads as 42 bare numbers.
 */
function formatCellLabel(iso: string, t: TFunction): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${t(`weekdayLong.${weekdayOfISO(iso)}` as 'weekdayLong.0')}, ${day} ${t(`month.${month}` as 'month.1')} ${year}`;
}
