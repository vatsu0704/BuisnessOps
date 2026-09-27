import { create } from 'zustand';
import { listBranches } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import type { Branch } from '@/types/branch';

/**
 * The branch list, held once for the whole app.
 *
 * ## Why this exists
 *
 * `useBranches` used to be a plain `useState` + `useEffect` inside the hook, so
 * **every component that called it got its own private copy**, fetched once when
 * that component mounted. Twelve components call it. Home's "Your branches"
 * card and the Settings branch count sit inside tab screens that never unmount,
 * so their copies were loaded once at login and never again: adding a branch
 * updated the server, updated whichever copy happened to refresh, and left the
 * card on Home showing the old list until the app was killed and reopened.
 *
 * Making it one store fixes every consumer at once, which is the point. A
 * per-screen `refresh()` call would have fixed the screen someone remembered.
 *
 * ## The rules
 *
 * - `load` is idempotent per business: twelve mounting components cause **one**
 *   request, because a second call while the first is in flight waits on it.
 * - `refresh` always refetches. **Anything that creates or changes a branch must
 *   call it** — see `AddBranchScreen` and `BranchSettingsScreen`.
 * - `loadedFor` records which business the list belongs to, so a stale list is
 *   never shown against the wrong tenant. `useBranches` checks it rather than
 *   trusting the array.
 */

type BranchStore = {
  /** The business the current list belongs to. null means nothing is loaded. */
  loadedFor: string | null;
  branches: Branch[];
  isLoading: boolean;
  error: string | null;
  /** `useBusinessId()` returns undefined before a session resolves, so both absences are accepted. */
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

/**
 * The in-flight request, kept OUT of the store.
 *
 * It is bookkeeping, not state: putting a Promise in the store would make every
 * subscriber re-render when a fetch starts and again when it settles, for a
 * value none of them read.
 */
let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useBranchStore = create<BranchStore>((set, get) => {
  async function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const branches = await listBranches(businessId);
        set({ branches, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        // The previous list is left in place deliberately. A failed refresh on
        // a flaky connection should not empty a screen that was reading fine a
        // second ago; the error is surfaced beside the data instead.
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
    branches: [],
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
      set({ loadedFor: null, branches: [], isLoading: false, error: null });
    },
  };
});

/**
 * Refetch the branch list from outside React.
 *
 * For the screens that create or change a branch: they finish by navigating
 * away, so there is no component left to re-run an effect.
 */
export function refreshBranches() {
  return useBranchStore.getState().refresh();
}
