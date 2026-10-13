import { apiClient } from './client';
import type { BranchMonthlyReport, CrossBusinessReport } from '@/types/analytics';

/**
 * Requirements 13 and 15. `from` and `to` are 'YYYY-MM' and both optional: with
 * neither, the server takes the current month and the five before it, in the
 * business's own timezone rather than the browser's.
 */
export async function getBranchMonthly(
  businessId: string,
  params: { from?: string; to?: string; branchId?: string } = {}
): Promise<BranchMonthlyReport> {
  const { data } = await apiClient.get<BranchMonthlyReport>(`/businesses/${businessId}/analytics/branch-monthly`, {
    params,
  });
  return data;
}

/**
 * Every business this account can read, totals only. Not under `/businesses/:id`
 * because it spans them; a business where the caller is only a cashier is simply
 * absent from the answer.
 */
export async function getCrossBusiness(params: { from?: string; to?: string } = {}): Promise<CrossBusinessReport> {
  const { data } = await apiClient.get<CrossBusinessReport>('/analytics/cross-business', { params });
  return data;
}
