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

/**
 * Who supplies the item (requirement 25). A vendor's id, or null for the
 * warehouse's own stock — null is a real value on update, moving an item back
 * from a vendor to the warehouse. Whether the vendor exists and is active is a
 * fact about the database, and the service checks it.
 */
function checkVendor(value, errors) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !value.trim()) errors.push(mustBeString('vendorId'));
}

function validateCreateItem(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push(required('name'));
  if (!body.unit || typeof body.unit !== 'string' || !body.unit.trim()) errors.push(required('unit'));
  if (body.category !== undefined && body.category !== null && typeof body.category !== 'string') {
    errors.push(mustBeString('category'));
  }
  checkPrice(body.unitPrice, errors);
  checkVendor(body.vendorId, errors);
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
  checkVendor(body.vendorId, errors);
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

const REFERENCE_MAX = 120;

/** An optional reference: shape only. Typing one stopped being required in requirement 26. */
function checkReference(body, errors) {
  if (body.paymentReference === undefined || body.paymentReference === null) return;
  if (typeof body.paymentReference !== 'string') errors.push(mustBeString('paymentReference'));
  else if (body.paymentReference.length > REFERENCE_MAX) {
    errors.push(stringMaxLength('paymentReference', REFERENCE_MAX));
  }
}

/**
 * Paying now (ONLINE) needs the payer to say they have paid — requirement 26.
 *
 * It used to need a typed reference, which was the whole of "paid online" when
 * the warehouse checked references against its bank statement. Now the payer
 * scans a QR that carries the amount and the order number, taps "Payment done",
 * and the receiver confirms it from their own UPI app; the reference is
 * optional. A client from before that change still sends a reference and no
 * flag, and is taken as having confirmed.
 *
 * `paymentMode` itself is optional here because whether it is needed depends on
 * the branch — a FOCO branch never chooses, accounts pays — and only the
 * service can see the branch. `ACCOUNTS` is never accepted from a client.
 */
function validatePlaceOrder(body) {
  const errors = [];
  if (body.paymentMode !== undefined && body.paymentMode !== null && !PAYMENT_MODES.includes(body.paymentMode)) {
    errors.push(mustBeOneOf('paymentMode', PAYMENT_MODES));
  }
  if (body.paymentConfirmed !== undefined && typeof body.paymentConfirmed !== 'boolean') {
    errors.push(mustBeBoolean('paymentConfirmed'));
  }
  checkReference(body, errors);

  const referenced = typeof body.paymentReference === 'string' && body.paymentReference.trim().length > 0;
  if (body.paymentMode === 'ONLINE' && body.paymentConfirmed !== true && !referenced) {
    errors.push(fieldError('PAYMENT_NOT_CONFIRMED', 'paymentConfirmed'));
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

/** How the agent took the money at the counter (requirements 22 and 26). */
const COLLECTED_VIA = ['CASH', 'UPI'];
/** What the branch says about paying a vendor's own delivery person (requirement 25). */
const VENDOR_PAID = ['CASH', 'UPI', 'NOT_YET'];
/** How a branch pays for an order after placing it (requirement 26). */
const PAYMENT_METHODS = ['UPI', 'CASH'];
/** How many orders one accounts payment may cover. A QR pays one total; a batch is a week, not a year. */
const MAX_SETTLE_ORDERS = 100;

/**
 * Payment on delivery is confirmed by the person who took it (requirement 22).
 *
 * Optional here rather than required, because whether it is needed depends on
 * the order — an ONLINE one has nothing to confirm. The service asks that
 * question, since it is the half that can see the order; this only checks the
 * shape, so a truthy string can never stand in for "yes, I have the money".
 *
 * `collectedVia` is the current answer; `cashCollected: true` is the one an app
 * build from before the agent could show a QR still sends.
 */
function validateDeliver(body) {
  const errors = [];
  if (body.cashCollected !== undefined && typeof body.cashCollected !== 'boolean') {
    errors.push(mustBeBoolean('cashCollected'));
  }
  if (body.collectedVia !== undefined && !COLLECTED_VIA.includes(body.collectedVia)) {
    errors.push(mustBeOneOf('collectedVia', COLLECTED_VIA));
  }
  return errors;
}

/** Whether it was asked for is the service's question; this is only the shape. */
function validateReceive(body) {
  const errors = [];
  if (body.vendorPaid !== undefined && !VENDOR_PAID.includes(body.vendorPaid)) {
    errors.push(mustBeOneOf('vendorPaid', VENDOR_PAID));
  }
  return errors;
}

function validateRecordPayment(body) {
  const errors = [];
  if (!body.method) errors.push(required('method'));
  else if (!PAYMENT_METHODS.includes(body.method)) errors.push(mustBeOneOf('method', PAYMENT_METHODS));
  checkReference(body, errors);
  return errors;
}

function validateSettle(body) {
  const errors = [];
  const ids = body.supplyOrderIds;
  const wellFormed = Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.trim());
  if (!wellFormed || ids.length === 0 || new Set(ids).size > MAX_SETTLE_ORDERS) {
    errors.push(fieldError('ORDER_IDS_RANGE', 'supplyOrderIds', { max: MAX_SETTLE_ORDERS }));
  }
  checkReference(body, errors);
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
  validateReceive,
  validateRecordPayment,
  validateSettle,
  validateDelay,
  validateReject,
  validateCancel,
  validateVerifyPayment,
  validateListQuery,
  DELAY_REASONS,
  PAYMENT_MODES,
  ORDER_STATUSES,
  MAX_DELAY_MINUTES,
  MAX_SETTLE_ORDERS,
};
