const { fail } = require('../errors');
const { planHasFeature, planAllowsRole, cheapestPlanFor } = require('../permissions');

/**
 * The plan checks that depend on what a request NAMES rather than on which
 * route it is (requirement 28). A route's capability is checked by
 * requirePermission; these cover the rest:
 *
 * - a feature no capability can express (FEATURES in permissions/plans.js) —
 *   a vendor named as an item's supplier, FOCO as a branch's model;
 * - the role somebody is being invited into.
 *
 * Each refusal names the cheapest plan that would allow it, so the sentence on
 * screen says where the thing is rather than only that it is not here.
 *
 * Takes `{ plan }` — a resolved `req.tenant` satisfies that, and a service that
 * was handed only the plan can pass `{ plan }` itself.
 */
function assertPlanFeature(tenant, feature) {
  if (!tenant || !planHasFeature(tenant.plan, feature)) {
    throw fail('PLAN_FEATURE_LOCKED', 403, { feature, requiredPlan: cheapestPlanFor({ feature }) });
  }
}

function assertPlanRole(tenant, role) {
  if (!tenant || !planAllowsRole(tenant.plan, role)) {
    throw fail('PLAN_ROLE_NOT_INCLUDED', 400, { role, requiredPlan: cheapestPlanFor({ role }) });
  }
}

module.exports = { assertPlanFeature, assertPlanRole };
