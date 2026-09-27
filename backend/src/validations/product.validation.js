const {
  cannotBeEmpty,
  mustBeNonNegative,
  mustBeBoolean,
  mustBeString,
  provideAtLeastOne,
  required,
  isOptionalString,
  stringMaxLength,
} = require('./shared');
const { fieldError } = require('../errors');

const TEXT_FIELDS = [
  ['name', 120],
  ['sku', 60],
  ['category', 60],
  ['unit', 24],
];

// Money arrives as a JSON number and is stored as Decimal. Rejecting a negative
// here rather than letting Postgres take it keeps a price that makes no sense
// out of the counter, where it would subtract from a bill.
function validatePrice(body, errors, field) {
  const value = body[field];
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(mustBeNonNegative(field));
  }
}

function validateTextFields(body, errors, { requireName = false } = {}) {
  for (const [field, max] of TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    // null clears an optional field; name and unit are not optional.
    if (value === null && (field === 'name' || field === 'unit')) {
      errors.push(cannotBeEmpty(field));
      continue;
    }
    if (value === null) continue;
    if (typeof value !== 'string') {
      errors.push(mustBeString(field));
      continue;
    }
    if ((field === 'name' || field === 'unit') && !value.trim()) {
      errors.push(cannotBeEmpty(field));
      continue;
    }
    if (!isOptionalString(value, max)) errors.push(stringMaxLength(field, max));
  }
  if (requireName) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push(required('name'));
    if (!body.unit || typeof body.unit !== 'string' || !body.unit.trim()) errors.push(required('unit'));
  }
}

function validateCreateProduct(body) {
  const errors = [];
  validateTextFields(body, errors, { requireName: true });
  // null/omitted means business-wide, which is the default scope and not an error.
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') {
    errors.push(mustBeString('branchId'));
  }
  validatePrice(body, errors, 'costPrice');
  validatePrice(body, errors, 'sellPrice');
  return errors;
}

function validateUpdateProduct(body) {
  const errors = [];
  const allowed = ['name', 'sku', 'category', 'unit', 'costPrice', 'sellPrice', 'isActive', 'branchId'];
  if (!allowed.some((field) => body[field] !== undefined)) errors.push(provideAtLeastOne(allowed));

  validateTextFields(body, errors);
  validatePrice(body, errors, 'costPrice');
  validatePrice(body, errors, 'sellPrice');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') errors.push(mustBeBoolean('isActive'));
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') {
    errors.push(mustBeString('branchId'));
  }
  return errors;
}

/**
 * A branch price override. Both prices are required here, unlike on the product
 * itself: an override exists precisely to state a price, and a half-stated one
 * would silently fall back to the business default for the other half — which
 * looks like the override not working.
 */
function validateBranchPricing(body) {
  const errors = [];
  if (body.costPrice === undefined || body.costPrice === null) errors.push(required('costPrice'));
  if (body.sellPrice === undefined || body.sellPrice === null) errors.push(required('sellPrice'));
  validatePrice(body, errors, 'costPrice');
  validatePrice(body, errors, 'sellPrice');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') errors.push(mustBeBoolean('isActive'));
  return errors;
}

function validateProductQuery(query) {
  const errors = [];
  if (query.branchId !== undefined && typeof query.branchId !== 'string') errors.push(mustBeString('branchId'));
  if (query.includeInactive !== undefined && !['true', 'false'].includes(String(query.includeInactive))) {
    errors.push(fieldError('FIELD_MUST_BE_BOOLEAN', 'includeInactive'));
  }
  return errors;
}

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
  validateBranchPricing,
  validateProductQuery,
};
