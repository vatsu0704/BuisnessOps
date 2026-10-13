import { create } from 'zustand';
import {
  extractErrorMessage,
  isTransportFailure,
  setAuthToken,
  setSessionEndedHandler,
  warmUpServer,
} from '@/api/client';
import { fetchSession, login as loginRequest, signup as signupRequest } from '@/api/auth';
import type { LoginPayload, SignupPayload } from '@/api/auth';
import { getBusiness } from '@/api/business';
import { useBranchStore } from '@/store/branchStore';
import { useSalesStore } from '@/store/salesStore';
import type { Business } from '@/types/business';
import type { User } from '@/types/user';
import { activeMembership } from '@/utils/permissions';
import { storage, STORAGE_KEYS } from '@/utils/storage';

/**
 * Reconcile the remembered business against the memberships this session has.
 * The stored id is never trusted: it can point at a business this account was
 * revoked from, or belong to whoever used the browser last.
 */
function resolveActiveBusinessId(user: User | null): string | null {
  const stored = storage.get(STORAGE_KEYS.businessId);
  const resolved = activeMembership(user, stored)?.businessId ?? null;
  if (resolved !== stored) {
    if (resolved) storage.set(STORAGE_KEYS.businessId, resolved);
    else storage.remove(STORAGE_KEYS.businessId);
  }
  return resolved;
}

interface AuthState {
  /** The business every scoped request is made against. */
  activeBusinessId: string | null;
  /** True only for the one-time check on load. Separate from isSubmitting so a sign-in never unmounts its form. */
  isBootstrapping: boolean;
  isSubmitting: boolean;
  token: string | null;
  user: User | null;
  business: Business | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => void;
  /** Re-read the session quietly — when the tab comes back into view. */
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isBootstrapping: true,
  isSubmitting: false,
  activeBusinessId: null,
  token: null,
  user: null,
  business: null,
  error: null,

  bootstrap: async () => {
    const token = storage.get(STORAGE_KEYS.token);
    if (!token) {
      // Signed out: the sign-in page is next, so start waking the server now.
      void warmUpServer();
      set({ isBootstrapping: false });
      return;
    }

    setAuthToken(token);
    try {
      const { user, business } = await fetchSession();
      const activeBusinessId = resolveActiveBusinessId(user);
      // /auth/me returns the API's own pick; the remembered choice wins.
      const remembered =
        activeBusinessId && business?.id !== activeBusinessId
          ? await getBusiness(activeBusinessId).catch(() => business)
          : business;
      set({ token, user, business: remembered, activeBusinessId, isBootstrapping: false });
    } catch (err) {
      // Only a reply from the API proves the token is bad. A request that never
      // got one says nothing about it, and deleting it there signs people out
      // because their server was cold.
      if (!isTransportFailure(err)) storage.remove(STORAGE_KEYS.token);
      setAuthToken(null);
      set({ token: null, user: null, business: null, activeBusinessId: null, isBootstrapping: false });
    }
  },

  login: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const result = await loginRequest(payload);
      storage.set(STORAGE_KEYS.token, result.token);
      setAuthToken(result.token);
      // Deliberately not the remembered business: a fresh sign-in may be a
      // different person in the same browser, so this account's pick wins.
      const activeBusinessId = result.business?.id ?? activeMembership(result.user)?.businessId ?? null;
      if (activeBusinessId) storage.set(STORAGE_KEYS.businessId, activeBusinessId);
      else storage.remove(STORAGE_KEYS.businessId);
      set({
        token: result.token,
        user: result.user,
        business: result.business ?? null,
        activeBusinessId,
        isSubmitting: false,
      });
    } catch (err) {
      set({ isSubmitting: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  signup: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const result = await signupRequest(payload);
      storage.set(STORAGE_KEYS.token, result.token);
      setAuthToken(result.token);
      const activeBusinessId = result.business?.id ?? activeMembership(result.user)?.businessId ?? null;
      if (activeBusinessId) storage.set(STORAGE_KEYS.businessId, activeBusinessId);
      set({
        token: result.token,
        user: result.user,
        business: result.business ?? null,
        activeBusinessId,
        isSubmitting: false,
      });
    } catch (err) {
      set({ isSubmitting: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  logout: () => {
    storage.remove(STORAGE_KEYS.token);
    storage.remove(STORAGE_KEYS.businessId);
    setAuthToken(null);
    // The shared caches outlive this store's state, so they are emptied too.
    useBranchStore.getState().reset();
    useSalesStore.getState().reset();
    set({ token: null, user: null, business: null, activeBusinessId: null, error: null });
  },

  /**
   * Forgiving on purpose: a failure means the network blinked, which must not
   * sign anybody out. It does re-run the stale-choice reconciliation, so access
   * revoked while the tab was in the background falls back to a business the
   * person still belongs to.
   */
  refreshSession: async () => {
    try {
      const { user } = await fetchSession();
      const activeBusinessId = resolveActiveBusinessId(user);
      const current = get().activeBusinessId;
      const business =
        activeBusinessId && activeBusinessId !== current
          ? await getBusiness(activeBusinessId).catch(() => get().business)
          : get().business;
      set({ user, business, activeBusinessId });
    } catch {
      // Offline or a blip — keep what we have.
    }
  },

  clearError: () => set({ error: null }),
}));

/**
 * End the session when the API says it is over. Reuses `logout`, so a session
 * that ends by itself leaves exactly what a deliberate sign-out leaves; the
 * router then shows the sign-in page because `token` is null. Guarded, because
 * several requests can fail with the same 401 at once.
 */
setSessionEndedHandler(() => {
  if (!useAuthStore.getState().token) return;
  useAuthStore.getState().logout();
});
