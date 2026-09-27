const { fieldError } = require('../errors');
const { isRealMonthKey } = require('../utils/datetime');

/**
 * Requirements 13 and 15 take almost no input: a window of months and,
 * optionally, one branch.
 *
 * Both ends are optional. With neither, the service defaults to the current
 * month and the five before it, computed in the business's own timezone — which
 * is what a person opening Reports wants without having chosen anything. Order
 * is checked in the service rather than here, because "to before from" needs the
 * resolved defaults to be meaningful.
 */

/** 'YYYY-MM', the same form SalarySlip.monthYear already uses. */
const mustBeMonth = (field) => fieldError('FIELD_MUST_BE_MONTH', field);

function validateBranchMonthlyQuery(query) {
  const errors = [];

  if (query.from !== undefined && !isRealMonthKey(query.from)) errors.push(mustBeMonth('from'));
  if (query.to !== undefined && !isRealMonthKey(query.to)) errors.push(mustBeMonth('to'));
  if (query.branchId !== undefined && typeof query.branchId !== 'string') {
    errors.push(fieldError('FIELD_MUST_BE_STRING', 'branchId'));
  }

  return errors;
}

/** The cross-business roll-up takes the window and nothing else. */
function validateCrossBusinessQuery(query) {
  const errors = [];

  if (query.from !== undefined && !isRealMonthKey(query.from)) errors.push(mustBeMonth('from'));
  if (query.to !== undefined && !isRealMonthKey(query.to)) errors.push(mustBeMonth('to'));

  return errors;
}

module.exports = { validateBranchMonthlyQuery, validateCrossBusinessQuery };
