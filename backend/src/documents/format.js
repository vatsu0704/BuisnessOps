const { dec } = require('../utils/money');

/**
 * Display formatting for documents.
 *
 * Node has full ICU, so `Intl` is dependable here in a way it is not on the
 * device (Hermes) — which is why the app's own `formatAmount` is a hand-rolled
 * stopgap and this is not. INR gets Indian 2-2-3 grouping (₹3,40,000), because
 * a payslip for an Indian business showing ₹340,000 reads as wrong.
 */
const LOCALE_BY_CURRENCY = { INR: 'en-IN' };

function localeFor(currency) {
  return LOCALE_BY_CURRENCY[currency] || 'en-US';
}

/** `₹25,227.27` — symbol, grouped, always two decimals. */
function formatMoney(amount, currency) {
  const value = dec(amount).toNumber();
  try {
    return new Intl.NumberFormat(localeFor(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unknown or malformed currency code must not take the payslip down.
    return `${currency} ${dec(amount).toFixed(2)}`;
  }
}

/** Day counts: `18.5`, not `18.50`, and `22` rather than `22.00`. */
function formatDays(value) {
  const d = dec(value);
  return d.isInteger() ? d.toFixed(0) : d.toFixed(1);
}

/** `20 September 2026` */
function formatDateLong(dateKey, locale = 'en-IN') {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, d))
    );
  } catch {
    return dateKey;
  }
}

/** `September 2026` from a `2026-09` month key. */
function formatMonthYear(monthYear, locale = 'en-IN') {
  const [y, m] = String(monthYear).split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, 1))
    );
  } catch {
    return monthYear;
  }
}

/** A timestamp in the branch's own timezone, so the footer isn't in UTC. */
function formatTimestamp(instant, timeZone, locale = 'en-IN') {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 16).replace('T', ' ');
  }
}

module.exports = { formatMoney, formatDays, formatDateLong, formatMonthYear, formatTimestamp };
