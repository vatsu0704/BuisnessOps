const { fail } = require('../errors');
const { roleHas, planAllows, cheapestPlanFor, assertKnownCapability } = require('../permissions');
const { assertPlanFeature } = require('../billing/guards');

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
 *
 * Two questions, asked in this order (requirement 28): does the ROLE hold the
 * capability, and does the business's PLAN unlock it? This is `tenantCan`
 * split in two so the refusal can say which. A cashier refused supply orders on
 * a Starter business is told they are part of Growth, not that cashiers cannot
 * order — which would be false, and would send them to the wrong person.
 */
function requirePermission(...capabilities) {
  capabilities.forEach(assertKnownCapability);

  return (req, res, next) => {
    if (!req.tenant) return next(fail('PERMISSION_DENIED', 403));

    for (const capability of capabilities) {
      if (!roleHas(req.tenant.role, capability)) {
        // The capability rides along so the app can say what the rule is —
        // the action and the roles that hold it (permissions/explain.ts).
        return next(fail('PERMISSION_DENIED', 403, { capability }));
      }
      if (!planAllows(req.tenant.plan, capability)) {
        return next(
          fail('PLAN_FEATURE_LOCKED', 403, { capability, requiredPlan: cheapestPlanFor({ capability }) })
        );
      }
    }

    next();
  };
}

/**
 * Refuses unless the business's plan includes a feature no capability can
 * express — see FEATURES in permissions/plans.js. For a route that IS the
 * feature (the vendor routes); where the request body decides it, services call
 * billing/guards.js's assertPlanFeature directly.
 */
function requirePlanFeature(feature) {
  return (req, res, next) => {
    try {
      assertPlanFeature(req.tenant, feature);
      next();
    } catch (err) {
      next(err);
    }
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

module.exports = { requirePermission, requireRole, requirePlanFeature };
