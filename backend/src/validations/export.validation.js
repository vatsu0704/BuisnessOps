const { fieldError } = require('../errors');
const { isRealDateKey, isRealMonthKey } = require('../utils/datetime');

/**
 * Requirement 17's inputs, which are deliberately few.
 *
 * Both the date and the branch are **optional**. With no date, each branch is
 * asked about its own local today — which is what "export it in the evening"
 * means, and a business with branches in two timezones has no single today to
 * default to. With no branch, the export covers every branch the caller can
 * reach, which is what makes it "whatever entries were made across the whole day"
 * rather than one till's.
 *
 * A future date is deliberately NOT refused, unlike `resolveExpenseDate` on the
 * way in. That guard exists because writing a record against next week is a
 * mistake worth stopping; reading one is not — a future date simply has nothing
 * in it, and an empty export explains itself without a special case.
 */

const mustBeMonth = (field) => fieldError('FIELD_MUST_BE_MONTH', field);
const mustBeDate = (field) => fieldError('FIELD_MUST_BE_DATE', field);

function validateDayEndQuery(query) {
  const errors = [];

  if (query.date !== undefined && !isRealDateKey(query.date)) errors.push(mustBeDate('date'));
  if (query.branchId !== undefined && typeof query.branchId !== 'string') {
    errors.push(fieldError('FIELD_MUST_BE_STRING', 'branchId'));
  }

  return errors;
}

function validateMonthEndQuery(query) {
  const errors = [];

  if (query.month !== undefined && !isRealMonthKey(query.month)) errors.push(mustBeMonth('month'));
  if (query.branchId !== undefined && typeof query.branchId !== 'string') {
    errors.push(fieldError('FIELD_MUST_BE_STRING', 'branchId'));
  }

  return errors;
}

module.exports = { validateDayEndQuery, validateMonthEndQuery };
