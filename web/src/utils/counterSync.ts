import axios from 'axios';
import { createCounterSyncRunner, type CounterSyncDeps } from '@shared/utils/counterSyncRunner';
import { extractErrorMessage, isTransportFailure } from '@/api/client';
import { syncCounterSales } from '@/api/counter';
import { useCounterStore } from '@/store/counterStore';

/**
 * The web's sender for the counter's unsent sales (requirement 30): the shared
 * rules in `utils/counterSyncRunner.ts` — when to send, the back-off, what each
 * refusal means — wired to this app's store, API call and axios errors.
 *
 * What the phone does not need: **one tab sends at a time.** Every tab of the
 * app shares one queue, so the drain runs under a Web Lock named for the
 * business; a tab that finds it taken leaves the sending to the one holding it
 * and looks again on its timer. A browser without Web Locks (an address that is
 * not https) just sends — a resend is harmless, because the server answers
 * DUPLICATE for a sale it already has.
 */
const exclusive: CounterSyncDeps['exclusive'] =
  typeof navigator !== 'undefined' && navigator.locks
    ? async (businessId, drain) =>
        // Awaited here: the lock resolves with what the callback returns, a promise.
        await navigator.locks.request(`hisabkitab-counter-sync:${businessId}`, { ifAvailable: true }, async (lock) => {
          if (!lock) return 'busy' as const;
          await drain();
          return 'ran' as const;
        })
    : undefined;

const runner = createCounterSyncRunner({
  getState: () => {
    const state = useCounterStore.getState();
    // Nothing is kept in a browser that will not store data, so nothing is sent from it.
    return { businessId: state.storageUnavailable ? null : state.loadedFor, queue: state.queue };
  },
  send: syncCounterSales,
  classify: (err) => ({
    transport: isTransportFailure(err),
    status: axios.isAxiosError(err) ? (err.response?.status ?? null) : null,
    message: extractErrorMessage(err),
  }),
  applyResults: (results, serverNow) => useCounterStore.getState().applyResults(results, serverNow),
  setSyncState: (state, blockedMessage) => useCounterStore.getState().setSyncState(state, blockedMessage),
  refreshBranches: (branchIds) =>
    Promise.all(branchIds.map((branchId) => useCounterStore.getState().refreshBranch(branchId))),
  exclusive,
});

/**
 * Send whatever is waiting. Safe to call as often as anything likes: one drain
 * runs at a time, and a call during a drain makes it look once more at the end.
 */
export function kickCounterSync(): Promise<void> {
  return runner.kick();
}

/** Stop the timer — on sign-out, so nothing is sent with nobody signed in. */
export function stopCounterSync() {
  runner.stop();
}
