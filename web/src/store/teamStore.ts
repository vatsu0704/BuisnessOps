import { create } from 'zustand';
import { listCashierConflicts, listInvites, listMemberships } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import type { CashierConflicts, PendingInvite, TeamMember } from '@/types/team';

/**
 * The team — members, pending invites and requirement 18's conflict report —
 * held once, as the app's `teamStore`.
 *
 * Three pages read it: Team lists it, Invite needs to know which branches already
 * have a cashier before offering one, and Add staff recognises an email as
 * somebody the business already knows. A private copy in any of them would offer
 * a branch that was taken minutes ago.
 *
 * The same rules as every store: `load` is idempotent per business and a second
 * caller waits on the first request; anything that changes the team calls
 * `refreshTeam()`; `loadedFor` is checked by the hook so a business switch never
 * flashes the previous tenant's people; and a failed refresh keeps the lists
 * beside the error. The three lists are fetched together because they are read
 * together, and must not arrive from three different moments.
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

/** In-flight request, kept out of the store so subscribers do not re-render for it. */
let pending: { businessId: string; promise: Promise<void> } | null = null;

const EMPTY = { members: [], invites: [], conflicts: null };

export const useTeamStore = create<TeamStore>((set, get) => {
  function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const [members, invites, conflicts] = await Promise.all([
          listMemberships(businessId),
          listInvites(businessId),
          listCashierConflicts(businessId),
        ]);
        // A switch or sign-out while this was in flight: the answer is not ours.
        if (pending?.businessId !== businessId) return;
        set({ members, invites, conflicts, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        if (pending?.businessId !== businessId) return;
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

/** For the pages that change the team and then move on. */
export function refreshTeam(): Promise<void> {
  return useTeamStore.getState().refresh();
}
