import { apiClient } from './client';
import type { Branch, BranchKind, BranchOperatingModel } from '@/types/branch';
import type { Business, SalesSummaryByCurrency } from '@/types/business';
import type { SubscriptionSummary } from '@/types/user';

/** The full record for one business the caller belongs to. */
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
  /** Omitted means BRANCH. */
  kind?: BranchKind;
  /** Requirement 24. Optional on the wire (the server defaults to FM), but Add branch always asks. */
  operatingModel?: BranchOperatingModel;
  timezone: string;
  city?: string;
  region?: string;
  country?: string;
  addressLine?: string;
  postalCode?: string;
  currency?: string;
  /** Optional: a branch with no coordinates enforces no punch-in radius. */
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
}

/**
 * A partial update. `null` clears a value — that is how "turn off geofencing"
 * and "forget this address" are said — while leaving a key out leaves it alone;
 * the backend tells the two apart, so this type has to.
 */
export interface UpdateBranchPayload {
  name?: string;
  kind?: BranchKind;
  operatingModel?: BranchOperatingModel;
  city?: string | null;
  region?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  currency?: string | null;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
  status?: Branch['status'];
}

export async function createBranch(businessId: string, payload: CreateBranchPayload): Promise<Branch> {
  const { data } = await apiClient.post<Branch>(`/businesses/${businessId}/branches`, payload);
  return data;
}

export async function updateBranch(businessId: string, branchId: string, payload: UpdateBranchPayload): Promise<Branch> {
  const { data } = await apiClient.patch<Branch>(`/businesses/${businessId}/branches/${branchId}`, payload);
  return data;
}

export async function getSalesSummary(businessId: string): Promise<SalesSummaryByCurrency[]> {
  const { data } = await apiClient.get<{ byCurrency: SalesSummaryByCurrency[] }>(
    `/businesses/${businessId}/sales-summary`
  );
  return data.byCurrency;
}

export interface CreateBusinessPayload {
  name: string;
  industry: Business['industry'];
  country: string;
  defaultCurrency: string;
  timezone: string;
}

/**
 * Add another business to the account. Unscoped — there is no business id yet —
 * and the caller becomes its OWNER. The session has to be re-read afterwards so
 * the new membership is in the list the switcher shows.
 */
export async function createBusiness(
  payload: CreateBusinessPayload
): Promise<{ business: Business; membership: { id: string; role: string; status: string } }> {
  const { data } = await apiClient.post('/businesses', payload);
  return data;
}

/**
 * Requirement 28 — the owner's view of the plan. `billing:manage`, which only
 * the owner holds.
 */
export async function getSubscription(businessId: string): Promise<SubscriptionSummary> {
  const { data } = await apiClient.get<SubscriptionSummary>(`/businesses/${businessId}/subscription`);
  return data;
}
