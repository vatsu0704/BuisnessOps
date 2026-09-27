import { apiClient } from '@/api/client';
import type { BranchMonthlyReport, CrossBusinessReport } from '@/types/analytics';

/**
 * Requirements 13 and 15.
 *
 * `from` and `to` are 'YYYY-MM' and both optional: with neither, the server
 * defaults to the current month and the five before it, computed in the
 * business's own timezone rather than the device's.
 */

export async function getBranchMonthly(
  businessId: string,
  params: { from?: string; to?: string; branchId?: string } = {}
): Promise<BranchMonthlyReport> {
  const { data } = await apiClient.get<BranchMonthlyReport>(
    `/businesses/${businessId}/analytics/branch-monthly`,
    { params }
  );
  return data;
}

/**
 * Every business this account can read, totals only.
 *
 * Not under `/businesses/:id` because it spans them — see the header of
 * `backend/src/routes/analytics.routes.js`. A business where the caller is only
 * a cashier is simply absent from the result.
 */
export async function getCrossBusiness(
  params: { from?: string; to?: string } = {}
): Promise<CrossBusinessReport> {
  const { data } = await apiClient.get<CrossBusinessReport>('/analytics/cross-business', { params });
  return data;
}
