import { create } from 'zustand';
import { listVendors } from '@/api/supply';
import { extractErrorMessage } from '@/api/client';
import type { Vendor } from '@/types/supply';

/**
 * Third-party vendors (requirement 25), held once — the app's `vendorStore`.
 *
 * The raw-material item form reads it for "Supplied by" now; the Vendors page and
 * Payment QR codes read the same list when they reach the web. Withdrawn vendors
 * are loaded too: the form offers only active ones, but keeps showing an item's
 * withdrawn vendor so saving does not quietly move it back to the warehouse.
 *
 * The same rules as every store: `load` is idempotent per business and a second
 * caller waits on the first request; anything that changes a vendor calls
 * `refreshVendors()`; `loadedFor` is checked by the hook so a business switch
 * never flashes the previous tenant's suppliers; a failed refresh keeps the list.
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

/** In-flight request, kept out of the store so subscribers do not re-render for it. */
let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useVendorStore = create<VendorStore>((set, get) => {
  function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;

    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const vendors = await listVendors(businessId, { includeInactive: true });
        // A switch or sign-out while this was in flight: the answer is not ours.
        if (pending?.businessId !== businessId) return;
        set({ vendors, loadedFor: businessId, isLoading: false, error: null });
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

/** For the pages that change a vendor and then move on. */
export function refreshVendors(): Promise<void> {
  return useVendorStore.getState().refresh();
}
