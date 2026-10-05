const {
  isValidUpiId,
  mustBeBoolean,
  mustBeString,
  provideAtLeastOne,
  required,
  stringMaxLength,
} = require('./shared');
const { fieldError } = require('../errors');

/**
 * Vendors and payees — requirements 25 and 26.
 */

const NAME_MAX = 80;
// Free text on purpose — see Vendor.phone in schema.prisma — but bounded.
const PHONE_MAX = 20;
// What a UPI app shows as "paying to". UPI's own payee-name field is short, and
// a long one is truncated by the payer's app rather than by us.
const UPI_NAME_MAX = 60;

function checkName(body, errors, { requiredField }) {
  if (body.name === undefined) {
    if (requiredField) errors.push(required('name'));
    return;
  }
  if (typeof body.name !== 'string' || !body.name.trim()) errors.push(required('name'));
  else if (body.name.trim().length > NAME_MAX) errors.push(stringMaxLength('name', NAME_MAX));
}

function checkPhone(body, errors) {
  if (body.phone === undefined || body.phone === null) return;
  if (typeof body.phone !== 'string') errors.push(mustBeString('phone'));
  else if (body.phone.trim().length > PHONE_MAX) errors.push(stringMaxLength('phone', PHONE_MAX));
}

function validateCreateVendor(body) {
  const errors = [];
  checkName(body, errors, { requiredField: true });
  checkPhone(body, errors);
  return errors;
}

/**
 * The desk's half only. `upiId` is refused here by not being on the list, so a
 * PATCH carrying one cannot slip through `supplyItem:manage` into the field
 * that decides where money goes.
 */
function validateUpdateVendor(body) {
  const errors = [];
  const allowed = ['name', 'phone', 'isActive'];
  if (!allowed.some((field) => body[field] !== undefined)) {
    errors.push(provideAtLeastOne(allowed));
  }
  checkName(body, errors, { requiredField: false });
  checkPhone(body, errors);
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') errors.push(mustBeBoolean('isActive'));
  return errors;
}

/**
 * Setting where a payment goes. `upiId: null` clears it.
 *
 * Shared by the warehouse's payee and every vendor's, so the two cannot grow
 * different rules about what a valid UPI ID is.
 */
function validateSetUpi(body) {
  const errors = [];
  if (body.upiId === undefined) {
    errors.push(required('upiId'));
  } else if (body.upiId !== null && !isValidUpiId(body.upiId)) {
    errors.push(fieldError('UPI_ID_INVALID', 'upiId'));
  }
  if (body.upiName !== undefined && body.upiName !== null) {
    if (typeof body.upiName !== 'string') errors.push(mustBeString('upiName'));
    else if (body.upiName.trim().length > UPI_NAME_MAX) errors.push(stringMaxLength('upiName', UPI_NAME_MAX));
  }
  return errors;
}

module.exports = { validateCreateVendor, validateUpdateVendor, validateSetUpi };
