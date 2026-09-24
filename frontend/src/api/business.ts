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

export interface CreateBusinessPayload {
  name: string;
  industry: Business['industry'];
  country: string;
  defaultCurrency: string;
  timezone: string;
}

/**
 * Add another business to the account you already have.
 *
 * Unscoped — there is no businessId yet — and the caller becomes its OWNER.
 * Before this, a business could only come into existence through signup, so a
 * second business meant a second account.
 *
 * The membership comes back alongside it, but the caller should still refresh
 * the session: the switcher reads `user.memberships`, and that list has to grow
 * before the new business can be switched to.
 */
export async function createBusiness(
  payload: CreateBusinessPayload
): Promise<{ business: Business; membership: { id: string; role: string; status: string } }> {
  const { data } = await apiClient.post('/businesses', payload);
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
