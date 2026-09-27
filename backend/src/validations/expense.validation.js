const {
  isIsoDate,
  isOptionalString,
  mustBeBoolean,
  mustBeDate,
  mustBeOneOf,
  required,
  stringMaxLength,
} = require('./shared');
const { fieldError } = require('../errors');
const { PAYMENT_METHODS } = require('./counterOrder.validation');

/**
 * Requirement 10's input shapes.
 *
 * `PAYMENT_METHODS` is imported rather than re-listed: an expense and a counter
 * order draw on the same `PaymentMethod` enum, and a second copy is how one of
 * them ends up missing a value the schema has.
 */

const NOTE_MAX = 300;
const CATEGORY_NAME_MAX = 60;

/**
 * Money, and the one rule that matters: strictly positive.
 *
 * An expense of zero is not a thing anyone means to record — it is a half-typed
 * form — and a negative one is a refund, which is a different fact this table
 * does not model. Shared by create and update.
 */
function checkAmount(errors, amount, { requireIt }) {
  if (amount === undefined || amount === null) {
    if (requireIt) errors.push(required('amount'));
    return;
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    errors.push(fieldError('AMOUNT_POSITIVE', 'amount'));
  }
}

function checkNote(errors, note) {
  if (note === undefined || note === null) return;
  if (!isOptionalString(note, NOTE_MAX)) errors.push(stringMaxLength('note', NOTE_MAX));
}

function checkPaymentMethod(errors, paymentMethod) {
  if (paymentMethod === undefined) return;
  if (!PAYMENT_METHODS.includes(paymentMethod)) errors.push(mustBeOneOf('paymentMethod', PAYMENT_METHODS));
}

function validateLogExpense(body) {
  const errors = [];

  if (!body.branchId || typeof body.branchId !== 'string') errors.push(required('branchId'));
  if (!body.categoryId || typeof body.categoryId !== 'string') errors.push(required('categoryId'));
  checkAmount(errors, body.amount, { requireIt: true });
  // Optional: an expense with no date is today at that branch, which is the
  // common case and should not need saying.
  if (body.date !== undefined && !isIsoDate(body.date)) errors.push(mustBeDate('date'));
  checkNote(errors, body.note);
  checkPaymentMethod(errors, body.paymentMethod);

  return errors;
}

function validateUpdateExpense(body) {
  const errors = [];

  const touched = ['categoryId', 'amount', 'date', 'note', 'paymentMethod'].some(
    (field) => body[field] !== undefined
  );
  if (!touched) errors.push(fieldError('EXPENSE_NOTHING_TO_UPDATE', null));

  if (body.categoryId !== undefined && (typeof body.categoryId !== 'string' || !body.categoryId)) {
    errors.push(required('categoryId'));
  }
  checkAmount(errors, body.amount, { requireIt: false });
  if (body.date !== undefined && !isIsoDate(body.date)) errors.push(mustBeDate('date'));
  checkNote(errors, body.note);
  checkPaymentMethod(errors, body.paymentMethod);

  return errors;
}

function validateCreateCategory(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > CATEGORY_NAME_MAX) {
    errors.push(fieldError('CATEGORY_NAME_LENGTH', 'name', { max: CATEGORY_NAME_MAX }));
  }
  return errors;
}

function validateUpdateCategory(body) {
  const errors = [];

  if (body.name === undefined && body.isActive === undefined) {
    errors.push(fieldError('CATEGORY_NOTHING_TO_UPDATE', null));
  }
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > CATEGORY_NAME_MAX) {
      errors.push(fieldError('CATEGORY_NAME_LENGTH', 'name', { max: CATEGORY_NAME_MAX }));
    }
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') errors.push(mustBeBoolean('isActive'));

  return errors;
}

/** `date` alone, or `month` + `year` — the day view and the month view. */
function validateExpenseQuery(query) {
  const errors = [];

  if (query.date !== undefined && !isIsoDate(query.date)) errors.push(mustBeDate('date'));

  if (query.month !== undefined || query.year !== undefined) {
    const month = Number(query.month);
    const year = Number(query.year);
    if (!Number.isInteger(month) || month < 1 || month > 12) errors.push(fieldError('MONTH_REQUIRED', 'month'));
    if (!Number.isInteger(year) || year < 1000 || year > 9999) errors.push(fieldError('YEAR_REQUIRED', 'year'));
  }

  return errors;
}

function validateMonthQuery(query) {
  const errors = [];
  const month = Number(query.month);
  const year = Number(query.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push(fieldError('MONTH_REQUIRED', 'month'));
  if (!Number.isInteger(year) || year < 1000 || year > 9999) errors.push(fieldError('YEAR_REQUIRED', 'year'));
  return errors;
}

/**
 * The compliance list's only input, and `date` is optional on purpose: with
 * nothing given, every branch is asked about its own local today, which is the
 * question the back office is actually asking.
 */
function validateComplianceQuery(query) {
  const errors = [];
  if (query.date !== undefined && !isIsoDate(query.date)) errors.push(mustBeDate('date'));
  return errors;
}

module.exports = {
  validateLogExpense,
  validateUpdateExpense,
  validateCreateCategory,
  validateUpdateCategory,
  validateExpenseQuery,
  validateMonthQuery,
  validateComplianceQuery,
  NOTE_MAX,
  CATEGORY_NAME_MAX,
};
