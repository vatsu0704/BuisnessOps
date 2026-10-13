const { CAPABILITIES, ROLE_CAPABILITIES, SINGLE_BRANCH_ROLE } = require('./catalog');
const { PLANS, PLAN_CAPABILITIES, PLAN_FEATURES, PLAN_ROLES } = require('./plans');

// Requires only ./catalog and ./plans, which require nothing but each other —
// see the header of each. Keep it that way: this module is cheap to load from a
// script or a test without dragging Prisma in behind it.

const KNOWN = new Set(Object.keys(CAPABILITIES));

// Precomputed per role so a check is a Set lookup rather than an array scan on
// every request. '*' stays a wildcard rather than being expanded, so a
// capability added later reaches OWNER without this map being rebuilt.
const ROLE_SETS = Object.fromEntries(
  Object.entries(ROLE_CAPABILITIES).map(([role, capabilities]) => [
    role,
    capabilities === '*' ? '*' : new Set(capabilities),
  ])
);

/**
 * Throws if a capability name is not in the catalog.
 *
 * Called at MODULE LOAD by requirePermission, not per request. A typo'd
 * capability is in nobody's role list, so without this it would silently deny
 * the route to everyone forever — which reads as a permissions bug in
 * production rather than as a broken build. This turns it into a startup
 * crash, and every test file requires src/app, so `npm test` catches it.
 *
 * A plain Error, not fail() from the error catalog: nobody is ever shown this.
 * It means the code is wrong, not that the request was.
 */
function assertKnownCapability(capability) {
  if (!KNOWN.has(capability)) {
    throw new Error(
      `Unknown capability "${capability}". Add it to backend/src/permissions/catalog.js ` +
        `and to frontend/src/permissions/matrix.json, or fix the typo.`
    );
  }
  return capability;
}

/** Does this role hold this capability? Unknown roles hold nothing. */
function roleHas(role, capability) {
  const held = ROLE_SETS[role];
  if (!held) return false;
  return held === '*' || held.has(capability);
}

const PLAN_SETS = Object.fromEntries(
  Object.entries(PLAN_CAPABILITIES).map(([plan, capabilities]) => [
    plan,
    capabilities === '*' ? '*' : new Set(capabilities),
  ])
);

/**
 * Does this subscription plan unlock this capability? An unknown or missing
 * plan unlocks nothing — the same fail-closed default as an unknown role.
 */
function planAllows(plan, capability) {
  const unlocked = PLAN_SETS[plan];
  if (!unlocked) return false;
  return unlocked === '*' || unlocked.has(capability);
}

/** Does this plan include a feature no capability can express? See ./plans. */
function planHasFeature(plan, feature) {
  return (PLAN_FEATURES[plan] ?? []).includes(feature);
}

/** May a business on this plan invite somebody into this role? */
function planAllowsRole(plan, role) {
  return (PLAN_ROLES[plan] ?? []).includes(role);
}

/**
 * The cheapest plan that unlocks a capability, a feature or a role — what a
 * refusal names so the sentence can say where the thing is, not only that it
 * is not here. Null when no plan does (which would be a mistake in ./plans).
 */
function cheapestPlanFor({ capability, feature, role }) {
  return (
    PLANS.find((plan) => {
      if (capability) return planAllows(plan, capability);
      if (feature) return planHasFeature(plan, feature);
      if (role) return planAllowsRole(plan, role);
      return false;
    }) ?? null
  );
}

/**
 * The same question asked of a resolved tenant rather than a bare role string.
 *
 * This is what middleware and controllers should call. It exists so that
 * per-membership overrides — a business granting one person an extra
 * capability — can be added later by changing this one function, instead of
 * revisiting every call site to pass something richer than a role name.
 *
 * That is exactly what requirement 28 did: the answer is now the role's
 * capability AND the business's plan (`tenant.plan`, which resolveTenant reads
 * in the same query as the membership). A caller that needs to know WHICH of
 * the two refused — requirePermission, to choose its error — asks `roleHas`
 * and `planAllows` separately.
 */
function tenantCan(tenant, capability) {
  return !!tenant && roleHas(tenant.role, capability) && planAllows(tenant.plan, capability);
}

/** Every capability a role holds, with '*' expanded. Used by the parity script. */
function capabilitiesOf(role) {
  const held = ROLE_SETS[role];
  if (!held) return [];
  return held === '*' ? [...KNOWN] : [...held];
}

module.exports = {
  assertKnownCapability,
  roleHas,
  tenantCan,
  planAllows,
  planHasFeature,
  planAllowsRole,
  cheapestPlanFor,
  capabilitiesOf,
  KNOWN_CAPABILITIES: KNOWN,
  ROLES: Object.keys(ROLE_CAPABILITIES),
  // Re-exported so nothing outside this folder requires ./catalog directly.
  SINGLE_BRANCH_ROLE,
};
