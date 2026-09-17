import { apiClient } from './client';
import type { Locale, User } from '@/types/user';
import type { Business, Industry } from '@/types/business';

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
  // Omitted when the email has a pending invite — the backend joins that
  // business instead of creating a new one, so these become irrelevant.
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
  const { data } = await apiClient.post<AuthResponse>('/auth/signup', payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
  return data;
}

export async function fetchSession(): Promise<SessionResponse> {
  const { data } = await apiClient.get<SessionResponse>('/auth/me');
  return data;
}

export async function updatePreferredLocale(preferredLocale: Locale): Promise<User> {
  const { data } = await apiClient.patch<User>('/auth/me/locale', { preferredLocale });
  return data;
}
