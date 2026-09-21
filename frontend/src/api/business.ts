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
  // Optional at creation: a branch with no coordinates simply enforces no
  // punch-in radius, which is the default and a perfectly normal branch.
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
}

/**
 * Partial update. `geofenceRadiusMeters: null` explicitly clears the geofence,
 * while omitting the key leaves it alone — the backend distinguishes the two,
 * so this type has to as well.
 */
export interface UpdateBranchPayload {
  name?: string;
  city?: string | null;
  region?: string | null;
  currency?: string | null;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
  status?: Branch['status'];
}

export async function updateBranch(
  businessId: string,
  branchId: string,
  payload: UpdateBranchPayload
): Promise<Branch> {
  const { data } = await apiClient.patch<Branch>(`/businesses/${businessId}/branches/${branchId}`, payload);
  return data;
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
