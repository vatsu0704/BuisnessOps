import { toISODate } from '@shared/utils/date';

/**
 * The days a month's calendar draws.
 *
 * Web-only, and deliberately not in the shared files: the app opens the
 * platform's own picker (`@react-native-community/datetimepicker`), so there is
 * no second implementation for this to drift from.
 */

export interface CalendarCell {
  /** YYYY-MM-DD. */
  iso: string;
  day: number;
  /** Belongs to the month before or after the one on screen. */
  outside: boolean;
}

/** Six rows, always — see `buildMonthGrid`. */
export const WEEKS = 6;
export const DAYS_IN_WEEK = 7;
const CELLS = WEEKS * DAYS_IN_WEEK;

/**
 * Always 42 cells, Sunday first.
 *
 * **Six rows whatever the month needs.** A 28-day February starting on a Sunday
 * fills four rows and a 31-day one starting on a Saturday needs six, so a grid
 * sized to its contents changes height as you page through it — inside a
 * popover that means the panel jumps under the pointer, and the Today button
 * moves out from under a finger that was reaching for it.
 *
 * **Sunday first** because `Date.getDay()` and the backend's `weeklyOffDays`
 * both count from Sunday, so the column index *is* the weekday number. Shifting
 * to a Monday-first grid would put an off-by-one between this grid, the weekday
 * headings and the weekly-off chips, and only one of the three would look wrong.
 */
export function buildMonthGrid(month: number, year: number): CalendarCell[] {
  // Local midnight, as `fromISODate` uses — never `Date.UTC`, which lands on the
  // previous day for every zone west of Greenwich.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < CELLS; index += 1) {
    // Day-of-month overflow is what `new Date` is for: 0 is the last day of the
    // month before, 32 the first of the next, across year ends too.
    const date = new Date(year, month - 1, 1 + index - firstWeekday);
    cells.push({
      iso: toISODate(date),
      day: date.getDate(),
      outside: date.getMonth() !== month - 1,
    });
  }

  return cells;
}

/**
 * Is this day offered? Both bounds are inclusive and either may be absent.
 *
 * Plain string comparison, which is exactly right for YYYY-MM-DD and is why
 * every date in this project is carried as one rather than as a `Date`.
 */
export function isWithin(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** The nearest offered day, for a value or a "today" that falls outside the range. */
export function clampISO(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** `days` later, or earlier. Month and year ends are `new Date`'s problem, not ours. */
export function shiftISODays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return toISODate(new Date(year, month - 1, day + days));
}

/**
 * The same day number in another month, pinned to the month's length — the
 * arithmetic behind PageUp on the 31st. Without the pin, a month back from
 * 31 March is 31 February, which `new Date` reads as 3 March: paging up then
 * down would not return you to where you started.
 */
export function shiftISOMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const moved = new Date(year, month - 1 + months, 1);
  const length = new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate();
  return toISODate(new Date(moved.getFullYear(), moved.getMonth(), Math.min(day, length)));
}

/** The first and last day of a month, for asking whether any of it is in range. */
export function monthBounds(month: number, year: number): { first: string; last: string } {
  return {
    first: toISODate(new Date(year, month - 1, 1)),
    last: toISODate(new Date(year, month, 0)),
  };
}
