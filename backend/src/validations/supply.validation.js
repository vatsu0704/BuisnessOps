const {
  mustBeBoolean,
  mustBeNonNegative,
  mustBeOneOf,
  mustBeString,
  required,
  stringMaxLength,
} = require('./shared');
const { fieldError } = require('../errors');

/**
 * Supply orders and the raw-material catalog — requirements 3, 5, 5.1, 9, 11, 12.
 */

const PAYMENT_MODES = ['ONLINE', 'COD'];
const ORDER_STATUSES = ['DRAFT', 'PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
const VERIFY_OUTCOMES = ['VERIFIED', 'FAILED'];

/**
 * Why something is late, as codes.
 *
 * Codes rather than free text because the cashier reading this may have the app
 * in Gujarati and this process cannot know that — the same contract the error
 * catalog follows. Each one has a `supplyDelay.<CODE>` key in all four locale
 * files, and the frontend's list is typed against those keys, so adding a
 * reason here without translating it fails `tsc` on the other side rather than
 * rendering a raw code at a counter.
 *
 * `note` travels beside the code for the actor's own words, which are theirs
 * and are shown exactly as typed.
 */
const DELAY_REASONS = [
  'TRAFFIC',
  'STOCK_OUT',
  'VEHICLE_ISSUE',
  'WEATHER',
  'STAFF_SHORTAGE',
  'OTHER',
];

/** A delay longer than a working day is a rescheduling, not a delay. */
const MAX_DELAY_MINUTES = 1440;

const NOTE_MAX = 300;

function isDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function checkNote(body, errors) {
  if (body.note === undefined || body.note === null) return;
  if (typeof body.note !== 'string') errors.push(mustBeString('note'));
  else if (body.note.length > NOTE_MAX) errors.push(stringMaxLength('note', NOTE_MAX));
}

// --- The catalog -----------------------------------------------------------

function checkPrice(value, errors) {
  // null is a deliberate value, not a missing one: it withdraws the price and
  // makes the item un-orderable without deactivating it.
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(mustBeNonNegative('unitPrice'));
  }
}

function validateCreateItem(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push(required('name'));
  if (!body.unit || typeof body.unit !== 'string' || !body.unit.trim()) errors.push(required('unit'));
  if (body.category !== undefined && body.category !== null && typeof body.category !== 'string') {
    errors.push(mustBeString('category'));
  }
  checkPrice(body.unitPrice, errors);
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') errors.push(mustBeBoolean('isActive'));
  return errors;
}

function validateUpdateItem(body) {
  const errors = [];
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    errors.push(required('name'));
  }
  if (body.unit !== undefined && (typeof body.unit !== 'string' || !body.unit.trim())) {
    errors.push(required('unit'));
  }
  if (body.category !== undefined && body.category !== null && typeof body.category !== 'string') {
    errors.push(mustBeString('category'));
  }
  checkPrice(body.unitPrice, errors);
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') errors.push(mustBeBoolean('isActive'));
  return errors;
}

// --- The cart --------------------------------------------------------------

function validateAddItem(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push(required('branchId'));
  if (!body.inventoryItemId || typeof body.inventoryItemId !== 'string') {
    errors.push(required('inventoryItemId'));
  }
  // Positive, not merely non-negative: a line of zero is not something anyone
  // means to add. Removing is its own call.
  if (body.quantity === undefined || body.quantity === null) {
    errors.push(required('quantity'));
  } else if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity <= 0) {
    errors.push(fieldError('QUANTITY_MUST_BE_POSITIVE', 'quantity'));
  }
  return errors;
}

/** Zero is meaningful — it is how a cart says "take it out". */
function validateUpdateOrderItem(body) {
  const errors = [];
  if (body.quantity === undefined || body.quantity === null) {
    errors.push(required('quantity'));
  } else if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity < 0) {
    errors.push(mustBeNonNegative('quantity'));
  }
  return errors;
}

// --- The lifecycle ---------------------------------------------------------

/**
 * ONLINE requires a reference, because a reference the warehouse can check
 * against its own records is the entire content of "paid online" in a system
 * that deliberately does not collect the money.
 */
