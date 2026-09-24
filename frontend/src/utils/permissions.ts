import { roleHas, type Capability } from '@/permissions';
import type { Membership, User } from '@/types/user';

/**
 * One place for "who is allowed to do what".
 *
 * Replaces three separately-declared role Sets — SettingsScreen, TeamScreen and
 * InviteMemberScreen each had their own, typed as plain strings rather than
 * MembershipRole, so a typo would have compiled fine.
 *
 * Those Sets have now gone one step further and become capability lookups
 * against `@/permissions`, whose matrix is a generated mirror of the backend's.
 * A role list written here could agree with the backend on the day it was
 * written and quietly stop agreeing later; a capability name cannot, because
 * `npm run lint:permissions` compares the two files in CI.
 */

/**
 * Which membership the app is currently acting under.
 *
 * `preferredBusinessId` is the switcher's stored choice, honoured only if it
 * still resolves to an ACTIVE membership — a business someone has since been
 * revoked from, or a choice left over from a different account on the same
 * device, falls back rather than locking the app to a business the API will
 * refuse on every request.
 *
 * Returns undefined when no membership is ACTIVE. That is a real state now
 * that access can be revoked, and it must not silently resolve to a REVOKED
 * membership: doing so would send a businessId that resolveTenant rejects, and
 * the app would look broken rather than saying what happened.
 */
export function activeMembership(
  user: User | null | undefined,
  preferredBusinessId?: string | null
): Membership | undefined {
  const memberships = user?.memberships ?? [];
  if (preferredBusinessId) {
    const preferred = memberships.find(
      (m) => m.businessId === preferredBusinessId && m.status === 'ACTIVE'
    );
    if (preferred) return preferred;
  }
  return memberships.find((m) => m.status === 'ACTIVE');
}

/** The businesses a switcher may offer: the ones access has not been revoked from. */
export function switchableMemberships(user: User | null | undefined): Membership[] {
  return (user?.memberships ?? []).filter((m) => m.status === 'ACTIVE');
}

/**
 * Signed in, but with no business left to act under — every membership was
 * revoked. Distinct from being signed out, and worth saying out loud rather
 * than rendering an empty dashboard.
 */
export function hasNoActiveBusiness(user: User | null | undefined): boolean {
  return !!user && switchableMemberships(user).length === 0;
}

function isActive(membership: Membership | undefined): membership is Membership {
  return !!membership && membership.status === 'ACTIVE';
}

/**
 * The one check every screen should use.
 *
 * A revoked membership holds nothing, whatever its role says — that check lived
 * inside each `can.*` entry before and is now in exactly one place.
 */
export function hasCapability(m: Membership | undefined, capability: Capability): boolean {
  return isActive(m) && roleHas(m.role, capability);
}

/**
 * Named shorthands for the checks screens actually make.
 *
 * Kept as a facade over `hasCapability` so call sites read as intentions
 * ("can this person manage staff?") rather than as capability strings, and so
 * a change of underlying capability is one edit here rather than a search
 * across screens.
 */
export const can = {
  /** Add, edit and deactivate staff. Not pay — that is its own capability. */
  manageStaff: (m: Membership | undefined) => hasCapability(m, 'staff:create'),
  /** Generate and view payslips. */
  managePayroll: (m: Membership | undefined) => hasCapability(m, 'payroll:run'),
  /** Set or change a base salary. A CASHIER does this for their own branch. */
  setPay: (m: Membership | undefined) => hasCapability(m, 'staff:setPay'),
  manageTeam: (m: Membership | undefined) => hasCapability(m, 'team:view'),
  /** See the catalog. Everyone who can sell or price something needs this. */
  viewProducts: (m: Membership | undefined) => hasCapability(m, 'product:view'),
  /** Add, edit and price products — including a branch's own (requirement 4). */
  manageProducts: (m: Membership | undefined) => hasCapability(m, 'product:manage'),
  /** Weekly off, holidays, branch timezone and geofence — these set the payroll divisor. */
  manageWorkCalendar: (m: Membership | undefined) => hasCapability(m, 'workCalendar:manage'),
  markAttendance: (m: Membership | undefined) => hasCapability(m, 'attendance:markOthers'),
};
