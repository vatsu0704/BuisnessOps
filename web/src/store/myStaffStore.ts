import { create } from 'zustand';
import axios from 'axios';
import { getMyStaffMember } from '@/api/staff';
import { extractErrorMessage } from '@/api/client';
import type { MyStaffMember } from '@/types/staffing';

/**
 * "Am I a staff member of this business, and which record am I?" — the app's
 * `useMyStaffMember`, held once because two pages ask it: Home's punch-in card
 * and the Staff page, which shows its own view to somebody on the roster.
 *
 * Backed by `GET /staff/me`. **A 404 is an answer, not a failure**: most owners
 * have no staff record at all, and `staffMember: null` with `loadedFor` set means
 * exactly that. The same rules as every store — `loadedFor`, one request in
 * flight, a failed refresh keeps the last answer beside its error.
 */
type MyStaffStore = {
  loadedFor: string | null;
  staffMember: MyStaffMember | null;
  isLoading: boolean;
  error: string | null;
  load: (businessId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

let pending: { businessId: string; promise: Promise<void> } | null = null;

export const useMyStaffStore = create<MyStaffStore>((set, get) => {
  function fetchFor(businessId: string) {
    if (pending?.businessId === businessId) return pending.promise;
    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const staffMember = await getMyStaffMember(businessId);
        if (pending?.businessId !== businessId) return;
        set({ staffMember, loadedFor: businessId, isLoading: false, error: null });
      } catch (err) {
        if (pending?.businessId !== businessId) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          set({ staffMember: null, loadedFor: businessId, isLoading: false, error: null });
        } else {
          set({ isLoading: false, error: extractErrorMessage(err) });
        }
      } finally {
        if (pending?.businessId === businessId) pending = null;
      }
    })();
    pending = { businessId, promise };
    return promise;
  }

  return {
    loadedFor: null,
    staffMember: null,
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
      set({ loadedFor: null, staffMember: null, isLoading: false, error: null });
    },
  };
});

/** After a staff record changes — a branch moved, an account linked — so the punch card reads the new one. */
export function refreshMyStaff(): Promise<void> {
  return useMyStaffStore.getState().refresh();
}
