const { fail } = require('../errors');
const { tenantCan, assertKnownCapability } = require('../permissions');

/**
 * Gate a route on a capability rather than a list of role names.
 *
 * Replaces requireRole's 27 duplicated role lists. Same factory shape and same
 * position in the chain, so the seven-routers-on-/businesses arrangement is
 * untouched: this is still applied per route and never as a blanket
 * `scoped.use()`. See the comment in dataSource.routes.js for why that matters.
 *
 * Capability names are validated HERE, at module load, not per request —
 * see assertKnownCapability in ../permissions for why that is the difference
 * between a broken build and a production permissions mystery.
 *
 * Several capabilities are an AND, not an OR: the caller must hold all of them.
 */
function requirePermission(...capabilities) {
  capabilities.forEach(assertKnownCapability);

  return (req, res, next) => {
    if (!req.tenant) return next(fail('PERMISSION_DENIED', 403));

    for (const capability of capabilities) {
      if (!tenantCan(req.tenant, capability)) {
        // The capability rides along on the ApiError for the server log. It is
        // not a placeholder in PERMISSION_DENIED's template, so nothing
        // untranslated reaches a screen — the device renders
        // t('errors.api.PERMISSION_DENIED') exactly as it does today.
        return next(fail('PERMISSION_DENIED', 403, { capability }));
      }
    }

    next();
  };
}

/**
 * The old role-name gate.
 *
 * Kept working, and kept in use, so the seven business routers migrate to
 * requirePermission one commit at a time instead of in a single 27-site sweep
 * that nothing could review. Delete it once no route references it.
 *
 * Note it is an ALLOW-list, which is why it stays safe as MembershipRole grows:
 * a new role is simply not in the list and is denied. The checks that were
 * dangerous were the deny-lists elsewhere; those are gone.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.tenant || !roles.includes(req.tenant.role)) {
      return next(fail('PERMISSION_DENIED', 403));
    }
    next();
  };
}

module.exports = { requirePermission, requireRole };
