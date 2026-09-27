import { useEffect, useMemo } from 'react';
import { useTeamStore } from '@/store/teamStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import { SINGLE_BRANCH_ROLE } from '@/permissions/explain';
import type { CashierConflicts, PendingInvite, TeamMember } from '@/types/team';

/** Stable empties, so the selectors below do not return a new value each render. */
const NO_MEMBERS: TeamMember[] = [];
const NO_INVITES: PendingInvite[] = [];

/**
 * The team for the business currently being acted under.
 *
 * Two screens read it: Team, which lists it, and Invite, which needs to know
 * which branches already have a cashier before offering a choice.
 */
export function useTeam() {
  const businessId = useBusinessId();

  const load = useTeamStore((s) => s.load);
  const refresh = useTeamStore((s) => s.refresh);
  const error = useTeamStore((s) => s.error);

  // Checking `loadedFor` rather than trusting the arrays is what stops the
  // previous tenant's people showing for a frame after a business switch.
  const members = useTeamStore((s) => (s.loadedFor === businessId ? s.members : NO_MEMBERS));
  const invites = useTeamStore((s) => (s.loadedFor === businessId ? s.invites : NO_INVITES));
  const conflicts = useTeamStore((s) => (s.loadedFor === businessId ? s.conflicts : null));

  // "Not loaded yet" counts as loading, so a screen shows a spinner rather than
  // its empty state in the moment before the first fetch resolves.
  const isLoading = useTeamStore((s) =>
    businessId ? s.isLoading || s.loadedFor !== businessId : false
  );

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  return { members, invites, conflicts, isLoading, error, refresh };
}

/**
 * Requirement 18, as the question a branch picker actually asks: **who is the
 * cashier here?**
 *
 * A map from branch id to the cashier holding it, so the invite and Team screens
 * can say "Hari is the cashier here" beside a branch instead of letting the admin
 * pick it and be refused. The rule counts only ACTIVE memberships — a revoked
 * cashier's BranchAccess row survives deliberately, so that a re-invite restores
 * their scope, and it must not keep a branch looking occupied.
 *
 * Derived from the member list the store already holds, so it costs no request
 * and cannot disagree with what the Team screen is showing.
 */
export function useCashierByBranch(): Map<string, TeamMember> {
  const { members } = useTeam();
  return useMemo(() => {
    const byBranch = new Map<string, TeamMember>();
    for (const member of members) {
      if (member.role !== SINGLE_BRANCH_ROLE || member.status !== 'ACTIVE') continue;
      for (const access of member.branchAccess) byBranch.set(access.branch.id, member);
    }
    return byBranch;
  }, [members]);
}

/** Does this business have anything requirement 18 wants an admin to settle? */
export function hasCashierConflicts(conflicts: CashierConflicts | null): boolean {
  if (!conflicts) return false;
  return conflicts.sharedBranches.length > 0 || conflicts.misassignedCashiers.length > 0;
}
