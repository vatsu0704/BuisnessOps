const { isValidEmail } = require('./shared');

function validateCreateStaff(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push('branchId is required');
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  if (!body.role || typeof body.role !== 'string') errors.push('role is required');
  if (body.email !== undefined && body.email !== null && body.email !== '' && !isValidEmail(body.email)) {
    errors.push('email must be a valid email address');
  }
  if (body.baseSalary !== undefined && body.baseSalary !== null) {
    if (!Number.isFinite(body.baseSalary) || body.baseSalary < 0) {
      errors.push('baseSalary must be a non-negative number');
    }
  }
  return errors;
}

module.exports = { validateCreateStaff };
