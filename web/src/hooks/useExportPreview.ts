import { useCallback, useEffect, useState } from 'react';
import { extractErrorMessage } from '@/api/client';
import { getDayEndExport, getMonthEndExport } from '@/api/exports';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { ExportReport } from '@/types/export';

type Params = { date?: string; month?: string; branchId?: string };

/**
 * What an export *would* contain — requirement 17's card, before the file is
 * made. Local to its page, as in the app: one `ExportActions` reads it. A failed
 * load keeps the previous report, so the card does not lose its counts because
 * one request timed out.
 */
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
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, enabled, kind, date, month, branchId]);

  useEffect(() => {
    // A different period's counts are not this one's: clear them while the new
    // ones load, so the card never offers last month's figures for this month.
    setReport(null);
    void load();
  }, [load]);

  useRefreshOnFocus(load, { onMount: false });

  return { report, error, isLoading, reload: load };
}
