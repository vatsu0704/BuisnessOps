import { useEffect } from 'react';
import { useSalesStore } from '@/store/salesStore';
import { useBusinessId } from '@/hooks/useBusinessId';

/**
 * The business-wide sales figure.
 *
 * Same shape as before, now backed by `salesStore` so Home and its sales tiles
 * read one number instead of two copies that could disagree — see the store's
 * header for the bug that caused.
 */
export function useSalesSummary() {
  const businessId = useBusinessId();

  const load = useSalesStore((s) => s.load);
  const refresh = useSalesStore((s) => s.refresh);
  const error = useSalesStore((s) => s.error);

  // Each selector checks `loadedFor` itself rather than closing over a value
  // computed by another one, which would go stale between store updates.
  const totalSales = useSalesStore((s) => (s.loadedFor === businessId ? s.totalSales : 0));
  const transactionCount = useSalesStore((s) =>
    s.loadedFor === businessId ? s.transactionCount : 0
  );
  const currency = useSalesStore((s) => s.currency);
  const isLoading = useSalesStore((s) =>
    businessId ? s.isLoading || s.loadedFor !== businessId : false
  );

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  return { totalSales, transactionCount, currency, isLoading, error, refresh };
}
