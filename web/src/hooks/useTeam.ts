import { useEffect, useMemo } from 'react';
import { cashierByBranch } from '@shared/utils/teamRules';
import { useTeamStore } from '@/store/teamStore';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import type { PendingInvite, TeamMember } from '@/types/team';
import { hasCapability } from '@/utils/permissions';

/** Stable empties, so the selectors below do not return a new value each render. */
const NO_MEMBERS: TeamMember[] = [];
const NO_INVITES: PendingInvite[] = [];

/**
 * The team for the business being acted under — every caller is a view of one
 * list in `teamStore`, as the app's `useTeam`.
 *
 * Fetched only for someone who may read it (`team:view`). Invite and Add staff
 * use the list as a hint, and are opened by roles that may not hold it — a
 * cashier adding staff at their own branch — for whom it simply stays empty
 * rather than ending in a refusal on the page.
 */
export function useTeam() {
  const businessId = useBusinessId();
  const canView = hasCapability(useMembership(), 'team:view');

  const load = useTeamStore((s) => s.load);
  const refresh = useTeamStore((s) => s.refresh);
  const error = useTeamStore((s) => s.error);

  // `loadedFor`, never the arrays alone: a business switch must not show the
  // previous tenant's people for a frame.
  const members = useTeamStore((s) => (canView && s.loadedFor === businessId ? s.members : NO_MEMBERS));
  const invites = useTeamStore((s) => (canView && s.loadedFor === businessId ? s.invites : NO_INVITES));
  const conflicts = useTeamStore((s) => (canView && s.loadedFor === businessId ? s.conflicts : null));
  // "Not loaded yet" counts as loading, so a page shows a spinner, not its empty state.
  const isLoading = useTeamStore((s) =>
    canView && businessId ? s.isLoading || s.loadedFor !== businessId : false
  );

  useEffect(() => {
    if (canView) void load(businessId);
  }, [businessId, canView, load]);

  return { members, invites, conflicts, isLoading, error: canView ? error : null, refresh };
}

/** Requirement 18: who is the cashier at each branch, from the list the store already holds. */
export function useCashierByBranch(): Map<string, TeamMember> {
  const { members } = useTeam();
  return useMemo(() => cashierByBranch(members), [members]);
}
