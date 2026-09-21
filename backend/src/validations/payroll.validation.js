// Payroll input shapes. Moved out of attendance.validation.js, which had grown
// to cover two modules.
const { mustBeNonNegative, mustBeString, maxLength } = require('./shared');
const { fieldError } = require('../errors');

function validateMonthYear(source, errors) {
  const month = Number(source.month);
  const year = Number(source.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push(fieldError('MONTH_REQUIRED', 'month'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push(fieldError('YEAR_REQUIRED', 'year'));
}

// `label` is the field path, which for the per-staff deductions map is
// `deductionsByStaffId.<id>` — a name the client has no translation for, and
// falls back to printing as-is.
function validateAmount(value, label, errors) {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(value) || value < 0) errors.push(mustBeNonNegative(label));
}

function validateGeneratePayroll(body) {
  const errors = [];
  validateMonthYear(body, errors);
  validateAmount(body.deductions, 'deductions', errors);
  if (body.deductionNote !== undefined && body.deductionNote !== null) {
    if (typeof body.deductionNote !== 'string') errors.push(mustBeString('deductionNote'));
    else if (body.deductionNote.length > 200) errors.push(maxLength('deductionNote', 200));
  }
  return errors;
}

function validatePayrollRun(source) {
  const errors = [];
  validateMonthYear(source, errors);

  if (source.branchId !== undefined && source.branchId !== null && typeof source.branchId !== 'string') {
    errors.push(mustBeString('branchId'));
  }
  if (source.staffMemberIds !== undefined && source.staffMemberIds !== null) {
    if (!Array.isArray(source.staffMemberIds) || source.staffMemberIds.some((id) => typeof id !== 'string')) {
      errors.push(fieldError('FIELD_MUST_BE_ID_ARRAY', 'staffMemberIds'));
    }
  }
  if (source.deductionsByStaffId !== undefined && source.deductionsByStaffId !== null) {
    if (typeof source.deductionsByStaffId !== 'object' || Array.isArray(source.deductionsByStaffId)) {
      errors.push(fieldError('FIELD_MUST_BE_STAFF_MAP', 'deductionsByStaffId'));
    } else {
      for (const [id, amount] of Object.entries(source.deductionsByStaffId)) {
        validateAmount(amount, `deductionsByStaffId.${id}`, errors);
      }
    }
  }
  return errors;
}

module.exports = { validateGeneratePayroll, validatePayrollRun };
