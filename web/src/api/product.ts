import { apiClient } from './client';
import type { BranchProduct } from '@/types/product';

/** One branch's catalog, with each product's effective price at that branch. */
export async function listBranchProducts(
  businessId: string,
  branchId: string,
  options: { includeInactive?: boolean } = {}
): Promise<BranchProduct[]> {
  const { data } = await apiClient.get<BranchProduct[]>(`/businesses/${businessId}/products`, {
    params: { branchId, includeInactive: options.includeInactive ? 'true' : undefined },
  });
  return data;
}
