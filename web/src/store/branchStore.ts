import { create } from 'zustand';
import { listBranches } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import type { Branch } from '@/types/branch';

/**
 * The branch list, held once for the whole app — the same store, with the same
 * rules, as the mobile app's `branchStore`:
 *
 * - `load` is idempotent per business; components mounting together cause one request.
 * - `refresh` always refetches. Anything that creates or changes a branch calls it.
 * - `loadedFor` says which business the list belongs to, so a switch never shows
 *   the previous tenant's rows.
 * - A failed refresh keeps the previous list and reports the error beside it.
 */
type BranchStore = {
  loadedFor: string | null;
  branches: Branch[];
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

/** The in-flight request — bookkeeping, kept out of the store so it re-renders nothing. */
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

export function refreshBranches() {
  return useBranchStore.getState().refresh();
}
