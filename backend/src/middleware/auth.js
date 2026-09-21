const { verifyToken } = require('../utils/jwt');
const { fail } = require('../errors');

// Authenticates the caller and attaches req.userId. Does not know about
// businesses/roles — that's resolveTenant's job, layered on top of this.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(fail('AUTH_HEADER_MISSING', 401));
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return next(fail('AUTH_TOKEN_INVALID', 401));
  }
}

module.exports = { requireAuth };
