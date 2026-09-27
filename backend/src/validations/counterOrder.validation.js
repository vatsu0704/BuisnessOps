const {
  isIsoDate,
  mustBeDate,
  mustBeNonNegative,
  mustBeOneOf,
  mustBeString,
  required,
} = require('./shared');
const { fieldError } = require('../errors');

// Mirrors the PaymentMethod enum. UNSPECIFIED is included and is the default:
// requirement 1 has no payment step, so "we did not ask" has to be sayable.
const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER', 'MIXED', 'UNSPECIFIED'];
const ORDER_STATUSES = ['OPEN', 'CLOSED', 'VOID'];

function validateOpenOrder(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push(required('branchId'));
  if (body.paymentMethod !== undefined && !PAYMENT_METHODS.includes(body.paymentMethod)) {
    errors.push(mustBeOneOf('paymentMethod', PAYMENT_METHODS));
  }
  return errors;
}

/**
 * A line is either a catalog product or a one-off.
 *
 * A product line takes its price from the catalog — a price the client can name
 * is a price the client can invent, and a till that accepts one is a till that
 * can be talked into anything. A one-off needs both a name and a price, because
 * nothing else can supply them.
 */
function validateAddItem(body) {
  const errors = [];

  const hasProduct = body.productId !== undefined && body.productId !== null;
  if (hasProduct && typeof body.productId !== 'string') errors.push(mustBeString('productId'));

  if (!hasProduct) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push(required('name'));
    if (body.unitPrice === undefined || body.unitPrice === null) errors.push(required('unitPrice'));
  }

  if (body.unitPrice !== undefined && body.unitPrice !== null) {
    if (typeof body.unitPrice !== 'number' || !Number.isFinite(body.unitPrice) || body.unitPrice < 0) {
      errors.push(mustBeNonNegative('unitPrice'));
    }
  }

  // Quantity must be POSITIVE here, not merely non-negative: adding a line of
  // zero is not a thing anyone means to do, and it would sit on the order
  // contributing nothing. Removing is its own call.
  if (body.quantity === undefined || body.quantity === null) {
    errors.push(required('quantity'));
  } else if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity <= 0) {
    errors.push(fieldError('QUANTITY_MUST_BE_POSITIVE', 'quantity'));
  }

  return errors;
}

/** Zero is meaningful here — it is how a till expresses "take it off". */
function validateUpdateItem(body) {
  const errors = [];
  if (body.quantity === undefined || body.quantity === null) {
    errors.push(required('quantity'));
  } else if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity < 0) {
    errors.push(mustBeNonNegative('quantity'));
  }
  return errors;
}

function validateCloseOrder(body) {
  const errors = [];
  if (body.paymentMethod !== undefined && !PAYMENT_METHODS.includes(body.paymentMethod)) {
    errors.push(mustBeOneOf('paymentMethod', PAYMENT_METHODS));
  }
  return errors;
}

function validateDayQuery(query) {
  const errors = [];
  if (query.date !== undefined && !isIsoDate(query.date)) errors.push(mustBeDate('date'));
  if (query.status !== undefined && !ORDER_STATUSES.includes(query.status)) {
    errors.push(mustBeOneOf('status', ORDER_STATUSES));
  }
  return errors;
}

function validateCloseDay(body) {
  const errors = [];
  if (body.date !== undefined && !isIsoDate(body.date)) errors.push(mustBeDate('date'));
  return errors;
}

module.exports = {
  validateOpenOrder,
  validateAddItem,
  validateUpdateItem,
  validateCloseOrder,
  validateDayQuery,
  validateCloseDay,
  PAYMENT_METHODS,
};
