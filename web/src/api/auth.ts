import { apiClient, AUTH_TIMEOUT_MS } from './client';
import type { Locale, User } from '@/types/user';
import type { Business, Industry } from '@/types/business';

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
  // Omitted when the email has a pending invite — the backend joins that
  // business instead of creating a new one.
  businessName?: string;
  industry?: Industry;
  country?: string;
  defaultCurrency?: string;
  timezone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  business: Business | null;
}

export interface SessionResponse {
  user: User;
  business: Business | null;
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/signup', payload, { timeout: AUTH_TIMEOUT_MS });
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload, { timeout: AUTH_TIMEOUT_MS });
  return data;
}

export async function fetchSession(): Promise<SessionResponse> {
  const { data } = await apiClient.get<SessionResponse>('/auth/me', { timeout: AUTH_TIMEOUT_MS });
  return data;
}

export async function updatePreferredLocale(preferredLocale: Locale): Promise<User> {
  const { data } = await apiClient.patch<User>('/auth/me/locale', { preferredLocale });
  return data;
}

export interface DeleteAccountResponse {
  /** The businesses that were owned alone and went with the account. */
  deletedBusinessIds: string[];
}

/** A business with months of records takes a while to cascade, so this waits like sign-in. */
export async function deleteAccount(password: string): Promise<DeleteAccountResponse> {
  const { data } = await apiClient.post<DeleteAccountResponse>(
    '/auth/me/delete',
    { password },
    { timeout: AUTH_TIMEOUT_MS }
  );
  return data;
}
