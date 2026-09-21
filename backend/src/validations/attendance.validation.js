const { isRealDateKey } = require('../utils/datetime');
const { maxLength, mustBeOneOf, mustBeString, mustBeNonNegative } = require('./shared');
const { fieldError } = require('../errors');

const MARKABLE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];
const NOTES_MAX = 500;

function validateCoordinates(body) {
  const errors = [];
  const hasLat = body.latitude !== undefined && body.latitude !== null;
  const hasLng = body.longitude !== undefined && body.longitude !== null;
  if (hasLat !== hasLng) errors.push(fieldError('LAT_LNG_TOGETHER', 'latitude'));
  if (hasLat && (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) {
    errors.push(fieldError('LATITUDE_RANGE', 'latitude'));
  }
  if (hasLng && (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180)) {
    errors.push(fieldError('LONGITUDE_RANGE', 'longitude'));
  }
  return errors;
}

function validatePunch(body) {
  return validateCoordinates(body);
}

function validateMarkAttendance(body) {
  const errors = [];
  // isRealDateKey, not a bare regex: the old check accepted 2026-13-45, which
  // Date.UTC then silently rolled over into February 2027.
  if (!body.date || typeof body.date !== 'string' || !isRealDateKey(body.date)) {
    errors.push(fieldError('DATE_REQUIRED', 'date'));
  }
  if (!body.status || !MARKABLE_STATUSES.includes(body.status)) {
    errors.push(mustBeOneOf('status', MARKABLE_STATUSES));
  }
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') errors.push(mustBeString('notes'));
    else if (body.notes.length > NOTES_MAX) errors.push(maxLength('notes', NOTES_MAX));
  }
  return errors;
}

// Was inline in the controller — the only place the validations/ pattern was
// broken.
function validateRosterQuery(query) {
  const errors = [];
  if (!query.date || typeof query.date !== 'string' || !isRealDateKey(query.date)) {
    errors.push(fieldError('DATE_REQUIRED', 'date'));
  }
  return errors;
}

function validateMonthYearQuery(query) {
  const errors = [];
  const month = Number(query.month);
  const year = Number(query.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push(fieldError('MONTH_REQUIRED', 'month'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push(fieldError('YEAR_REQUIRED', 'year'));
  return errors;
}

function validateGeneratePayroll(body) {
  const errors = [];
  const month = Number(body.month);
  const year = Number(body.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push(fieldError('MONTH_REQUIRED', 'month'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push(fieldError('YEAR_REQUIRED', 'year'));
  if (body.deductions !== undefined && body.deductions !== null) {
    if (!Number.isFinite(body.deductions) || body.deductions < 0) {
      errors.push(mustBeNonNegative('deductions'));
    }
  }
  return errors;
}

module.exports = {
  validatePunch,
  validateMarkAttendance,
  validateMonthYearQuery,
  validateRosterQuery,
  validateGeneratePayroll,
};
