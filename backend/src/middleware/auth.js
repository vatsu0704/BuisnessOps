const prisma = require('../config/db');
const { verifyToken } = require('../utils/jwt');
const { fail } = require('../errors');

/**
 * Authenticates the caller and attaches req.userId. Does not know about
 * businesses/roles — that's resolveTenant's job, layered on top of this.
 *
 * ## Why this reads the user rather than trusting the token
 *
 * `User.status` existed from Phase 0 and was enforced **nowhere**: neither here
 * nor at login. Disabling an account therefore did nothing at all — the person
 * kept signing in and kept working, which is the opposite of what the only
 * plausible reason for disabling someone would be.
 *
 * Checking it at login alone would not have been enough either. A token is
 * valid for seven days and carries no state, so someone disabled on Monday
 * would still be making requests on Sunday with the token they already held.
 * The check has to be on the request, which means reading the row.
 *
 * The cost is one primary-key lookup per authenticated request. That is real
 * but small — `resolveTenant` already makes a similar one on every
 * business-scoped route, and every request that gets past here goes on to do
 * far more work than this. Correctness is worth a round trip; a disabled
 * account that still works is not worth saving one.
 *
 * A token whose user no longer exists is treated as an invalid token rather
 * than as a missing record: from the caller's side those are the same thing,
 * and saying which would tell an attacker whether a guessed id was real.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(fail('AUTH_HEADER_MISSING', 401));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return next(fail('AUTH_TOKEN_INVALID', 401));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true },
    });

    if (!user) return next(fail('AUTH_TOKEN_INVALID', 401));
    // 403 rather than 401: the credentials were good, and the app must not
    // treat this as "your session expired, sign in again" — signing in again
    // is exactly what will not help.
    if (user.status === 'DISABLED') return next(fail('AUTH_ACCOUNT_DISABLED', 403));

    req.userId = user.id;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
