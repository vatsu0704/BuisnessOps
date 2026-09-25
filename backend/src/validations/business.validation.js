const {
  INDUSTRIES,
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
const { ROLES } = require('../permissions');

// Derived from the capability matrix rather than hand-listed, so a role added
// there is invitable on the same commit. A hand-written list is the trap that
// makes a whole feature look built and be unreachable: the role exists in the
// database and in the matrix, and nobody can ever be given it.
//
// OWNER stays excluded deliberately, and business.service.js depends on that —
// "OWNER is not in INVITABLE_ROLES, so the one created at signup is the only
// one there will ever be" is what keeps a business from losing its only owner.
const INVITABLE_ROLES = ROLES.filter((role) => role !== 'OWNER');
const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'CLOSED'];
// A location the business sells from, or the one it ships from. See BranchKind
// in schema.prisma for why a warehouse is a Branch at all.
const BRANCH_KINDS = ['BRANCH', 'WAREHOUSE'];

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

/**
 * Requirement 16 — adding a second business to an existing account.
 *
 * Stricter than signup's equivalent fields, deliberately. `validateSignup`
 * treats these as optional-if-present, because a signup claiming a pending
 * invite legitimately sends none of them and only the service can tell (it is
 * the half with database access). There is no such case here: someone is
 * explicitly creating a business, so every field it needs is required, and a
 * bad timezone is caught before it becomes permanent.
 */
function validateCreateBusiness(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string') errors.push(required('name'));
  if (!body.industry || !INDUSTRIES.includes(body.industry)) errors.push(mustBeOneOf('industry', INDUSTRIES));
  if (!body.country || typeof body.country !== 'string') errors.push(required('country'));
  if (!body.defaultCurrency || typeof body.defaultCurrency !== 'string') {
    errors.push(required('defaultCurrency'));
  }
  if (!body.timezone || typeof body.timezone !== 'string') errors.push(required('timezone'));
  else if (!isValidTimeZone(body.timezone)) errors.push(fieldError('TIMEZONE_INVALID', 'timezone'));
  return errors;
}

// Free text, and nullable, on both create and update. An address is not a
// shape that validates: forcing one drops the half that actually finds the
// place ("behind the old post office").
const BRANCH_TEXT_FIELDS = ['city', 'region', 'country', 'addressLine', 'postalCode', 'currency'];

function validateCreateBranch(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string') errors.push(required('name'));
  if (!body.code || typeof body.code !== 'string') errors.push(required('code'));
  if (body.kind !== undefined && !BRANCH_KINDS.includes(body.kind)) {
    errors.push(mustBeOneOf('kind', BRANCH_KINDS));
  }
  for (const field of BRANCH_TEXT_FIELDS) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      errors.push(mustBeString(field));
    }
  }
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
    'kind',
    'city',
    'region',
    'country',
    'addressLine',
    'postalCode',
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
  for (const field of BRANCH_TEXT_FIELDS) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      errors.push(mustBeString(field));
    }
  }
  if (body.status !== undefined && !BRANCH_STATUSES.includes(body.status)) {
    errors.push(mustBeOneOf('status', BRANCH_STATUSES));
  }
  if (body.kind !== undefined && !BRANCH_KINDS.includes(body.kind)) {
    errors.push(mustBeOneOf('kind', BRANCH_KINDS));
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
  validateCreateBusiness,
  validateCreateBranch,
  validateUpdateBranch,
  validateCreateMembership,
  validateBranchAccess,
};
