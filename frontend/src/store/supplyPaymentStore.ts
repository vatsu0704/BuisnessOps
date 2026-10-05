import { create } from 'zustand';
import { listPaymentsDue, listPaymentsToConfirm } from '@/api/supply';
import { extractErrorMessage } from '@/api/client';
import type { SupplyPaymentOrder } from '@/types/supply';

/**
 * The money waiting on somebody — requirements 26 and 27 — held once.
 *
 * Two lists:
 * - **due**: company-operated (FOCO) branches' orders accounts has to pay for,
 *   delivered or still on their way.
 * - **toConfirm**: payments franchise branches have sent the warehouse that
 *   nobody has confirmed arrived yet.
 *
 * Read by the Payments screen and by Home's two cards, and changed from the
 * order screen too (confirming a payment there takes it off "to confirm") — so
 * a store, and every screen that changes either list calls
 * `refreshSupplyPayments()` before it navigates away.
 *
 * Each list is fetched only for someone allowed to read it: the desk confirms
 * payments and pays for nothing, so it never asks for "due" and never sees a
 * 403 for it. Which lists to fetch travels with the request, and a refresh
 * repeats the same choice.
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

/** In-flight request and the lists it was for, kept out of the store — see branchStore for why. */
let pending: { businessId: string; promise: Promise<void> } | null = null;
let lastLists: PaymentLists = { due: false, toConfirm: false };

const EMPTY = { due: [] as SupplyPaymentOrder[], toConfirm: [] as SupplyPaymentOrder[] };

export const useSupplyPaymentStore = create<SupplyPaymentStore>((set, get) => {
  async function fetchFor(businessId: string, lists: PaymentLists) {
    if (pending?.businessId === businessId) return pending.promise;
    lastLists = lists;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const [due, toConfirm] = await Promise.all([
          lists.due ? listPaymentsDue(businessId) : Promise.resolve([]),
          lists.toConfirm ? listPaymentsToConfirm(businessId) : Promise.resolve([]),
        ]);
        set({ due, toConfirm, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        // Keep what was showing; say what went wrong beside it.
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

/** Refetch both lists from outside React, after paying, confirming or receiving. */
export function refreshSupplyPayments() {
  return useSupplyPaymentStore.getState().refresh();
}
