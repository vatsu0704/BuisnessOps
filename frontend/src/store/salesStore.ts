import { create } from 'zustand';
import { getSalesSummary } from '@/api/business';
import { extractErrorMessage } from '@/api/client';

/**
 * The business-wide sales summary, held once.
 *
 * Same fix as `branchStore`, and the same bug before it: `HomeScreen` and
 * `SalesTilesSection` each called `useSalesSummary()` and each got a private
 * copy. Home refreshed *its* copy when the screen regained focus — but the
 * number the user actually looks at is rendered by the section, which never
 * refreshed. So a counter sale moved the figure on the server and not on the
 * screen until the app was restarted.
 *
 * Sharing it also halves the requests: Home used to ask for the same summary
 * twice on every focus.
 */

type SalesStore = {
  loadedFor: string | null;
  totalSales: number;
  transactionCount: number;
  currency: string;
  isLoading: boolean;
  error: string | null;
  /** `useBusinessId()` returns undefined before a session resolves, so both absences are accepted. */
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

const EMPTY = { totalSales: 0, transactionCount: 0, currency: 'INR' };

/** Bookkeeping, not state — see the note in branchStore. */
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
          // A business could in theory mix currencies across branches; until
          // that is surfaced in the UI, the first (usually only) one displays.
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

/**
 * Refetch the sales figure from outside React.
 *
 * Anything that books revenue calls this — a counter order, a CSV import — so
 * the number on Home moves with the till rather than at the next restart.
 */
export function refreshSalesSummary() {
  return useSalesStore.getState().refresh();
}
