const {
  isValidEmail,
  isValidTimeZone,
  isWeekdayList,
  cannotBeEmpty,
  mustBeBoolean,
  mustBeOneOf,
  mustBeString,
  mustBeStringArray,
  provideAtLeastOne,
  required,
} = require('./shared');
const { fieldError } = require('../errors');

const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];
const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'CLOSED'];

// Shared by create and update rather than copied, so the two can't drift.
// `requireRadiusCoordinates` is false on update, where the coordinates may
// already be on the row rather than in the body — the controller checks the
// merged result instead.
function validateGeofenceFields(body, errors, { requireRadiusCoordinates = true } = {}) {
  const hasLat = body.latitude !== undefined && body.latitude !== null;
  const hasLng = body.longitude !== undefined && body.longitude !== null;
  if (hasLat !== hasLng) errors.push(fieldError('LAT_LNG_TOGETHER', 'latitude'));
  if (hasLat && (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) {
    errors.push(fieldError('LATITUDE_RANGE', 'latitude'));
  }
  if (hasLng && (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180)) {
    errors.push(fieldError('LONGITUDE_RANGE', 'longitude'));
  }
  // null is meaningful on update: it clears the geofence.
  if (body.geofenceRadiusMeters !== undefined && body.geofenceRadiusMeters !== null) {
    if (!Number.isFinite(body.geofenceRadiusMeters) || body.geofenceRadiusMeters <= 0) {
      errors.push(fieldError('GEOFENCE_RADIUS_POSITIVE', 'geofenceRadiusMeters'));
    }
    if (requireRadiusCoordinates && !hasLat) {
      errors.push(fieldError('GEOFENCE_RADIUS_NEEDS_COORDS', 'geofenceRadiusMeters'));
    }
  }
}

function validateCreateBranch(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string') errors.push(required('name'));
  if (!body.code || typeof body.code !== 'string') errors.push(required('code'));
  if (!body.timezone || typeof body.timezone !== 'string') errors.push(required('timezone'));
  // Unvalidated before, which is why utils/datetime.js has to fall back rather
  // than trust Branch.timezone.
  else if (!isValidTimeZone(body.timezone)) errors.push(fieldError('TIMEZONE_INVALID', 'timezone'));

  validateGeofenceFields(body, errors);
  return errors;
}

/**
 * Branch settings were write-once at creation: there was no PATCH at all, so a
 * geofence could never be corrected and a mistyped timezone was permanent
 * (and silently mis-filed every punch near midnight).
 */
function validateUpdateBranch(body) {
  const errors = [];
  const allowed = [
    'name',
    'city',
    'region',
    'country',
    'currency',
    'status',
    'timezone',
    'latitude',
    'longitude',
    'geofenceRadiusMeters',
    'weeklyOffOverride',
    'weeklyOffDays',
  ];
  if (!allowed.some((field) => body[field] !== undefined)) {
    errors.push(provideAtLeastOne(allowed));
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    errors.push(cannotBeEmpty('name'));
  }
  for (const field of ['city', 'region', 'country', 'currency']) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      errors.push(mustBeString(field));
    }
  }
  if (body.status !== undefined && !BRANCH_STATUSES.includes(body.status)) {
    errors.push(mustBeOneOf('status', BRANCH_STATUSES));
  }
  if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
    errors.push(fieldError('TIMEZONE_INVALID', 'timezone'));
  }
  if (body.weeklyOffOverride !== undefined && typeof body.weeklyOffOverride !== 'boolean') {
    errors.push(mustBeBoolean('weeklyOffOverride'));
  }
  if (body.weeklyOffDays !== undefined && !isWeekdayList(body.weeklyOffDays)) {
    errors.push(fieldError('WEEKLY_OFF_DAYS_INVALID', 'weeklyOffDays'));
  }
  validateGeofenceFields(body, errors, { requireRadiusCoordinates: false });
  return errors;
}

function validateCreateMembership(body) {
  const errors = [];
  if (!isValidEmail(body.email)) errors.push(fieldError('EMAIL_REQUIRED', 'email'));
  if (!body.role || !INVITABLE_ROLES.includes(body.role)) {
    errors.push(mustBeOneOf('role', INVITABLE_ROLES));
  }
  if (body.branchIds !== undefined) {
    if (!Array.isArray(body.branchIds) || body.branchIds.some((id) => typeof id !== 'string')) {
      errors.push(mustBeStringArray('branchIds'));
    }
  }
  return errors;
}

function validateBranchAccess(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push(required('branchId'));
  return errors;
}

module.exports = {
  validateCreateBranch,
  validateUpdateBranch,
  validateCreateMembership,
  validateBranchAccess,
};
