const { isRealDateKey, isValidTimeZone } = require('../utils/datetime');
const { fieldError } = require('../errors');

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

/**
 * Shorthands for the field rejections that recur across every validator.
 *
 * A validator now returns `{ code, field, params }` objects rather than English
 * sentences, because the sentence has to be written in the reader's language
 * and this process does not know it. These keep the call sites as short as the
 * strings they replace — `errors.push(required('name'))` — so the shape change
 * costs no readability.
 */
const required = (field) => fieldError('FIELD_REQUIRED', field);
const mustBeString = (field) => fieldError('FIELD_MUST_BE_STRING', field);
const mustBeNonEmptyString = (field) => fieldError('FIELD_MUST_BE_NON_EMPTY_STRING', field);
const cannotBeEmpty = (field) => fieldError('FIELD_CANNOT_BE_EMPTY', field);
const mustBeBoolean = (field) => fieldError('FIELD_MUST_BE_BOOLEAN', field);
const mustBeNonNegative = (field) => fieldError('FIELD_MUST_BE_NON_NEGATIVE', field);
const mustBeDate = (field) => fieldError('FIELD_MUST_BE_DATE', field);
const mustBeStringArray = (field) => fieldError('FIELD_MUST_BE_STRING_ARRAY', field);
const maxLength = (field, max) => fieldError('FIELD_MAX_LENGTH', field, { max });
const stringMaxLength = (field, max) => fieldError('FIELD_STRING_MAX_LENGTH', field, { max });
// `options` is pre-joined so the rendered sentence reads the same in every
// language without each one having to know how to join a list.
const mustBeOneOf = (field, options) => fieldError('FIELD_MUST_BE_ONE_OF', field, { options: options.join(', ') });
const provideAtLeastOne = (fields) => fieldError('PROVIDE_AT_LEAST_ONE', null, { fields: fields.join(', ') });

module.exports = {
  isValidEmail,
  isIsoDate,
  isValidTimeZone,
  isWeekdayList,
  isOptionalString,
  isOptionalNonNegativeNumber,
  required,
  mustBeString,
  mustBeNonEmptyString,
  cannotBeEmpty,
  mustBeBoolean,
  mustBeNonNegative,
  mustBeDate,
  mustBeStringArray,
  maxLength,
  stringMaxLength,
  mustBeOneOf,
  provideAtLeastOne,
};
