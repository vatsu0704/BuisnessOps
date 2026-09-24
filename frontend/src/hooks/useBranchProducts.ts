import { useCallback, useEffect, useState } from 'react';
import { listBranchProducts } from '@/api/product';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { BranchProduct } from '@/types/product';

/**
 * One branch's catalog: what it sells and what it charges.
 *
 * Follows the same shape as useBranches and useSalesSummary — plain state plus
 * a `refresh` the caller drives from a focus effect — rather than introducing a
 * query library for one screen.
 *
 * Returns an empty list rather than erroring when there is no branch to ask
 * about yet, which is the state a business has between signing up and adding
 * its first branch.
 */
export function useBranchProducts(branchId: string | null | undefined, includeInactive = false) {
  const businessId = useBusinessId();
  const [products, setProducts] = useState<BranchProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!businessId || !branchId) {
      setProducts([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setProducts(await listBranchProducts(businessId, branchId, { includeInactive }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, branchId, includeInactive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { products, isLoading, error, refresh };
}
