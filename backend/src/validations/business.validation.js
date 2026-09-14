const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];

function validateCreateBranch(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string') errors.push('name is required');
  if (!body.code || typeof body.code !== 'string') errors.push('code is required');
  if (!body.timezone || typeof body.timezone !== 'string') errors.push('timezone is required');
  return errors;
}

function validateCreateMembership(body) {
  const errors = [];
  if (!body.email || typeof body.email !== 'string') errors.push('email is required');
  if (!body.role || !INVITABLE_ROLES.includes(body.role)) {
    errors.push(`role must be one of ${INVITABLE_ROLES.join(', ')}`);
  }
  return errors;
}

function validateBranchAccess(body) {
  const errors = [];
  if (!body.branchId || typeof body.branchId !== 'string') errors.push('branchId is required');
  return errors;
}

module.exports = { validateCreateBranch, validateCreateMembership, validateBranchAccess };
