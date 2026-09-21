const { isIsoDate, isWeekdayList, isOptionalString } = require('./shared');

const UNMARKED_STATUSES = ['PRESENT', 'ABSENT'];

function validateWorkWeek(body) {
  const errors = [];
  if (body.weeklyOffDays === undefined && body.unmarkedWorkingDayStatus === undefined) {
    errors.push('provide weeklyOffDays or unmarkedWorkingDayStatus');
  }
  if (body.weeklyOffDays !== undefined && !isWeekdayList(body.weeklyOffDays)) {
    // All seven is rejected by isWeekdayList: it would leave no working days,
    // and payroll would have nothing to divide by.
    errors.push('weeklyOffDays must be unique integers 0-6 (0 = Sunday), and cannot cover all seven days');
  }
  if (
    body.unmarkedWorkingDayStatus !== undefined &&
    !UNMARKED_STATUSES.includes(body.unmarkedWorkingDayStatus)
  ) {
    errors.push(`unmarkedWorkingDayStatus must be one of ${UNMARKED_STATUSES.join(', ')}`);
  }
  return errors;
}

function validateHoliday(body) {
  const errors = [];
  if (!isIsoDate(body.date)) errors.push('date is required as a real calendar date in YYYY-MM-DD form');
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push('name is required');
  if (!isOptionalString(body.name, 120)) errors.push('name must be 120 characters or fewer');
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') {
    errors.push('branchId must be a string, or null for a business-wide holiday');
  }
  if (body.isPaid !== undefined && typeof body.isPaid !== 'boolean') errors.push('isPaid must be a boolean');
  return errors;
}

module.exports = { validateWorkWeek, validateHoliday };