function validatePlaceOrder(body) {
  const errors = [];
  if (!body.paymentMode) errors.push(required('paymentMode'));
  else if (!PAYMENT_MODES.includes(body.paymentMode)) errors.push(mustBeOneOf('paymentMode', PAYMENT_MODES));

  if (body.paymentMode === 'ONLINE') {
    if (!body.paymentReference || typeof body.paymentReference !== 'string' || !body.paymentReference.trim()) {
      errors.push(required('paymentReference'));
    } else if (body.paymentReference.length > 120) {
      errors.push(stringMaxLength('paymentReference', 120));
    }
  }
  return errors;
}

function validateAccept(body) {
  const errors = [];
  if (body.promisedAt !== undefined && body.promisedAt !== null) {
    if (!isDateTime(body.promisedAt)) errors.push(fieldError('DATETIME_INVALID', 'promisedAt'));
    else if (Date.parse(body.promisedAt) < Date.now()) {
      errors.push(fieldError('DATETIME_IN_PAST', 'promisedAt'));
    }
  }
  return errors;
}

/** Naming the agent is optional here — see dispatchOrder in the service. */
function validateDispatch(body) {
  const errors = [];
  if (
    body.deliveryAgentMembershipId !== undefined &&
    body.deliveryAgentMembershipId !== null &&
    typeof body.deliveryAgentMembershipId !== 'string'
  ) {
    errors.push(mustBeString('deliveryAgentMembershipId'));
  }
  return errors;
}

/**
 * Assigning, where naming somebody is the entire point — so required here,
 * unlike on dispatch. There is no "unassign": a run handed back is a run handed
 * to somebody else.
 */
function validateAssign(body) {
  const errors = [];
  if (!body.deliveryAgentMembershipId || typeof body.deliveryAgentMembershipId !== 'string') {
    errors.push(required('deliveryAgentMembershipId'));
  }
  return errors;
}

/**
 * Cash on delivery is confirmed by the person who took it (requirement 22).
 *
 * Optional here rather than required, because whether it is needed depends on
 * the order — an ONLINE one has nothing to confirm. The service asks that
 * question, since it is the half that can see the order; this only checks the
 * shape, so a truthy string can never stand in for "yes, I have the money".
 */
function validateDeliver(body) {
  const errors = [];
  if (body.cashCollected !== undefined && typeof body.cashCollected !== 'boolean') {
    errors.push(mustBeBoolean('cashCollected'));
  }
  return errors;
}

function validateDelay(body) {
  const errors = [];
  if (body.delayMinutes === undefined || body.delayMinutes === null) {
    errors.push(required('delayMinutes'));
  } else if (
    !Number.isInteger(body.delayMinutes) ||
    body.delayMinutes < 1 ||
    body.delayMinutes > MAX_DELAY_MINUTES
  ) {
    errors.push(fieldError('DELAY_MINUTES_RANGE', 'delayMinutes', { max: MAX_DELAY_MINUTES }));
  }

  if (!body.reasonCode) errors.push(required('reasonCode'));
  else if (!DELAY_REASONS.includes(body.reasonCode)) errors.push(mustBeOneOf('reasonCode', DELAY_REASONS));

  checkNote(body, errors);
  return errors;
}

function validateReject(body) {
  const errors = [];
  if (!body.reasonCode) errors.push(required('reasonCode'));
  else if (!DELAY_REASONS.includes(body.reasonCode)) errors.push(mustBeOneOf('reasonCode', DELAY_REASONS));
  checkNote(body, errors);
  return errors;
}

function validateCancel(body) {
  const errors = [];
  checkNote(body, errors);
  return errors;
}

function validateVerifyPayment(body) {
  const errors = [];
  if (!body.outcome) errors.push(required('outcome'));
  else if (!VERIFY_OUTCOMES.includes(body.outcome)) errors.push(mustBeOneOf('outcome', VERIFY_OUTCOMES));
  checkNote(body, errors);
  return errors;
}

function validateListQuery(query) {
  const errors = [];
  if (query.status !== undefined && !ORDER_STATUSES.includes(query.status)) {
    errors.push(mustBeOneOf('status', ORDER_STATUSES));
  }
  return errors;
}

module.exports = {
  validateCreateItem,
  validateUpdateItem,
  validateAddItem,
  validateUpdateOrderItem,
  validatePlaceOrder,
  validateAccept,
  validateDispatch,
  validateAssign,
  validateDeliver,
  validateDelay,
  validateReject,
  validateCancel,
  validateVerifyPayment,
  validateListQuery,
  DELAY_REASONS,
  PAYMENT_MODES,
  ORDER_STATUSES,
  MAX_DELAY_MINUTES,
};
