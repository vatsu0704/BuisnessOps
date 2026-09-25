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

const wallFormatters = new Map();

function wallClockFormatter(timeZone) {
  if (!wallFormatters.has(timeZone)) {
    wallFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return wallFormatters.get(timeZone);
}

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

/**
 * How far ahead of UTC `timeZone` is at `instant`, in minutes.
 *
 * Derived by formatting the instant in the zone and reading the wall clock
 * back, because there is no API that simply states an offset.
 */
function offsetMinutesAt(instant, timeZone) {
  const parts = wallClockFormatter(safeZone(timeZone)).formatToParts(instant);
  const at = (type) => Number(parts.find((p) => p.type === type).value);
  // Some ICU builds render midnight as hour 24 under hour12: false.
  const wall = Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second'));
  return (wall - instant.getTime()) / 60000;
}

/**
 * The half-open [start, end) UTC instants of one local calendar day.
 *
 * `@db.Date` columns already hold a branch-local calendar day, so anything
 * keyed on one needs no conversion. Transaction.occurredAt is an *instant*,
 * though, so answering "what did this branch sell today?" means turning the
 * branch's local day into the window of real time it occupied. Asking Postgres
 * for `occurredAt::date` instead would compare UTC days and, in IST, count
 * every sale before 05:30 against the day before — and it could not use the
 * (businessId, branchId, occurredAt) index either, because a function over the
 * column is not indexable.
 *
 * The second offset read is the daylight-saving correction: the offset is
 * sampled at UTC midnight, which can fall on the other side of a transition
 * from the local midnight being sought. India never shifts, so this is a no-op
 * there and correct elsewhere.
 */
function localDayRange(key, timeZone) {
  const utcMidnight = dateOnly(key);
  const firstGuess = new Date(utcMidnight.getTime() - offsetMinutesAt(utcMidnight, timeZone) * 60000);
  const start = new Date(utcMidnight.getTime() - offsetMinutesAt(firstGuess, timeZone) * 60000);

  const nextUtcMidnight = new Date(utcMidnight.getTime() + 86400000);
  const nextGuess = new Date(nextUtcMidnight.getTime() - offsetMinutesAt(nextUtcMidnight, timeZone) * 60000);
  const end = new Date(nextUtcMidnight.getTime() - offsetMinutesAt(nextGuess, timeZone) * 60000);

  return { start, end };
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
  localDayRange,
  todayKeyInZone,
  todayInZone,
  weekdayOf,
  monthKey,
  daysInMonth,
  eachDayOfMonth,
  isRealDateKey,
};
