import { ROLES, roleHas } from '../permissions';
import { SINGLE_BRANCH_ROLE } from '../permissions/explain';
import type { CashierConflicts, TeamMember } from '../types/team';
import type { MembershipRole } from '../types/user';

/**
 * The rules the Team and Invite screens apply, in one place for the app and the
 * web (`@shared/utils/teamRules`). Pure: the matrix, the types, nothing else —
 * the same fence as every file the web reads, which `web`'s `lint:shared` checks.
 */

// OWNER is a valid MembershipRole but is never invitable (there's exactly one,
// created at signup) — narrowing the type here, not just the runtime list below,
// is what keeps roleHint_OWNER from needing to exist at all.
export type InvitableRole = Exclude<MembershipRole, 'OWNER'>;

// Derived from the permission matrix, and deliberately: a hand-written list here
// is how a role ends up existing in the database, holding capabilities in the
// matrix, and being impossible to actually give anyone. The backend's validator
// derives the same list from the same matrix.
export const INVITABLE_ROLES = ROLES.filter((r): r is InvitableRole => r !== 'OWNER');

// Which roles a branch selection is required for.
//
// MANAGER left this set in requirement 14: the role is business-wide now, so its
// BranchAccess rows have no effect and asking for them would be theatre. These
// are the roles whose reach `branch:allAccess` does NOT cover.
export const BRANCH_SCOPED_ROLES: ReadonlySet<InvitableRole> = new Set(
  INVITABLE_ROLES.filter((r) => !roleHas(r, 'branch:allAccess'))
);

/**
 * Does the LISTED member's role reach every branch? A property of the row being
 * rendered, not a permission check on the viewer, which is why it asks `roleHas`
 * directly rather than going through the viewer's membership.
 *
 * It was a hardcoded {OWNER, ADMIN} set. MANAGER joined them in requirement 14
 * and WAREHOUSE arrived with the order desk, and both would otherwise have been
 * rendered with branch pills — or with the "no branches yet" warning — while
 * actually reaching every branch. The warning in particular would have been an
 * invitation to fix something that was not broken.
 */
export function reachesEveryBranch(role: MembershipRole): boolean {
  return roleHas(role, 'branch:allAccess');
}

/**
 * Requirement 18 — the role limited to exactly one branch.
 *
 * Read off the mirrored matrix and compared with the backend by
 * `lint:permissions`, so no screen can offer a shape the server refuses. It
 * changes two things: a cashier's branch is one assignment that *moves* rather
 * than a set of pills removed one by one, and the branch list is single-select —
 * tick-boxes would let somebody choose two branches, and the invite would be
 * rejected before it was ever created.
 */
export function isSingleBranchRole(role: MembershipRole): boolean {
  return role === SINGLE_BRANCH_ROLE;
}

/**
 * Requirement 18, as the question a branch picker actually asks: **who is the
 * cashier here?** A map from branch id to the cashier holding it, so the invite
 * and Team screens can say "Hari is the cashier here" beside a branch instead of
 * letting the admin pick it and be refused.
 *
 * The rule counts only ACTIVE memberships — a revoked cashier's BranchAccess row
 * survives deliberately, so that a re-invite restores their scope, and it must
 * not keep a branch looking occupied. Derived from the member list the team store
 * already holds, so it costs no request and cannot disagree with the Team screen.
 */
export function cashierByBranch(members: TeamMember[]): Map<string, TeamMember> {
  const byBranch = new Map<string, TeamMember>();
  for (const member of members) {
    if (!isSingleBranchRole(member.role) || member.status !== 'ACTIVE') continue;
    for (const access of member.branchAccess) byBranch.set(access.branch.id, member);
  }
  return byBranch;
}

/** Does this business have anything requirement 18 wants an admin to settle? */
export function hasCashierConflicts(conflicts: CashierConflicts | null): conflicts is CashierConflicts {
  if (!conflicts) return false;
  return conflicts.sharedBranches.length > 0 || conflicts.misassignedCashiers.length > 0;
}

/** Just enough of an axios error to read the server's answer — no axios import, so the web can share it. */
type RefusedRequest = {
  response?: { status?: number; data?: { code?: string; params?: Record<string, unknown> } };
};

/**
 * Requirement 18's two refusals of a branch assignment, recognised so a screen
 * can ask rather than merely report.
 *
 * Both are 409 and both name the blocker in `params` — the cashier being
 * displaced, the branch being vacated — which is what makes a confirmation worth
 * showing. Anything else is null and falls through to the ordinary error banner.
 */
export function asAssignmentConflict(
  err: unknown
): { code: 'BRANCH_ALREADY_HAS_CASHIER' | 'CASHIER_ALREADY_HAS_BRANCH'; branch: string; cashier?: string; currentBranch?: string } | null {
  const response = (err as RefusedRequest | null)?.response;
  const code = response?.data?.code;
  if (response?.status !== 409) return null;
  if (code !== 'BRANCH_ALREADY_HAS_CASHIER' && code !== 'CASHIER_ALREADY_HAS_BRANCH') return null;
  const params = response.data?.params ?? {};
  if (typeof params.branch !== 'string') return null;
  return {
    code,
    branch: params.branch,
    cashier: typeof params.cashier === 'string' ? params.cashier : undefined,
    currentBranch: typeof params.currentBranch === 'string' ? params.currentBranch : undefined,
  };
}

/**
 * Is this failure requirement 18's "that branch already has a cashier", at the
 * invite door? The 409 carries the holder's name as a param, which is the whole
 * reason the screen can ask a real question instead of reporting a failure and
 * leaving the admin to work out what to do next.
 */
export function asBranchConflict(err: unknown): { branch: string; cashier: string } | null {
  const response = (err as RefusedRequest | null)?.response;
  if (response?.status !== 409 || response.data?.code !== 'BRANCH_ALREADY_HAS_CASHIER') return null;
  const params = response.data.params ?? {};
  if (typeof params.branch !== 'string' || typeof params.cashier !== 'string') return null;
  return { branch: params.branch, cashier: params.cashier };
}

/**
 * Who outranks whom when removing somebody — the mirror of REVOKE_RANK in
 * backend/src/services/business.service.js; change one and change the other. It
 * is not in the capability matrix on purpose: "who outranks whom" is a rule about
 * two specific memberships, not a permission a role holds on its own.
 */
export function rankOf(role: MembershipRole): number {
  return ({ OWNER: 3, ADMIN: 2, MANAGER: 1 } as Record<string, number>)[role] ?? 0;
}

/**
 * Mirrors the two server-side guards, so no screen offers a button that is going
 * to come back 400 or 403: nobody may revoke themselves (which is also what stops
 * a business losing its only owner), and nobody may remove someone who outranks
 * them.
 *
 * It was `member.role === 'OWNER' && viewer.role !== 'OWNER'`, which was the whole
 * rule while only OWNER and ADMIN could reach the Team screen. Requirement 14 put
 * MANAGER there too, and a manager removing the admin who issued their account is
 * the same escalation one rung down.
 */
export function canRemoveMember(
  viewer: { id: string; role: MembershipRole } | undefined,
  member: Pick<TeamMember, 'id' | 'role' | 'status'>
): boolean {
  return (
    !!viewer &&
    member.status === 'ACTIVE' &&
    member.id !== viewer.id &&
    rankOf(member.role) <= rankOf(viewer.role)
  );
}
