import { useEffect, useMemo, useState } from 'react';
import { useAnalyticsStore, analyticsKey, crossKey } from '@/store/analyticsStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { monthKeyMinus, thisMonthKey } from '@/utils/date';

/**
 * The branch × month grid, for requirements 13 and 15 — the app's hook. The range
 * is a query parameter, so it lives beside the fetch; the page owns only which of
 * the returned months is being read.
 */

export const RANGE_OPTIONS = [3, 6, 12] as const;
export type RangeMonths = (typeof RANGE_OPTIONS)[number];

export function useBranchAnalytics(initialRange: RangeMonths = 6) {
  const businessId = useBusinessId();
  const [monthsBack, setMonthsBack] = useState<RangeMonths>(initialRange);

  // The browser's clock only decides which window to ask for. Every figure in it
  // is bucketed in each branch's own timezone by the server.
  const range = useMemo(() => {
    const to = thisMonthKey();
    return { from: monthKeyMinus(to, monthsBack - 1), to };
  }, [monthsBack]);

  const load = useAnalyticsStore((s) => s.load);
  const refresh = useAnalyticsStore((s) => s.refresh);
  const error = useAnalyticsStore((s) => s.error);

  const key = businessId ? analyticsKey(businessId, range) : null;
  // Checked in the selector, so the previous business's or the previous window's
  // report never renders for a frame.
  const report = useAnalyticsStore((s) => (s.loadedFor === key ? s.report : null));
  const isLoading = useAnalyticsStore((s) => (key ? s.isLoading || s.loadedFor !== key : false));

  useEffect(() => {
    void load(businessId, range);
  }, [businessId, range, load]);

  // A sale rung up on a phone while this tab sat in the background shows when it
  // comes back. Mounting is `load`'s job, which asks only when it has to.
  useRefreshOnFocus(refresh, { onMount: false });

  return { report, isLoading, error, monthsBack, setMonthsBack, refresh, range };
}

/**
 * Every business this account can read, totals only. Takes the window rather than
 * owning one, so switching scope never quietly changes the period compared.
 */
export function useCrossBusinessAnalytics(range: { from: string; to: string }, enabled: boolean) {
  const loadCross = useAnalyticsStore((s) => s.loadCross);
  const refreshCross = useAnalyticsStore((s) => s.refreshCross);
  const crossError = useAnalyticsStore((s) => s.crossError);

  const key = crossKey(range);
  const cross = useAnalyticsStore((s) => (s.crossLoadedFor === key ? s.cross : null));
  const isLoading = useAnalyticsStore((s) => s.isCrossLoading || s.crossLoadedFor !== key);

  useEffect(() => {
    if (enabled) void loadCross(range);
  }, [enabled, range, loadCross]);

  useRefreshOnFocus(
    () => {
      if (enabled) void refreshCross();
    },
    { onMount: false }
  );

  return { cross, isLoading: enabled ? isLoading : false, error: crossError, refresh: refreshCross };
}
