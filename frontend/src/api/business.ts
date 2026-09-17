import { apiClient } from '@/api/client';
import type { Branch } from '@/types/branch';

export async function listBranches(businessId: string): Promise<Branch[]> {
  const { data } = await apiClient.get<Branch[]>(`/businesses/${businessId}/branches`);
  return data;
}

export interface CreateBranchPayload {
  name: string;
  code: string;
  timezone: string;
  city?: string;
  region?: string;
  country?: string;
  currency?: string;
}

export async function createBranch(businessId: string, payload: CreateBranchPayload): Promise<Branch> {
  const { data } = await apiClient.post<Branch>(`/businesses/${businessId}/branches`, payload);
  return data;
}
