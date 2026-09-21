import type { Membership, MembershipRole, User } from '@/types/user';

/**
 * One place for "who is allowed to do what".
 *
 * Replaces three separately-declared role Sets — SettingsScreen, TeamScreen and
 * InviteMemberScreen each had their own, typed as plain strings rather than
 * MembershipRole, so a typo would have compiled fine.
 */
const MANAGE_STAFF = new Set<MembershipRole>(['OWNER', 'ADMIN', 'MANAGER']);
const FULL_ACCESS = new Set<MembershipRole>(['OWNER', 'ADMIN']);

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

export const can = {
  /** Add, edit and deactivate staff; mark attendance. Not pay. */
  manageStaff: (m: Membership | undefined) => isActive(m) && MANAGE_STAFF.has(m.role),
  /** See and generate pay. A MANAGER runs attendance, not payroll. */
  managePayroll: (m: Membership | undefined) => isActive(m) && FULL_ACCESS.has(m.role),
  manageTeam: (m: Membership | undefined) => isActive(m) && FULL_ACCESS.has(m.role),
  /** Weekly off, holidays, branch timezone and geofence — these set the payroll divisor. */
  manageWorkCalendar: (m: Membership | undefined) => isActive(m) && FULL_ACCESS.has(m.role),
  markAttendance: (m: Membership | undefined) => isActive(m) && MANAGE_STAFF.has(m.role),
};
