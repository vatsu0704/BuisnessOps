import { create } from 'zustand';
import { getBranchMonthly, getCrossBusiness } from '@/api/analytics';
import { extractErrorMessage } from '@/api/client';
import type { BranchMonthlyReport, CrossBusinessReport } from '@/types/analytics';

/**
 * The branch × month grid and the cross-business roll-up — requirements 13 and
 * 15, the app's `analyticsStore`.
 *
 * Keyed on the window as well as the business (`businessId|from|to`): the same
 * business over a different range is different data, and treating "already
 * loaded" as business-equality would leave the previous range's figures on the
 * page after the range changed. A failed refresh keeps the previous report and
 * puts the error beside it.
 */

type MonthRange = { from?: string; to?: string };

type AnalyticsStore = {
  loadedFor: string | null;
  report: BranchMonthlyReport | null;
  isLoading: boolean;
  error: string | null;

  crossLoadedFor: string | null;
  cross: CrossBusinessReport | null;
  isCrossLoading: boolean;
  crossError: string | null;

  load: (businessId: string | null | undefined, range: MonthRange) => Promise<void>;
  refresh: () => Promise<void>;
  loadCross: (range: MonthRange) => Promise<void>;
  refreshCross: () => Promise<void>;
  reset: () => void;
};

export const analyticsKey = (businessId: string, { from, to }: MonthRange) => `${businessId}|${from ?? ''}|${to ?? ''}`;
export const crossKey = ({ from, to }: MonthRange) => `${from ?? ''}|${to ?? ''}`;

/** Bookkeeping, kept out of the store so it re-renders nothing. */
let pending: { key: string; promise: Promise<void> } | null = null;
let crossPending: { key: string; promise: Promise<void> } | null = null;

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => {
  async function fetchGrid(businessId: string, range: MonthRange) {
    const key = analyticsKey(businessId, range);
    if (pending?.key === key) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const report = await getBranchMonthly(businessId, range);
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

  async function fetchCross(range: MonthRange) {
    const key = crossKey(range);
    if (crossPending?.key === key) return crossPending.promise;

    const promise = (async () => {
      set({ isCrossLoading: true, crossError: null });
      try {
        const cross = await getCrossBusiness(range);
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

    async load(businessId, range) {
      if (!businessId) {
        get().reset();
        return;
      }
      if (get().loadedFor === analyticsKey(businessId, range)) return;
      await fetchGrid(businessId, range);
    },

    async refresh() {
      const { loadedFor } = get();
      if (!loadedFor) return;
      const [businessId, from, to] = loadedFor.split('|');
      await fetchGrid(businessId, { from: from || undefined, to: to || undefined });
    },

    async loadCross(range) {
      if (get().crossLoadedFor === crossKey(range)) return;
      await fetchCross(range);
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
