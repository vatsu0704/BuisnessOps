import { create } from 'zustand';
import * as secureStorage from '@/utils/secureStorage';
import { setAuthToken, extractErrorMessage } from '@/api/client';
import { signup as signupRequest, login as loginRequest, fetchCurrentUser } from '@/api/auth';
import type { SignupPayload, LoginPayload } from '@/api/auth';
import type { User } from '@/types/user';
import type { Business } from '@/types/business';

const TOKEN_KEY = 'buisnessops_token';

interface AuthState {
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
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  isBootstrapping: true,
  isSubmitting: false,
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
      const user = await fetchCurrentUser();
      set({ token, user, isBootstrapping: false });
    } catch {
      // Stored token is expired/invalid — drop it and fall back to login.
      await secureStorage.deleteItem(TOKEN_KEY);
      setAuthToken(null);
      set({ token: null, user: null, isBootstrapping: false });
    }
  },

  login: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const result = await loginRequest(payload);
      await secureStorage.setItem(TOKEN_KEY, result.token);
      setAuthToken(result.token);
      set({ token: result.token, user: result.user, isSubmitting: false });
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
      set({
        token: result.token,
        user: result.user,
        business: result.business ?? null,
        isSubmitting: false,
      });
    } catch (err) {
      set({ isSubmitting: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  logout: async () => {
    await secureStorage.deleteItem(TOKEN_KEY);
    setAuthToken(null);
    set({ token: null, user: null, business: null });
  },

  clearError: () => set({ error: null }),
}));
