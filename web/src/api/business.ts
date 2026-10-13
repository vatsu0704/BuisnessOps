import { apiClient } from './client';
import type { Branch } from '@/types/branch';
import type { Business, SalesSummaryByCurrency } from '@/types/business';

/** The full record for one business the caller belongs to. */
export async function getBusiness(businessId: string): Promise<Business> {
  const { data } = await apiClient.get<Business>(`/businesses/${businessId}`);
  return data;
}

export async function listBranches(businessId: string): Promise<Branch[]> {
  const { data } = await apiClient.get<Branch[]>(`/businesses/${businessId}/branches`);
  return data;
}

export async function getSalesSummary(businessId: string): Promise<SalesSummaryByCurrency[]> {
  const { data } = await apiClient.get<{ byCurrency: SalesSummaryByCurrency[] }>(
    `/businesses/${businessId}/sales-summary`
  );
  return data.byCurrency;
}
