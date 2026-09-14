import { apiClient } from './client';
import type { User } from '@/types/user';
import type { Business, Industry } from '@/types/business';

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
  businessName: string;
  industry: Industry;
  country: string;
  defaultCurrency: string;
  timezone: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  business?: Business;
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/signup', payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
  return data;
}

export async function fetchCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me');
  return data;
}
