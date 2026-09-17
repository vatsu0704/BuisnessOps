import { useCallback, useEffect, useState } from 'react';
import { getSalesSummary } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';

export function useSalesSummary() {
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);

  const [totalSales, setTotalSales] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [currency, setCurrency] = useState('INR');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) {
      setTotalSales(0);
      setTransactionCount(0);
      setIsLoading(false);
      return;
    }
    try {
      setError(null);
      const byCurrency = await getSalesSummary(businessId);
      setTotalSales(byCurrency.reduce((sum, row) => sum + Number(row.totalSales), 0));
      setTransactionCount(byCurrency.reduce((sum, row) => sum + row.transactionCount, 0));
      // A business could in theory mix currencies across branches; until that's
      // surfaced in the UI, the first (usually only) currency drives display.
      if (byCurrency[0]) setCurrency(byCurrency[0].currency);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await load();
  }, [load]);

  return { totalSales, transactionCount, currency, isLoading, error, refresh };
}
