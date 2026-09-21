const { isValidEmail, isValidTimeZone, isWeekdayList } = require('./shared');

const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];
const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'CLOSED'];

// Shared by create and update rather than copied, so the two can't drift.
// `requireRadiusCoordinates` is false on update, where the coordinates may
// already be on the row rather than in the body — the controller checks the
// merged result instead.
function validateGeofenceFields(body, errors, { requireRadiusCoordinates = true } = {}) {
  const hasLat = body.latitude !== undefined && body.latitude !== null;
  const hasLng = body.longitude !== undefined && body.longitude !== null;
  if (hasLat !== hasLng) errors.push('latitude and longitude must be provided together');
  if (hasLat && (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) {
    errors.push('latitude must be a number between -90 and 90');
  }
  if (hasLng && (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180)) {
    errors.push('longitude must be a number between -180 and 180');
  }
  // null is meaningful on update: it clears the geofence.
  if (body.geofenceRadiusMeters !== undefined && body.geofenceRadiusMeters !== null) {
    if (!Number.isFinite(body.geofenceRadiusMeters) || body.geofenceRadiusMeters <= 0) {
      errors.push('geofenceRadiusMeters must be a positive number');
    }
    if (requireRadiusCoordinates && !hasLat) {
      errors.push('geofenceRadiusMeters requires latitude/longitude to be set');
    }
  }
}

function validateCreateBranch(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  if (!body.code || typeof body.code !== 'string') errors.push('code is required');
  if (!body.timezone || typeof body.timezone !== 'string') errors.push('timezone is required');
  // Unvalidated before, which is why utils/datetime.js has to fall back rather
  // than trust Branch.timezone.
  else if (!isValidTimeZone(body.timezone)) errors.push('timezone must be a valid IANA timezone');

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
    errors.push(`provide at least one of: ${allowed.join(', ')}`);
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    errors.push('name cannot be empty');
  }
  for (const field of ['city', 'region', 'country', 'currency']) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  }
  if (body.status !== undefined && !BRANCH_STATUSES.includes(body.status)) {
    errors.push(`status must be one of ${BRANCH_STATUSES.join(', ')}`);
  }
  if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
    errors.push('timezone must be a valid IANA timezone');
  }
  if (body.weeklyOffOverride !== undefined && typeof body.weeklyOffOverride !== 'boolean') {
    errors.push('weeklyOffOverride must be a boolean');
  }
  if (body.weeklyOffDays !== undefined && !isWeekdayList(body.weeklyOffDays)) {
    errors.push('weeklyOffDays must be unique integers 0-6 (0 = Sunday), and cannot cover all seven days');
  }
  validateGeofenceFields(body, errors, { requireRadiusCoordinates: false });
  return errors;
}

function validateCreateMembership(body) {
  const errors = [];
  if (!isValidEmail(body.email)) errors.push('A valid email is required');
  if (!body.role || !INVITABLE_ROLES.includes(body.role)) {
    errors.push(`role must be one of ${INVITABLE_ROLES.join(', ')}`);
  }
  if (body.branchIds !== undefined) {
    if (!Array.isArray(body.branchIds) || body.branchIds.some((id) => typeof id !== 'string')) {
      errors.push('branchIds must be an array of strings');
    }
  }
  return errors;
}

function validateBranchAccess(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push('branchId is required');
  return errors;
}

module.exports = {
  validateCreateBranch,
  validateUpdateBranch,
  validateCreateMembership,
  validateBranchAccess,
};
