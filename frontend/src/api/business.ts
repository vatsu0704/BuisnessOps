import { apiClient } from '@/api/client';
import type { Branch } from '@/types/branch';
import type { Business } from '@/types/business';

/**
 * The full record for one business the caller belongs to. Switching business
 * has to replace industry, currency and timezone on the session, not just the
 * id and name that the membership list already carries.
 */
export async function getBusiness(businessId: string): Promise<Business> {
  const { data } = await apiClient.get<Business>(`/businesses/${businessId}`);
  return data;
}

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

export interface SalesSummaryByCurrency {
  currency: string;
  // Prisma serializes Decimal sums as strings to avoid float precision loss.
  totalSales: string;
  transactionCount: number;
}

export async function getSalesSummary(businessId: string): Promise<SalesSummaryByCurrency[]> {
  const { data } = await apiClient.get<{ byCurrency: SalesSummaryByCurrency[] }>(
    `/businesses/${businessId}/sales-summary`
  );
  return data.byCurrency;
}
