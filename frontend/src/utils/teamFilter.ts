import type { PendingInvite, TeamMember } from '../types/team';
import { filterByQuery } from './optionSearch';
import { reachesEveryBranch } from './teamRules';

/**
 * Finding one person in a team, and seeing who works at one branch.
 *
 * The Team screen listed every member of the business, unfiltered, in both apps.
 * A business with two hundred branches has the staff to match, and "who runs
 * Vesu Point?" meant scrolling until you recognised a name.
 *
 * Shared and pure so the phone and the browser agree on what a search finds, for
 * the same reason the pickers' matcher is shared: two people searching the same
 * word must land on the same person.
 */

export interface TeamFilter {
  /** Matched against a member's name and email. */
  query: string;
  /** Only people who reach this branch. `null` is every branch. */
  branchId: string | null;
}

/**
 * Does this member reach that branch?
 *
 * A role with `branch:allAccess` reaches all of them without holding a single
 * `BranchAccess` row, so filtering on the rows alone would hide every manager,
 * admin and owner from a branch's list — the people most likely to be looked up.
 */
export function memberReachesBranch(member: TeamMember, branchId: string): boolean {
  if (reachesEveryBranch(member.role)) return true;
  return member.branchAccess.some((access) => access.branch.id === branchId);
}

/** The members a search and a branch choice leave, best match first. */
export function filterMembers(members: readonly TeamMember[], filter: TeamFilter): readonly TeamMember[] {
  const byBranch = filter.branchId
    ? members.filter((member) => memberReachesBranch(member, filter.branchId as string))
    : members;

  return filterByQuery(byBranch, filter.query, (member) => ({
    primary: member.user.name ?? member.user.email,
    // The email is matched but is not the name, so a name match wins — somebody
    // typing "rajesh" wants Rajesh before rajesh@othershop.com's colleague.
    secondary: [member.user.email, ...member.branchAccess.map((access) => access.branch.name)],
  }));
}

/**
 * The same, for invitations. An invite has no name yet and no branch access rows
 * — only the branch ids it will grant — so it is matched on its email and kept
 * only when the chosen branch is one of those.
 */
export function filterInvites(
  invites: readonly PendingInvite[],
  filter: TeamFilter
): readonly PendingInvite[] {
  const byBranch = filter.branchId
    ? invites.filter((invite) => invite.branchIds.includes(filter.branchId as string))
    : invites;

  return filterByQuery(byBranch, filter.query, (invite) => ({ primary: invite.email }));
}
