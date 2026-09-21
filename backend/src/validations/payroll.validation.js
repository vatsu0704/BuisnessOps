// Payroll input shapes. Moved out of attendance.validation.js, which had grown
// to cover two modules.

function validateMonthYear(source, errors) {
  const month = Number(source.month);
  const year = Number(source.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push('month is required as 1-12');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push('year is required as a 4-digit number');
}

function validateAmount(value, label, errors) {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(value) || value < 0) errors.push(`${label} must be a non-negative number`);
}

function validateGeneratePayroll(body) {
  const errors = [];
  validateMonthYear(body, errors);
  validateAmount(body.deductions, 'deductions', errors);
  if (body.deductionNote !== undefined && body.deductionNote !== null) {
    if (typeof body.deductionNote !== 'string') errors.push('deductionNote must be a string');
    else if (body.deductionNote.length > 200) errors.push('deductionNote must be 200 characters or fewer');
  }
  return errors;
}

function validatePayrollRun(source) {
  const errors = [];
  validateMonthYear(source, errors);

  if (source.branchId !== undefined && source.branchId !== null && typeof source.branchId !== 'string') {
    errors.push('branchId must be a string');
  }
  if (source.staffMemberIds !== undefined && source.staffMemberIds !== null) {
    if (!Array.isArray(source.staffMemberIds) || source.staffMemberIds.some((id) => typeof id !== 'string')) {
      errors.push('staffMemberIds must be an array of ids');
    }
  }
  if (source.deductionsByStaffId !== undefined && source.deductionsByStaffId !== null) {
    if (typeof source.deductionsByStaffId !== 'object' || Array.isArray(source.deductionsByStaffId)) {
      errors.push('deductionsByStaffId must be an object keyed by staff member id');
    } else {
      for (const [id, amount] of Object.entries(source.deductionsByStaffId)) {
        validateAmount(amount, `deductionsByStaffId.${id}`, errors);
      }
    }
  }
  return errors;
}

module.exports = { validateGeneratePayroll, validatePayrollRun };
