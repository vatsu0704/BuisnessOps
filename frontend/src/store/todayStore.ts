import { create } from 'zustand';
import { getToday } from '@/api/today';
import { extractErrorMessage } from '@/api/client';
import type { TodaySummary } from '@/types/today';

/**
 * Today at a glance (requirement 33), held once for the whole app.
 *
 * Home's figures and its recent bills read it, and the screens that change it —
 * an upload, a counter that has just synced — refresh it, so it lives here
 * rather than in a screen, for the reason `branchStore`'s header gives: a tab
 * screen never unmounts, and a private copy is a stale copy.
 *
 * It replaced the all-time `salesStore`: Home now answers "how is today going?",
 * which is what anybody opening the app between customers wants to know.
 *
 * The same rules as every store: `loadedFor` so a business switch never shows
 * another tenant's numbers, an in-flight request deduped and kept out of the
 * store, and a failed refresh keeps the previous figures beside the error.
 */
type TodayStore = {
  loadedFor: string | null;
  today: TodaySummary | null;
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useTodayStore = create<TodayStore>((set, get) => {
  function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;
    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const today = await getToday(businessId);
        if (pending?.businessId !== businessId) return;
        set({ today, loadedFor: businessId, isLoading: false, error: null });
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
    today: null,
    isLoading: false,
    error: null,

    async load(businessId) {
      if (!businessId) {
        get().reset();
        return;
      }
      // Always fetched: "today" moves on its own, so a cached copy is only a
      // starting point, never the answer.
      await fetchFor(businessId);
    },

    async refresh() {
      const { loadedFor } = get();
      if (loadedFor) await fetchFor(loadedFor);
    },

    reset() {
      pending = null;
      set({ loadedFor: null, today: null, isLoading: false, error: null });
    },
  };
});

/** For screens that change today's figures — an upload, a sale — before they navigate away. */
export function refreshToday(): Promise<void> {
  return useTodayStore.getState().refresh();
}
