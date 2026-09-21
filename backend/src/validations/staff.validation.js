const {
  isValidEmail,
  isIsoDate,
  isOptionalString,
  isOptionalNonNegativeNumber,
  cannotBeEmpty,
  mustBeDate,
  mustBeNonEmptyString,
  mustBeNonNegative,
  provideAtLeastOne,
  required,
  stringMaxLength,
} = require('./shared');
const { fieldError } = require('../errors');

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
      errors.push(stringMaxLength(field, maxLength));
    }
  }
  if (body.email !== undefined && body.email !== null && body.email !== '' && !isValidEmail(body.email)) {
    errors.push(fieldError('EMAIL_INVALID', 'email'));
  }
  if (!isOptionalNonNegativeNumber(body.baseSalary)) {
    errors.push(mustBeNonNegative('baseSalary'));
  }
  for (const field of ['hiredOn', 'exitedOn']) {
    if (body[field] !== undefined && body[field] !== null && !isIsoDate(body[field])) {
      errors.push(mustBeDate(field));
    }
  }
  if (isIsoDate(body.hiredOn) && isIsoDate(body.exitedOn) && body.exitedOn < body.hiredOn) {
    errors.push(fieldError('EXITED_BEFORE_HIRED', 'exitedOn'));
  }
}

function validateCreateStaff(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push(required('branchId'));
  if (!body.name || typeof body.name !== 'string') errors.push(required('name'));
  if (!body.role || typeof body.role !== 'string') errors.push(required('role'));
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
    errors.push(provideAtLeastOne(allowed));
  }
  if (body.branchId !== undefined && (typeof body.branchId !== 'string' || !body.branchId)) {
    errors.push(mustBeNonEmptyString('branchId'));
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    errors.push(cannotBeEmpty('name'));
  }
  if (body.role !== undefined && (typeof body.role !== 'string' || !body.role.trim())) {
    errors.push(cannotBeEmpty('role'));
  }
  validateSharedFields(body, errors);
  return errors;
}

module.exports = { validateCreateStaff, validateUpdateStaff };
