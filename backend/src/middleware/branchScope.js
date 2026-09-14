// Must run after resolveTenant, on any route with a :branchId param.
// req.branchAccess === null means the role has full, implicit access
// (OWNER/ADMIN); otherwise it's the explicit list of branch ids the
// caller's membership was granted.
function requireBranchAccess(req, res, next) {
  const { branchId } = req.params;

  if (req.branchAccess === null || req.branchAccess.includes(branchId)) {
    return next();
  }

  return res.status(403).json({ message: 'You do not have access to this branch' });
}

module.exports = { requireBranchAccess };
