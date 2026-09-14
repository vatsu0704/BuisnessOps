// Must run after resolveTenant, which populates req.tenant.role.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.tenant || !roles.includes(req.tenant.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireRole };
