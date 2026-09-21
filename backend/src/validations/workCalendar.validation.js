const {
  isIsoDate,
  isWeekdayList,
  isOptionalString,
  maxLength,
  mustBeBoolean,
  mustBeOneOf,
  required,
} = require('./shared');
const { fieldError } = require('../errors');

const UNMARKED_STATUSES = ['PRESENT', 'ABSENT'];

function validateWorkWeek(body) {
  const errors = [];
  if (body.weeklyOffDays === undefined && body.unmarkedWorkingDayStatus === undefined) {
    errors.push(fieldError('WORK_WEEK_NOTHING_TO_UPDATE', null));
  }
  if (body.weeklyOffDays !== undefined && !isWeekdayList(body.weeklyOffDays)) {
    // All seven is rejected by isWeekdayList: it would leave no working days,
    // and payroll would have nothing to divide by.
    errors.push(fieldError('WEEKLY_OFF_DAYS_INVALID', 'weeklyOffDays'));
  }
  if (
    body.unmarkedWorkingDayStatus !== undefined &&
    !UNMARKED_STATUSES.includes(body.unmarkedWorkingDayStatus)
  ) {
    errors.push(mustBeOneOf('unmarkedWorkingDayStatus', UNMARKED_STATUSES));
  }
  return errors;
}

function validateHoliday(body) {
  const errors = [];
  if (!isIsoDate(body.date)) errors.push(fieldError('DATE_REQUIRED', 'date'));
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push(required('name'));
  if (!isOptionalString(body.name, 120)) errors.push(maxLength('name', 120));
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') {
    errors.push(fieldError('BRANCH_ID_OR_NULL', 'branchId'));
  }
  if (body.isPaid !== undefined && typeof body.isPaid !== 'boolean') errors.push(mustBeBoolean('isPaid'));
  return errors;
}

module.exports = { validateWorkWeek, validateHoliday };
