import { create } from 'zustand';
import { listPaymentsDue, listPaymentsToConfirm } from '@/api/supply';
import { extractErrorMessage } from '@/api/client';
import type { SupplyPaymentOrder } from '@/types/supply';

/**
 * The money waiting on somebody — requirements 26 and 27 — held once, as the
 * app's `supplyPaymentStore`.
 *
 * - **due**: company-operated (FOCO) branches' orders accounts has to pay for,
 *   delivered or still on their way.
 * - **toConfirm**: payments franchise branches sent the warehouse that nobody has
 *   confirmed arrived yet.
 *
 * Payments and Home's two payment cards read it; the order page changes it —
 * delivering makes a FOCO order payable, "Received" takes a payment off the
 * to-confirm list — so every page that does either calls
 * `refreshSupplyPayments()`. For somebody who never loaded the lists that is a
 * no-op.
 *
 * Each list is fetched only for someone allowed to read it: the desk confirms
 * payments and pays for nothing, so it never asks for "due". Which lists travel
 * with the request, and a refresh repeats the same choice.
 */
export type PaymentLists = { due: boolean; toConfirm: boolean };

type SupplyPaymentStore = {
  loadedFor: string | null;
  due: SupplyPaymentOrder[];
  toConfirm: SupplyPaymentOrder[];
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined, lists: PaymentLists) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

/** In-flight request, and the lists the last one was for, kept out of the store. */
let pending: { businessId: string; promise: Promise<void> } | null = null;
let lastLists: PaymentLists = { due: false, toConfirm: false };

const EMPTY = { due: [] as SupplyPaymentOrder[], toConfirm: [] as SupplyPaymentOrder[] };

export const useSupplyPaymentStore = create<SupplyPaymentStore>((set, get) => {
  function fetchFor(businessId: string, lists: PaymentLists) {
    if (pending?.businessId === businessId) return pending.promise;
    lastLists = lists;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const [due, toConfirm] = await Promise.all([
          lists.due ? listPaymentsDue(businessId) : Promise.resolve([]),
          lists.toConfirm ? listPaymentsToConfirm(businessId) : Promise.resolve([]),
        ]);
        // A switch or sign-out while this was in flight: the answer is not ours.
        if (pending?.businessId !== businessId) return;
        set({ due, toConfirm, loadedFor: businessId, isLoading: false, error: null });
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

    async load(businessId, lists) {
      if (!businessId || (!lists.due && !lists.toConfirm)) {
        get().reset();
        return;
      }
      await fetchFor(businessId, lists);
    },

    async refresh() {
      const { loadedFor } = get();
      if (loadedFor) await fetchFor(loadedFor, lastLists);
    },

    reset() {
      pending = null;
      set({ loadedFor: null, ...EMPTY, isLoading: false, error: null });
    },
  };
});

/** Refetch both lists after paying, confirming, delivering or receiving. */
export function refreshSupplyPayments(): Promise<void> {
  return useSupplyPaymentStore.getState().refresh();
}
