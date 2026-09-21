const { fail } = require('../errors');

// Must run after resolveTenant, which populates req.tenant.role.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.tenant || !roles.includes(req.tenant.role)) {
      return next(fail('PERMISSION_DENIED', 403));
    }
    next();
  };
}

module.exports = { requireRole };
