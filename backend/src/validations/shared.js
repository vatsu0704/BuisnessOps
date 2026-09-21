const { isRealDateKey, isValidTimeZone } = require('../utils/datetime');

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value);
}

/** A real calendar date in YYYY-MM-DD form — rejects 2026-02-30. */
function isIsoDate(value) {
  return typeof value === 'string' && isRealDateKey(value);
}

/**
 * A weekly-off list: unique integers 0–6. An empty array is valid and means
 * "works every day". All seven is not — that would leave no working days at
 * all, and payroll would divide by zero.
 */
function isWeekdayList(value) {
  if (!Array.isArray(value)) return false;
  if (value.length > 6) return false;
  if (!value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
  return new Set(value).size === value.length;
}

function isOptionalString(value, maxLength = 200) {
  if (value === undefined || value === null) return true;
  return typeof value === 'string' && value.length <= maxLength;
}

function isOptionalNonNegativeNumber(value) {
  if (value === undefined || value === null) return true;
  return Number.isFinite(value) && value >= 0;
}

module.exports = {
  isValidEmail,
  isIsoDate,
  isValidTimeZone,
  isWeekdayList,
  isOptionalString,
  isOptionalNonNegativeNumber,
};
