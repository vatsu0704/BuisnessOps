import { planAllows, planHasFeature, roleHas, type Capability, type PlanFeature } from '@/permissions';
import type { Membership, User } from '@/types/user';

/**
 * Which membership the app is acting under.
 *
 * The remembered choice is honoured only while it is still an ACTIVE membership;
 * otherwise any ACTIVE one. Undefined when none is — access revoked from every
 * business — which must never resolve to a REVOKED membership the API refuses.
 */
export function activeMembership(
  user: User | null | undefined,
  preferredBusinessId?: string | null
): Membership | undefined {
  const memberships = user?.memberships ?? [];
  if (preferredBusinessId) {
    const preferred = memberships.find((m) => m.businessId === preferredBusinessId && m.status === 'ACTIVE');
    if (preferred) return preferred;
  }
  return memberships.find((m) => m.status === 'ACTIVE');
}

export function switchableMemberships(user: User | null | undefined): Membership[] {
  return (user?.memberships ?? []).filter((m) => m.status === 'ACTIVE');
}

/** Signed in, but revoked from every business. */
export function hasNoActiveBusiness(user: User | null | undefined): boolean {
  return !!user && switchableMemberships(user).length === 0;
}

/**
 * The one check every page uses. A revoked membership holds nothing.
 *
 * Role AND plan (requirement 28) — the same two questions the server asks, so a
 * feature the business's plan does not include disappears the way a capability
 * the role lacks does. A server from before plans sends no subscription, and
 * then the plan narrows nothing.
 */
export function hasCapability(m: Membership | undefined, capability: Capability): boolean {
  if (!m || m.status !== 'ACTIVE' || !roleHas(m.role, capability)) return false;
  const subscription = m.business?.subscription;
  return !subscription || planAllows(subscription.plan, capability);
}

/** A plan feature no capability can express — vendors, FOCO branches. */
export function hasPlanFeature(m: Membership | undefined, feature: PlanFeature): boolean {
  if (!m || m.status !== 'ACTIVE') return false;
  const subscription = m.business?.subscription;
  return !subscription || planHasFeature(subscription.plan, feature);
}

/**
 * "May this person see this surface?" — a capability, narrowed by whose *job*
 * it is.
 *
 * A capability says what someone may do, not what their work is: an owner holds
 * every capability, so gating on one alone would put "Your deliveries" in an
 * owner's sidebar. `hideWhen` drops it for anyone who `holds` a second
 * capability unless they also hold `unless` — the same `{ holds, unless }` shape
 * the app's Home and tab bar use. Always a capability, never a role name, so a
 * role added later lands on the right side by itself.
 */
export type Gate = {
  capability: Capability | null;
  hideWhen?: { holds: Capability; unless?: Capability };
};

export function passesGate(m: Membership | undefined, gate: Gate): boolean {
  if (gate.capability && !hasCapability(m, gate.capability)) return false;
  if (!gate.hideWhen) return true;
  const hidden =
    hasCapability(m, gate.hideWhen.holds) && !(gate.hideWhen.unless && hasCapability(m, gate.hideWhen.unless));
  return !hidden;
}

/** Passes when any one gate does. An empty list means everyone. */
export function passesAnyGate(m: Membership | undefined, gates: Gate[] | null): boolean {
  if (!gates || gates.length === 0) return true;
  return gates.some((gate) => passesGate(m, gate));
}
