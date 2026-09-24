const { CAPABILITIES, ROLE_CAPABILITIES } = require('./catalog');

// Requires only ./catalog, which itself requires nothing — see the header
// there. Keep it that way: this module is cheap to load from a script or a
// test without dragging Prisma in behind it.

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

/**
 * The same question asked of a resolved tenant rather than a bare role string.
 *
 * This is what middleware and controllers should call. It exists so that
 * per-membership overrides — a business granting one person an extra
 * capability — can be added later by changing this one function, instead of
 * revisiting every call site to pass something richer than a role name.
 */
function tenantCan(tenant, capability) {
  return !!tenant && roleHas(tenant.role, capability);
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
  capabilitiesOf,
  KNOWN_CAPABILITIES: KNOWN,
  ROLES: Object.keys(ROLE_CAPABILITIES),
};
