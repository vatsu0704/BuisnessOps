import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getDayEndExport, getMonthEndExport } from '@/api/exports';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { ExportReport } from '@/types/export';

/**
 * What an export *would* contain — requirement 17's card, before the file is made.
 *
 * Screen-local rather than a store, deliberately. The rule is that server data
 * read by more than one component belongs in a zustand store; this is read by one
 * `ExportActions` card, which receives it as a prop, so a store would be a
 * subscription with a single subscriber. `useFocusEffect` covers the part that
 * matters — both screens carrying this card are tab screens that never unmount, so
 * logging an expense and coming back would otherwise offer a stale count.
 *
 * A failed load keeps the previous report and reports the error, so the card does
 * not lose its counts because one request timed out.
 */

type Params = { date?: string; month?: string; branchId?: string };

export function useExportPreview(kind: 'DAY' | 'MONTH', params: Params, enabled = true) {
  const businessId = useBusinessId();
  const [report, setReport] = useState<ExportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { date, month, branchId } = params;

  const load = useCallback(async () => {
    if (!businessId || !enabled) return;
    setIsLoading(true);
    try {
      const next =
        kind === 'DAY'
          ? await getDayEndExport(businessId, { date, branchId })
          : await getMonthEndExport(businessId, { month, branchId });
      setReport(next);
      setError(null);
    } catch (err) {
      // `report` deliberately untouched.
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, enabled, kind, date, month, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return { report, error, isLoading, reload: load };
}
