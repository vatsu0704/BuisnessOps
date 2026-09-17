const { isValidEmail } = require('./shared');

const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];

function validateCreateBranch(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  if (!body.code || typeof body.code !== 'string') errors.push('code is required');
  if (!body.timezone || typeof body.timezone !== 'string') errors.push('timezone is required');

  // Optional geofence setup (Attendance module). If given, both coordinates
  // must be given together, and a radius only makes sense alongside them.
  const hasLat = body.latitude !== undefined && body.latitude !== null;
  const hasLng = body.longitude !== undefined && body.longitude !== null;
  if (hasLat !== hasLng) errors.push('latitude and longitude must be provided together');
  if (hasLat && (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) {
    errors.push('latitude must be a number between -90 and 90');
  }
  if (hasLng && (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180)) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (body.geofenceRadiusMeters !== undefined && body.geofenceRadiusMeters !== null) {
    if (!Number.isFinite(body.geofenceRadiusMeters) || body.geofenceRadiusMeters <= 0) {
      errors.push('geofenceRadiusMeters must be a positive number');
    }
    if (!hasLat) errors.push('geofenceRadiusMeters requires latitude/longitude to be set');
  }

  return errors;
}

function validateCreateMembership(body) {
  const errors = [];
  if (!isValidEmail(body.email)) errors.push('A valid email is required');
  if (!body.role || !INVITABLE_ROLES.includes(body.role)) {
    errors.push(`role must be one of ${INVITABLE_ROLES.join(', ')}`);
  }
  return errors;
}

function validateBranchAccess(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push('branchId is required');
  return errors;
}

module.exports = { validateCreateBranch, validateCreateMembership, validateBranchAccess };
