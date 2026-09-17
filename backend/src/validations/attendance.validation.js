const MARKABLE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateCoordinates(body) {
  const errors = [];
  const hasLat = body.latitude !== undefined && body.latitude !== null;
  const hasLng = body.longitude !== undefined && body.longitude !== null;
  if (hasLat !== hasLng) errors.push('latitude and longitude must be provided together');
  if (hasLat && (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) {
    errors.push('latitude must be a number between -90 and 90');
  }
  if (hasLng && (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180)) {
    errors.push('longitude must be a number between -180 and 180');
  }
  return errors;
}

function validatePunch(body) {
  return validateCoordinates(body);
}

function validateMarkAttendance(body) {
  const errors = [];
  if (!body.date || typeof body.date !== 'string' || !DATE_RE.test(body.date)) {
    errors.push('date is required as YYYY-MM-DD');
  }
  if (!body.status || !MARKABLE_STATUSES.includes(body.status)) {
    errors.push(`status must be one of ${MARKABLE_STATUSES.join(', ')}`);
  }
  return errors;
}

function validateMonthYearQuery(query) {
  const errors = [];
  const month = Number(query.month);
  const year = Number(query.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push('month is required as 1-12');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push('year is required as a 4-digit number');
  return errors;
}

function validateGeneratePayroll(body) {
  const errors = [];
  const month = Number(body.month);
  const year = Number(body.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push('month is required as 1-12');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push('year is required as a 4-digit number');
  if (body.deductions !== undefined && body.deductions !== null) {
    if (!Number.isFinite(body.deductions) || body.deductions < 0) {
      errors.push('deductions must be a non-negative number');
    }
  }
  return errors;
}

module.exports = { validatePunch, validateMarkAttendance, validateMonthYearQuery, validateGeneratePayroll };
