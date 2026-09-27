import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import { monthKeyMinus, thisMonthKey } from '@/utils/date';

/**
 * The branch × month grid, for requirements 13 and 15.
 *
 * ## Why the window lives here and not in the screen
 *
 * The range is a *query parameter*, so it belongs beside the fetch rather than
 * in a screen that also has to remember which month is in focus. The hook owns
 * "how many months", derives `from`/`to` from it, and re-fetches when it
 * changes; the screen owns only which of the returned months is being read.
 *
 * `monthsBack` is capped at the server's own ceiling by construction: the three
 * offered ranges are 3, 6 and 12, all well inside `MAX_MONTHS`.
 */

export const RANGE_OPTIONS = [3, 6, 12] as const;
export type RangeMonths = (typeof RANGE_OPTIONS)[number];

export function useBranchAnalytics(initialRange: RangeMonths = 6) {
  const businessId = useBusinessId();
  const [monthsBack, setMonthsBack] = useState<RangeMonths>(initialRange);

  // Computed from the device's clock only to *ask* for a window. Every figure
  // inside it is bucketed in the branch's own timezone by the server, which is
  // the only place that knows each branch's zone.
  const range = useMemo(() => {
    const to = thisMonthKey();
    return { from: monthKeyMinus(to, monthsBack - 1), to };
  }, [monthsBack]);

  const load = useAnalyticsStore((s) => s.load);
  const refresh = useAnalyticsStore((s) => s.refresh);
  const error = useAnalyticsStore((s) => s.error);

  const key = businessId ? `${businessId}|${range.from}|${range.to}` : null;
  // Checked in the selector rather than closed over, so a report from the
  // previous business or the previous window never renders for a frame.
  const report = useAnalyticsStore((s) => (s.loadedFor === key ? s.report : null));
  const isLoading = useAnalyticsStore((s) => (key ? s.isLoading || s.loadedFor !== key : false));

  useEffect(() => {
    void load(businessId, range);
  }, [businessId, range, load]);

  // Reports is a tab screen and never unmounts, so the effect above will not run
  // again on its own. Without this, a sale rung up after Reports was last opened
  // would not appear until the app was killed.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { report, isLoading, error, monthsBack, setMonthsBack, refresh, range };
}

/**
 * Every business this account can read, totals only.
 *
 * Shares the store with the grid above so both scopes of the Reports screen
 * survive a tab switch, and takes the window as an argument rather than owning
 * one — the two views must move together when the range changes, or switching
 * scope would silently change the period being compared.
 */
export function useCrossBusinessAnalytics(range: { from: string; to: string }, enabled: boolean) {
  const loadCross = useAnalyticsStore((s) => s.loadCross);
  const refreshCross = useAnalyticsStore((s) => s.refreshCross);
  const crossError = useAnalyticsStore((s) => s.crossError);

  const key = `${range.from}|${range.to}`;
  const cross = useAnalyticsStore((s) => (s.crossLoadedFor === key ? s.cross : null));
  const isLoading = useAnalyticsStore((s) => s.isCrossLoading || s.crossLoadedFor !== key);

  useEffect(() => {
    if (enabled) void loadCross(range);
  }, [enabled, range, loadCross]);

  // The grid refreshes on focus and this has to as well, or switching to Reports
  // with the cross-business scope already selected would show whatever was
  // fetched the last time it was opened. `loadCross` will not do it — the key
  // still matches, so it returns early by design.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void refreshCross();
    }, [enabled, refreshCross])
  );

  return { cross, isLoading: enabled ? isLoading : false, error: crossError, refresh: refreshCross };
}
