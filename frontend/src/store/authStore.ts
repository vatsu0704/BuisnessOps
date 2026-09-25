import { create } from 'zustand';
import * as secureStorage from '@/utils/secureStorage';
import { setAuthToken, extractErrorMessage } from '@/api/client';
import { signup as signupRequest, login as loginRequest, fetchSession } from '@/api/auth';
import type { SignupPayload, LoginPayload } from '@/api/auth';
import { getBusiness, createBusiness as createBusinessRequest } from '@/api/business';
import type { CreateBusinessPayload } from '@/api/business';
import { activeMembership } from '@/utils/permissions';
import type { User } from '@/types/user';
import type { Business } from '@/types/business';
import { useBranchStore } from '@/store/branchStore';
import { useNotificationStore } from '@/store/notificationStore';
import { currentPushToken, unregisterFromPush } from '@/utils/push';
import { useSalesStore } from '@/store/salesStore';

const TOKEN_KEY = 'biziq_token';
// Which business the switcher last settled on, remembered per device so the
// app reopens where it was left rather than on whichever membership the API
// happened to consider primary.
const BUSINESS_KEY = 'biziq_business_id';

/**
 * Reconcile the remembered choice against the memberships this session
 * actually has.
 *
 * The stored id is never trusted: it can point at a business this account was
 * revoked from, or belong to whoever used the device last. activeMembership
 * falls back to any ACTIVE membership in that case, and the resolved value is
 * written back so the stale one does not keep being re-checked.
 */
async function resolveActiveBusinessId(user: User | null): Promise<string | null> {
  const stored = await secureStorage.getItem(BUSINESS_KEY);
  const resolved = activeMembership(user, stored)?.businessId ?? null;
  if (resolved !== stored) {
    if (resolved) await secureStorage.setItem(BUSINESS_KEY, resolved);
    else await secureStorage.deleteItem(BUSINESS_KEY);
  }
  return resolved;
}

interface AuthState {
  /**
   * The business every scoped request is made against. Null only while
   * signed out, or when every membership has been revoked.
   */
  activeBusinessId: string | null;
  isSwitchingBusiness: boolean;
  // True only for the one-time check on app launch (token in SecureStore? still valid?).
  // Deliberately separate from isSubmitting so a login/signup attempt never
  // unmounts the form it's submitted from.
  isBootstrapping: boolean;
  isSubmitting: boolean;
  token: string | null;
  user: User | null;
  business: Business | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Act under a different business. Rejects any id that is not an ACTIVE membership. */
  switchBusiness: (businessId: string) => Promise<void>;
  /**
   * Requirement 16: add another business to this account and start acting under
   * it. Resolves with the new business so the caller can name it.
   */
  addBusiness: (payload: CreateBusinessPayload) => Promise<Business>;
  /**
   * Re-read the session without disturbing anything else. Called when the app
   * returns to the foreground, because role now decides which tabs exist.
   */
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isBootstrapping: true,
  isSubmitting: false,
  activeBusinessId: null,
  isSwitchingBusiness: false,
  token: null,
  user: null,
  business: null,
  error: null,

  bootstrap: async () => {
    const token = await secureStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ isBootstrapping: false });
      return;
    }

    setAuthToken(token);
    try {
      const { user, business } = await fetchSession();
      const activeBusinessId = await resolveActiveBusinessId(user);
      // /auth/me hands back the API's own primary pick. Honour the remembered
      // choice over it when they disagree, which is the whole point of the
      // switcher surviving an app restart.
      const remembered =
        activeBusinessId && business?.id !== activeBusinessId
          ? await getBusiness(activeBusinessId).catch(() => business)
          : business;
      set({ token, user, business: remembered, activeBusinessId, isBootstrapping: false });
    } catch {
      // Stored token is expired/invalid — drop it and fall back to login.
      await secureStorage.deleteItem(TOKEN_KEY);
      setAuthToken(null);
      set({ token: null, user: null, business: null, activeBusinessId: null, isBootstrapping: false });
    }
  },

  login: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const result = await loginRequest(payload);
      await secureStorage.setItem(TOKEN_KEY, result.token);
      setAuthToken(result.token);
      // Deliberately not the remembered business: a fresh login may be a
      // different person on the same device, so the API's pick for THIS
      // account wins and the stored choice is re-derived from it.
      const activeBusinessId = result.business?.id ?? activeMembership(result.user)?.businessId ?? null;
      if (activeBusinessId) await secureStorage.setItem(BUSINESS_KEY, activeBusinessId);
      else await secureStorage.deleteItem(BUSINESS_KEY);
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
      await secureStorage.setItem(TOKEN_KEY, result.token);
      setAuthToken(result.token);
      const activeBusinessId = result.business?.id ?? null;
      if (activeBusinessId) await secureStorage.setItem(BUSINESS_KEY, activeBusinessId);
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

  logout: async () => {
    await secureStorage.deleteItem(TOKEN_KEY);
    await secureStorage.deleteItem(BUSINESS_KEY);
    setAuthToken(null);
    // The shared caches outlive this store's state, so they are emptied here
    // too. `loadedFor` already stops one account's data being shown to another,
    // but leaving it in memory after a logout is not something to rely on.
    useBranchStore.getState().reset();
    useSalesStore.getState().reset();
    useNotificationStore.getState().reset();
    // Stop this handset receiving pushes for the account signing out. Awaited
    // but never allowed to throw: somebody pressing Log out has to end up
    // logged out whatever the network is doing.
    await unregisterFromPush(await currentPushToken());
    set({ token: null, user: null, business: null, activeBusinessId: null });
  },

  /**
   * Nothing changes until the new business has actually been fetched, so a
   * failed switch leaves the app acting under the business it was already on
   * rather than on an id with no record behind it.
   */
  switchBusiness: async (businessId) => {
    const { user, activeBusinessId } = get();
    if (businessId === activeBusinessId) return;
    const target = activeMembership(user, businessId);
    if (target?.businessId !== businessId) return;

    set({ isSwitchingBusiness: true });
    try {
      const business = await getBusiness(businessId);
      await secureStorage.setItem(BUSINESS_KEY, businessId);
      set({ business, activeBusinessId: businessId, isSwitchingBusiness: false });
    } catch (err) {
      set({ isSwitchingBusiness: false });
      throw err;
    }
  },

  /**
   * Create a business and switch to it in one step.
   *
   * The session is re-read from the server rather than having the new
   * membership appended locally. `user.memberships` is what the switcher
   * renders and what `switchBusiness` validates an id against, so a
   * hand-appended row would be a second place that has to match the server's
   * membership shape — and the switcher would break the moment it drifted.
   *
   * Switching is done here rather than by calling switchBusiness, which would
   * re-fetch a business this call already has.
   */
  addBusiness: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const { business } = await createBusinessRequest(payload);
      const { user } = await fetchSession();
      await secureStorage.setItem(BUSINESS_KEY, business.id);
      set({ user, business, activeBusinessId: business.id, isSubmitting: false });
      return business;
    } catch (err) {
      set({ isSubmitting: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  /**
   * Silent refresh. Deliberately forgiving: a failure here means the phone was
   * offline or the server was briefly unreachable, which must not sign anyone
   * out or surface an error over whatever they were looking at. The stale
   * session simply stays until the next attempt.
   *
   * It does re-run the stale-choice reconciliation, so access revoked while the
   * app was backgrounded falls back to a business they still belong to rather
   * than leaving them on one the API now refuses.
   */
  refreshSession: async () => {
    try {
      const { user } = await fetchSession();
      const activeBusinessId = await resolveActiveBusinessId(user);
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
