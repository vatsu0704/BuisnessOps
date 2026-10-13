import { useCallback, useEffect, useState } from 'react';
import { listBranchProducts } from '@/api/product';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { BranchProduct } from '@/types/product';

/**
 * One branch's catalog. Local to its page rather than in a store, because it is
 * keyed per branch and read by one component; the page refetches it on focus.
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
