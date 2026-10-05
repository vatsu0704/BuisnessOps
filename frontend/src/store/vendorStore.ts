import { create } from 'zustand';
import { listVendors } from '@/api/supply';
import { extractErrorMessage } from '@/api/client';
import type { Vendor } from '@/types/supply';

/**
 * Third-party vendors (requirement 25), held once for the whole app.
 *
 * Three screens read this list — the raw-material item form ("supplied by"),
 * the vendors screen the desk manages it from, and the Payment QR codes screen
 * accounts sets their UPI IDs on — so it lives here rather than in three
 * private copies, for the reason `branchStore`'s header gives: a tab screen
 * never unmounts, and a private copy is a stale copy.
 *
 * Withdrawn vendors are loaded too. The item form offers only active ones, but
 * the vendors screen has to show the withdrawn ones in order to restore them.
 *
 * The same three rules as every other store: `load` is idempotent per business
 * and dedupes an in-flight request; **anything that changes a vendor calls
 * `refreshVendors()`** before navigating away; and the hook checks `loadedFor`
 * so a business switch never flashes the previous tenant's suppliers.
 */

type VendorStore = {
  loadedFor: string | null;
  vendors: Vendor[];
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

/** In-flight request, kept out of the store — see branchStore for why. */
let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useVendorStore = create<VendorStore>((set, get) => {
  async function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const vendors = await listVendors(businessId, { includeInactive: true });
        set({ vendors, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        // The previous list stays: a failed refresh must not empty a screen
        // that was reading fine a moment ago. The error shows beside it.
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
    vendors: [],
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
      set({ loadedFor: null, vendors: [], isLoading: false, error: null });
    },
  };
});

/** Refetch from outside React, for the screens that change a vendor and then navigate away. */
export function refreshVendors() {
  return useVendorStore.getState().refresh();
}
