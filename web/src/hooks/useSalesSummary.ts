import { useEffect } from 'react';
import { useSalesStore } from '@/store/salesStore';
import { useBusinessId } from '@/hooks/useBusinessId';

/** The business-wide sales figure, read from the one copy in `salesStore`. */
export function useSalesSummary() {
  const businessId = useBusinessId();

  const load = useSalesStore((s) => s.load);
  const refresh = useSalesStore((s) => s.refresh);
  const error = useSalesStore((s) => s.error);
  const totalSales = useSalesStore((s) => (s.loadedFor === businessId ? s.totalSales : 0));
  const transactionCount = useSalesStore((s) => (s.loadedFor === businessId ? s.transactionCount : 0));
  const currency = useSalesStore((s) => s.currency);
  const isLoading = useSalesStore((s) => (businessId ? s.isLoading || s.loadedFor !== businessId : false));

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  return { totalSales, transactionCount, currency, isLoading, error, refresh };
}
