import matrix from './matrix.json';

/**
 * The frontend half of the capability matrix.
 *
 * `matrix.json` is a generated mirror of `backend/src/permissions/catalog.js`,
 * and `npm run lint:permissions` fails CI if the two drift. It is JSON rather
 * than TypeScript for the same reason `en.json` is: the parity script reads it
 * with `JSON.parse`, and a `.ts` mirror would have to be regex-scraped.
 *
 * Deriving the types from it costs nothing and buys two things `tsc` could not
 * see before — a typo'd capability is a compile error, and `Role` can no longer
 * drift from the backend enum by hand, which is exactly how a new role used to
 * arrive as a string the app silently treated as having no permissions.
 *
 * Every capability string here is the SAME string the backend guards the
 * matching endpoint with. That is the whole point: a control this file lets you
 * render is a control whose API call will succeed.
 */
export type Capability = keyof typeof matrix.capabilities;
export type Role = keyof typeof matrix.roles;

const ROLE_CAPABILITIES = matrix.roles as Record<string, string[] | '*'>;

/** Every capability name, for the parity script and for debugging screens. */
export const CAPABILITIES = Object.keys(matrix.capabilities) as Capability[];

/** Every role name, used to derive the invitable-role list rather than re-typing it. */
export const ROLES = Object.keys(matrix.roles) as Role[];

/**
 * Does this role hold this capability?
 *
 * Unknown roles hold nothing — which is what makes an app build older than the
 * server degrade safely. A phone that has never heard of CASHIER shows that
 * person an empty-handed UI rather than guessing.
 */
export function roleHas(role: string | undefined, capability: Capability): boolean {
  if (!role) return false;
  const held = ROLE_CAPABILITIES[role];
  if (!held) return false;
  return held === '*' || held.includes(capability);
}

/**
 * Requirement 28 — what each subscription plan unlocks, from the same mirror.
 *
 * The backend answers every request with the role's capability AND the
 * business's plan; `hasCapability` in `utils/permissions.ts` asks the same two
 * questions before a control renders, so a feature the plan does not include
 * disappears the way a capability the role lacks does.
 */
export type Plan = keyof typeof matrix.plans.capabilities;
export type PlanFeature = 'vendors' | 'focoBranches';

const PLAN_CAPABILITIES = matrix.plans.capabilities as Record<string, string[] | '*'>;
const PLAN_FEATURES = matrix.plans.features as Record<string, string[]>;
const PLAN_ROLES = matrix.plans.roles as Record<string, string[]>;

/** Every plan, cheapest first. */
export const PLANS = matrix.plans.order as Plan[];
export const GRACE_DAYS = matrix.plans.graceDays;

/** Does this plan unlock this capability? An unknown plan unlocks nothing. */
export function planAllows(plan: string | undefined, capability: Capability): boolean {
  if (!plan) return false;
  const unlocked = PLAN_CAPABILITIES[plan];
  if (!unlocked) return false;
  return unlocked === '*' || unlocked.includes(capability);
}

/** Does this plan include a feature no capability can express? */
export function planHasFeature(plan: string | undefined, feature: PlanFeature): boolean {
  return !!plan && (PLAN_FEATURES[plan] ?? []).includes(feature);
}

/** May a business on this plan invite somebody into this role? */
export function planAllowsRole(plan: string | undefined, role: Role): boolean {
  return !!plan && (PLAN_ROLES[plan] ?? []).includes(role);
}

/** The cheapest plan that unlocks a capability — what a refusal or a locked row names. */
export function cheapestPlanFor(capability: Capability): Plan | null {
  return PLANS.find((plan) => planAllows(plan, capability)) ?? null;
}
