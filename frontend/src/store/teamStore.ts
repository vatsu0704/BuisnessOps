import { create } from 'zustand';
import { listCashierConflicts, listInvites, listMemberships } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import type { CashierConflicts, PendingInvite, TeamMember } from '@/types/team';

/**
 * The team — members, pending invites, and requirement 18's conflict report —
 * held once for the whole app.
 *
 * ## Why this became a store
 *
 * `TeamScreen` held all of this in its own `useState`, which was correct while it
 * was the only reader. Requirement 18 gives it a second: the invite screen has to
 * show **which branches already have a cashier** before the admin picks one,
 * which is a question about the member list. Two readers of the same server data
 * is exactly the situation `branchStore`'s header describes — twelve private
 * copies of the branch list, each fetched once on mount, one of them permanently
 * stale because a tab screen never unmounts.
 *
 * So it moves here before the second copy can exist, rather than after somebody
 * notices the invite screen offering a branch that was taken ten minutes ago.
 *
 * ## The rules, the same three as every other store
 *
 * - `load` is idempotent per business; a second caller while the first is in
 *   flight waits on the same promise.
 * - **Anything that changes the team calls `refreshTeam()`** — inviting,
 *   revoking, assigning a branch. The mutating screen usually navigates away, so
 *   there is no effect left to re-run.
 * - `loadedFor` is checked by the hook rather than the array being trusted, so a
 *   business switch cannot flash the previous tenant's people for a frame.
 *
 * All three lists are fetched together because all three are read together, and
 * because three requests that must agree with each other should not be able to
 * arrive from three different moments.
 */

type TeamStore = {
  /** The business the current lists belong to. null means nothing is loaded. */
  loadedFor: string | null;
  members: TeamMember[];
  invites: PendingInvite[];
  conflicts: CashierConflicts | null;
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

/** In-flight request, kept out of the store — see branchStore for why. */
let pending: { businessId: string; promise: Promise<void> } | null = null;

const EMPTY = { members: [], invites: [], conflicts: null };

export const useTeamStore = create<TeamStore>((set, get) => {
  async function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const [members, invites, conflicts] = await Promise.all([
          listMemberships(businessId),
          listInvites(businessId),
          listCashierConflicts(businessId),
        ]);
        set({ members, invites, conflicts, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        // The previous lists stay put: a failed refresh must not empty a screen
        // that was reading fine a second ago. The error shows beside them.
        set({ isLoading: false, error: extractErrorMessage(err) });
      } finally {
        if (pending?.businessId === businessId) pending = null;
      }
    })();

    pending = { businessId, promise };
    return promise;
  }

  return {
    loadedFor: null,
    ...EMPTY,
    isLoading: false,
    error: null,

    async load(businessId) {
      if (!businessId) {
        get().reset();
        return;
      }
      if (get().loadedFor === businessId) return;
      await fetchFor(businessId);
    },

    async refresh() {
      const { loadedFor } = get();
      if (loadedFor) await fetchFor(loadedFor);
    },

    reset() {
      pending = null;
      set({ loadedFor: null, ...EMPTY, isLoading: false, error: null });
    },
  };
});

/**
 * Refetch the team from outside React, for the screens that change it and then
 * navigate away.
 */
export function refreshTeam() {
  return useTeamStore.getState().refresh();
}
