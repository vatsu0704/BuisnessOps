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
 * The app has no business switcher, and eleven files read `memberships[0]` as
 * "the" business. This is NOT that fix — it is a sensible tie-break that
 * prefers the first ACTIVE membership, which is also the first time
 * `membership.status` (INVITED / ACTIVE / REVOKED) is honoured anywhere in the
 * app. Someone genuinely in two businesses still sees one arbitrary one.
 */
export function activeMembership(user: User | null | undefined): Membership | undefined {
  return user?.memberships?.find((m) => m.status === 'ACTIVE') ?? user?.memberships?.[0];
}

export function activeBusinessId(user: User | null | undefined): string | undefined {
  return activeMembership(user)?.businessId;
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
