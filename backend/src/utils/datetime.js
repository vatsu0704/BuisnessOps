/**
 * Calendar-date helpers that respect a branch's own timezone.
 *
 * Attendance previously computed "today" from the server's UTC clock. For IST
 * (UTC+05:30) that put every punch before 05:30 local on the *previous*
 * calendar day — so a cook starting at 06:00, in a shop whose first bill is at
 * 07:02, had their attendance filed against yesterday and their pay computed
 * from the wrong month at the boundary.
 *
 * Storage is unchanged: `@db.Date` columns still round-trip through Prisma as a
 * Date at UTC midnight. The only thing these helpers change is *which* calendar
 * day gets chosen.
 */

// Constructing an Intl.DateTimeFormat per punch is measurably slow, and there
// are only ever a handful of distinct timezones in play.
const formatters = new Map();

function zoneFormatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }
  return formatters.get(timeZone);
}

function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Branch.timezone is a required column but has never been validated on write,
 * so a branch created before `validateUpdateBranch` existed may hold anything.
 * Falling back beats throwing: a bad timezone should not 500 a punch-in.
 */
function safeZone(timeZone, fallback = 'UTC') {
  if (isValidTimeZone(timeZone)) return timeZone;
  return isValidTimeZone(fallback) ? fallback : 'UTC';
}

/** 'YYYY-MM-DD' as seen in `timeZone` at `instant`. */
function localDateKey(instant, timeZone) {
  // formatToParts rather than trusting en-CA to order the parts, which is
  // locale data and not a guarantee.
  const parts = zoneFormatter(safeZone(timeZone)).formatToParts(instant);
  const at = (type) => parts.find((p) => p.type === type).value;
  return `${at('year')}-${at('month')}-${at('day')}`;
}

/** 'YYYY-MM-DD' to the UTC-midnight Date that @db.Date columns store. */
function dateOnly(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The reverse, for a Date already read out of a @db.Date column. */
function dateKeyOf(date) {
  return localDateKey(date, 'UTC');
}

function todayKeyInZone(timeZone) {
  return localDateKey(new Date(), timeZone);
}

function todayInZone(timeZone) {
  return dateOnly(todayKeyInZone(timeZone));
}

/**
 * A calendar date's weekday is the same in every timezone, so this reads the
 * UTC-midnight Date directly and needs no zone. 0 = Sunday, matching the
 * convention stored in Business.weeklyOffDays.
 */
function weekdayOf(key) {
  return dateOnly(key).getUTCDay();
}

function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(month, year) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ['2026-09-01', '2026-09-02', …] for the whole month. */
function eachDayOfMonth(month, year) {
  const total = daysInMonth(month, year);
  const keys = [];
  for (let d = 1; d <= total; d += 1) {
    keys.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return keys;
}

/** Calendar-valid, not just regex-shaped: rejects 2026-02-30 and 2026-13-01. */
function isRealDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false;
  return dateKeyOf(dateOnly(key)) === key;
}

module.exports = {
  isValidTimeZone,
  safeZone,
  localDateKey,
  dateOnly,
  dateKeyOf,
  todayKeyInZone,
  todayInZone,
  weekdayOf,
  monthKey,
  daysInMonth,
  eachDayOfMonth,
  isRealDateKey,
};
