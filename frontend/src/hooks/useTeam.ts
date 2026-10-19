import { useEffect, useMemo } from 'react';
import { useTeamStore } from '@/store/teamStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import { cashierByBranch } from '@/utils/teamRules';
import type { PendingInvite, TeamMember } from '@/types/team';

export { hasCashierConflicts } from '@/utils/teamRules';

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
 * Requirement 18: who is the cashier at each branch — `cashierByBranch` in
 * `utils/teamRules.ts` (shared with the web) over the member list this store
 * already holds, so it costs no request and cannot disagree with the Team screen.
 */
export function useCashierByBranch(): Map<string, TeamMember> {
  const { members } = useTeam();
  return useMemo(() => cashierByBranch(members), [members]);
}
