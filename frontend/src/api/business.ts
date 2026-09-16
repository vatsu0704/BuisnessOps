import { apiClient } from '@/api/client';
import type { Branch } from '@/types/branch';

export async function listBranches(businessId: string): Promise<Branch[]> {
  const { data } = await apiClient.get<Branch[]>(`/businesses/${businessId}/branches`);
  return data;
}
