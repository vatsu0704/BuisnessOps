import { create } from 'zustand';
import { getBranchMonthly, getCrossBusiness } from '@/api/analytics';
import { extractErrorMessage } from '@/api/client';
import type { BranchMonthlyReport, CrossBusinessReport } from '@/types/analytics';

/**
 * The branch × month grid and the cross-business roll-up — requirements 13 and 15.
 *
 * In a store rather than in `ReportsScreen`'s `useState` for the reason the rest
 * of them are: the screen is decomposed into a summary card, an attention list
 * and a branch list, the cross-business view reads the same window, and a tab
 * screen never unmounts — so a private copy per component is a copy that goes
 * stale and stays stale. See `salesStore`'s header for the bug this shape exists
 * to prevent.
 *
 * ## Keyed on the window, not just the business
 *
 * Every other store keys `loadedFor` on the business alone, because their data
 * has no parameters. This one is a *query*: the same business with a different
 * month range is different data, and treating "already loaded" as
 * business-equality would leave the previous range's figures on screen after the
 * cursor moved. So the key is `businessId|from|to`, and an empty window is its
 * own key — that is what the server's default resolves, and it must not collide
 * with an explicit one.
 *
 * A failed **refresh** keeps the previous report and puts the error beside it: a
 * screen that was reading correctly a moment ago should not empty itself because
 * one request timed out.
 *
 * ## Why there is no `refreshAnalytics()` beside `refreshSalesSummary()`
 *
 * The convention is that whatever mutates data refreshes it, *because the
 * mutating screen unmounts and leaves no effect to re-run*. That premise does not
 * hold here. Reports is only ever a tab — never pushed over another screen — so
 * `useBranchAnalytics` re-fetches on `useFocusEffect`, and every screen that moves
 * a figure this grid sums (the till, an expense, a supply order, a payroll run) is
 * somewhere else. Reaching Reports at all therefore refreshes it, and an exported
 * helper wired into five call sites would be five calls whose effect already
 * happened.
 */

type Window = { from?: string; to?: string };

type AnalyticsStore = {
  loadedFor: string | null;
  report: BranchMonthlyReport | null;
  isLoading: boolean;
  error: string | null;

  crossLoadedFor: string | null;
  cross: CrossBusinessReport | null;
  isCrossLoading: boolean;
  crossError: string | null;

  load: (businessId: string | null | undefined, window: Window) => Promise<void>;
  refresh: () => Promise<void>;
  loadCross: (window: Window) => Promise<void>;
  refreshCross: () => Promise<void>;
  reset: () => void;
};

const keyOf = (businessId: string, { from, to }: Window) => `${businessId}|${from ?? ''}|${to ?? ''}`;
const crossKeyOf = ({ from, to }: Window) => `${from ?? ''}|${to ?? ''}`;

/** Bookkeeping, not state — a pending promise in the store re-renders every subscriber twice. */
let pending: { key: string; promise: Promise<void> } | null = null;
let crossPending: { key: string; promise: Promise<void> } | null = null;

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => {
  async function fetchGrid(businessId: string, window: Window) {
    const key = keyOf(businessId, window);
    if (pending?.key === key) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const report = await getBranchMonthly(businessId, window);
        set({ report, loadedFor: key, isLoading: false, error: null });
      } catch (err) {
        // `report` is deliberately left alone.
        set({ isLoading: false, error: extractErrorMessage(err) });
      } finally {
        if (pending?.key === key) pending = null;
      }
    })();

    pending = { key, promise };
    return promise;
  }

  async function fetchCross(window: Window) {
    const key = crossKeyOf(window);
    if (crossPending?.key === key) return crossPending.promise;

    const promise = (async () => {
      set({ isCrossLoading: true, crossError: null });
      try {
        const cross = await getCrossBusiness(window);
        set({ cross, crossLoadedFor: key, isCrossLoading: false, crossError: null });
      } catch (err) {
        set({ isCrossLoading: false, crossError: extractErrorMessage(err) });
      } finally {
        if (crossPending?.key === key) crossPending = null;
      }
    })();

    crossPending = { key, promise };
    return promise;
  }

  return {
    loadedFor: null,
    report: null,
    isLoading: false,
    error: null,

    crossLoadedFor: null,
    cross: null,
    isCrossLoading: false,
    crossError: null,

    async load(businessId, window) {
      if (!businessId) {
        get().reset();
        return;
      }
      if (get().loadedFor === keyOf(businessId, window)) return;
      await fetchGrid(businessId, window);
    },

    /** Re-fetch whatever is currently loaded, keeping the same window. */
    async refresh() {
      const { loadedFor } = get();
      if (!loadedFor) return;
      const [businessId, from, to] = loadedFor.split('|');
      await fetchGrid(businessId, { from: from || undefined, to: to || undefined });
    },

    async loadCross(window) {
      if (get().crossLoadedFor === crossKeyOf(window)) return;
      await fetchCross(window);
    },

    async refreshCross() {
      const { crossLoadedFor } = get();
      if (crossLoadedFor === null) return;
      const [from, to] = crossLoadedFor.split('|');
      await fetchCross({ from: from || undefined, to: to || undefined });
    },

    reset() {
      pending = null;
      crossPending = null;
      set({
        loadedFor: null,
        report: null,
        isLoading: false,
        error: null,
        crossLoadedFor: null,
        cross: null,
        isCrossLoading: false,
        crossError: null,
      });
    },
  };
});
