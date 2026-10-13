import { create } from 'zustand';
import { getSalesSummary } from '@/api/business';
import { extractErrorMessage } from '@/api/client';

/** The business-wide sales summary, held once. Same rules as branchStore. */
type SalesStore = {
  loadedFor: string | null;
  totalSales: number;
  transactionCount: number;
  currency: string;
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

const EMPTY = { totalSales: 0, transactionCount: 0, currency: 'INR' };

let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useSalesStore = create<SalesStore>((set, get) => {
  async function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const byCurrency = await getSalesSummary(businessId);
        set({
          totalSales: byCurrency.reduce((sum, row) => sum + Number(row.totalSales), 0),
          transactionCount: byCurrency.reduce((sum, row) => sum + row.transactionCount, 0),
          // Mixed currencies are not surfaced yet; the first (usually only) one displays.
          currency: byCurrency[0]?.currency ?? get().currency,
          loadedFor: businessId,
          isLoading: false,
          error: null,
        });
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

export function refreshSalesSummary() {
  return useSalesStore.getState().refresh();
}
