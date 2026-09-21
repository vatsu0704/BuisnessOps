import type { TFunction } from 'i18next';

/**
 * Local-time date helpers.
 *
 * Replaces two copies of `todayISO()` that both used
 * `new Date().toISOString().slice(0, 10)` — which is UTC. For IST that made
 * "today" resolve to yesterday between midnight and 05:30 local, so the punch
 * card showed the wrong day's record and the history list duplicated it.
 *
 * Nothing here uses Intl: Hermes has no dependable Intl, which is exactly why
 * month and weekday names are looked up from the translation files instead.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as YYYY-MM-DD in the DEVICE's local time. Never toISOString(). */
export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight, so a value round-trips through a date picker unchanged. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Attendance.date arrives as a UTC-midnight instant ('2026-09-20T00:00:00.000Z').
 * Slicing the STRING is correct and timezone-safe; `new Date(value).getDate()`
 * is off by one everywhere west of UTC.
 */
export function dateKeyFromApi(value: string): string {
  return value.slice(0, 10);
}

export function monthKey(month: number, year: number): string {
  return `${year}-${pad(month)}`;
}

export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function addMonths(month: number, year: number, delta: number): { month: number; year: number } {
  const zero = month - 1 + delta;
  return { month: ((zero % 12) + 12) % 12 + 1, year: year + Math.floor(zero / 12) };
}

export function isFutureISO(iso: string): boolean {
  return iso > todayISO();
}

/** 0 = Sunday, matching the backend's weeklyOffDays convention. */
export function weekdayOfISO(iso: string): number {
  return fromISODate(iso).getDay();
}

export function monthName(month: number, t: TFunction): string {
  return t(`month.${month}` as 'month.1');
}

export function monthLabel(month: number, year: number, t: TFunction): string {
  return `${monthName(month, t)} ${year}`;
}

export function weekdayName(weekday: number, t: TFunction): string {
  return t(`weekday.${weekday}` as 'weekday.0');
}

/** "Sat, 20 Sep" — short and translated, for day rows and the punch card. */
export function formatDate(iso: string, t: TFunction): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${weekdayName(weekdayOfISO(iso), t)}, ${d} ${t(`month.short.${m}` as 'month.short.1')}`;
}

/** "20 September 2026" — long form, for a date field's displayed value. */
export function formatDateLong(iso: string, t: TFunction): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${monthName(m, t)} ${y}`;
}
