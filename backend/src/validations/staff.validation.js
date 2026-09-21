const { isValidEmail, isIsoDate, isOptionalString, isOptionalNonNegativeNumber } = require('./shared');

// Fields a client may set on create and on update alike.
const TEXT_FIELDS = [
  ['name', 120],
  ['role', 80],
  ['externalId', 120],
  ['phone', 40],
  ['employeeCode', 40],
  ['notes', 1000],
];

function validateSharedFields(body, errors) {
  for (const [field, maxLength] of TEXT_FIELDS) {
    if (!isOptionalString(body[field], maxLength)) {
      errors.push(`${field} must be a string of ${maxLength} characters or fewer`);
    }
  }
  if (body.email !== undefined && body.email !== null && body.email !== '' && !isValidEmail(body.email)) {
    errors.push('email must be a valid email address');
  }
  if (!isOptionalNonNegativeNumber(body.baseSalary)) {
    errors.push('baseSalary must be a non-negative number');
  }
  for (const field of ['hiredOn', 'exitedOn']) {
    if (body[field] !== undefined && body[field] !== null && !isIsoDate(body[field])) {
      errors.push(`${field} must be a real calendar date in YYYY-MM-DD form`);
    }
  }
  if (isIsoDate(body.hiredOn) && isIsoDate(body.exitedOn) && body.exitedOn < body.hiredOn) {
    errors.push('exitedOn cannot be before hiredOn');
  }
}

function validateCreateStaff(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push('branchId is required');
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  if (!body.role || typeof body.role !== 'string') errors.push('role is required');
  validateSharedFields(body, errors);
  return errors;
}

/**
 * Every field optional, but at least one present — a PATCH with an empty body
 * is a client bug, and silently returning the unchanged row hides it.
 */
function validateUpdateStaff(body) {
  const errors = [];
  const allowed = [
    'branchId',
    'name',
    'role',
    'externalId',
    'baseSalary',
    'email',
    'phone',
    'employeeCode',
    'hiredOn',
    'exitedOn',
    'notes',
  ];
  if (!allowed.some((field) => body[field] !== undefined)) {
    errors.push(`provide at least one of: ${allowed.join(', ')}`);
  }
  if (body.branchId !== undefined && (typeof body.branchId !== 'string' || !body.branchId)) {
    errors.push('branchId must be a non-empty string');
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    errors.push('name cannot be empty');
  }
  if (body.role !== undefined && (typeof body.role !== 'string' || !body.role.trim())) {
    errors.push('role cannot be empty');
  }
  validateSharedFields(body, errors);
  return errors;
}

module.exports = { validateCreateStaff, validateUpdateStaff };
