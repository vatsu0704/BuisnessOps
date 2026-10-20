import { useCallback, useEffect, useState } from 'react';
import { extractErrorMessage, isTransportFailure } from '@/api/client';
import { getCounterDaySummary, listCounterOrders } from '@/api/counter';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { CounterDaySummary, CounterOrder } from '@/types/counter';

type State = {
  summary: CounterDaySummary | null;
  orders: CounterOrder[];
  state: 'idle' | 'loading' | 'ready' | 'offline' | 'failed';
  error: string | null;
};

const IDLE: State = { summary: null, orders: [], state: 'idle', error: null };

/**
 * A day that is over, read straight from the server and held nowhere else.
 *
 * ## Why this is not in the counter store
 *
 * The store is written to the phone's own files and read back on the next start,
 * so a cursor in it would reopen the till on last Tuesday, with the cart hidden.
 *
 * Worse, a past day's summary in `contexts` would be a **duplicate-token bug**:
 * `getDaySummary` returns `todayKey` as the branch's real today whatever date was
 * asked for, so `sameDay` would be true and `serverLast` would take the past
 * day's `lastTokenNumber` as today's. The very next sale would reuse a token.
 *
 * So: screen-lifetime state, fetched through the API clients directly, never
 * through `refreshBranch` — which also recomputes `skewMs` and re-runs
 * `pruneQueue`. Nothing here can disturb an unsent bill.
 *
 * `dayKey` of `null` means today, which the store already owns; this sits idle.
 */
export function usePastCounterDay(branchId: string | null, dayKey: string | null) {
  const businessId = useBusinessId();
  const [state, setState] = useState<State>(IDLE);

  const load = useCallback(async () => {
    if (!businessId || !branchId || !dayKey) {
      setState(IDLE);
      return;
    }
    setState((current) => ({ ...current, state: 'loading', error: null }));
    try {
      const [summary, orders] = await Promise.all([
        getCounterDaySummary(businessId, branchId, dayKey),
        listCounterOrders(businessId, branchId, { date: dayKey }),
      ]);
      setState({ summary, orders, state: 'ready', error: null });
    } catch (err) {
      // Offline is its own answer: the bills this device still holds for that
      // day are worth showing, and the day's totals are not, because a figure
      // knowingly short of the server's is worse than none.
      setState({
        summary: null,
        orders: [],
        state: isTransportFailure(err) ? 'offline' : 'failed',
        error: extractErrorMessage(err),
      });
    }
  }, [businessId, branchId, dayKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
