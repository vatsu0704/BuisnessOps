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

/**
 * Sales a phone sends at once (requirement 30). Small on purpose: a queue that
 * built up over a day offline drains in a few requests, each well inside the
 * JSON body limit, and a batch that fails is cheap to send again.
 */
const MAX_SALES_PER_SYNC = 20;
const MAX_ITEMS_PER_SALE = 50;

/** The two ways a customer pays at the counter (requirement 29). */
const SALE_PAYMENT_METHODS = ['CASH', 'UPI'];
const SALE_STATUSES = ['CLOSED', 'VOID'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** The batch's shape. A malformed SALE is refused on its own — see validateSale. */
function validateSyncBatch(body) {
  if (!Array.isArray(body.sales) || body.sales.length === 0) return [required('sales')];
  if (body.sales.length > MAX_SALES_PER_SYNC) {
    return [fieldError('COUNTER_SYNC_TOO_MANY_SALES', 'sales', { max: MAX_SALES_PER_SYNC })];
  }
  return [];
}

/**
 * One sale. Returns the first problem as a field error, or null.
 *
 * Checked per sale rather than for the batch, so a sale the phone got wrong is
 * reported against that sale and the rest of the queue still lands.
 */
function validateSale(sale) {
  if (!sale || typeof sale !== 'object') return fieldError('COUNTER_SALE_INVALID', 'sale');
  if (typeof sale.clientRef !== 'string' || !UUID_RE.test(sale.clientRef)) {
    return fieldError('COUNTER_SALE_INVALID', 'clientRef');
  }
  if (typeof sale.branchId !== 'string' || !sale.branchId) return fieldError('COUNTER_SALE_INVALID', 'branchId');
  if (typeof sale.occurredAt !== 'string' || Number.isNaN(Date.parse(sale.occurredAt))) {
    return fieldError('COUNTER_SALE_INVALID', 'occurredAt');
  }
  if (!SALE_STATUSES.includes(sale.status)) return fieldError('COUNTER_SALE_INVALID', 'status');
  if (!SALE_PAYMENT_METHODS.includes(sale.paymentMethod)) return fieldError('COUNTER_SALE_INVALID', 'paymentMethod');
  if (!Number.isInteger(sale.deviceTokenNumber) || sale.deviceTokenNumber < 1 || sale.deviceTokenNumber > 99999) {
    return fieldError('COUNTER_SALE_INVALID', 'deviceTokenNumber');
  }
  if (!Array.isArray(sale.items) || sale.items.length === 0 || sale.items.length > MAX_ITEMS_PER_SALE) {
    return fieldError('COUNTER_SALE_INVALID', 'items');
  }
  for (const item of sale.items) {
    if (!item || typeof item !== 'object') return fieldError('COUNTER_SALE_INVALID', 'items');
    if (item.productId !== undefined && item.productId !== null && typeof item.productId !== 'string') {
      return fieldError('COUNTER_SALE_INVALID', 'productId');
    }
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) {
      return fieldError('COUNTER_SALE_INVALID', 'name');
    }
    if (!isFiniteNumber(item.quantity) || item.quantity <= 0 || item.quantity > 9999) {
      return fieldError('COUNTER_SALE_INVALID', 'quantity');
    }
    if (!isFiniteNumber(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > 10000000) {
      return fieldError('COUNTER_SALE_INVALID', 'unitPrice');
    }
  }
  return null;
}

module.exports = {
  validateOpenOrder,
  validateAddItem,
  validateUpdateItem,
  validateCloseOrder,
  validateDayQuery,
  validateCloseDay,
  validateSyncBatch,
  validateSale,
  PAYMENT_METHODS,
  MAX_SALES_PER_SYNC,
};
