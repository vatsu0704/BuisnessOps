import axios from 'axios';
import { extractErrorMessage, isTransportFailure } from '@/api/client';
import { syncCounterSales } from '@/api/counter';
import { useCounterStore } from '@/store/counterStore';
import { createCounterSyncRunner } from '@/utils/counterSyncRunner';

/**
 * The phone's sender for the counter's unsent sales (requirement 30): the shared
 * rules in `utils/counterSyncRunner.ts` — when to send, the back-off, what each
 * refusal means — wired to this app's store, API call and axios errors.
 *
 * The phone runs one copy of the app, so it needs no lock between copies; the web
 * passes one for its tabs.
 */
const runner = createCounterSyncRunner({
  getState: () => {
    const state = useCounterStore.getState();
    return { businessId: state.loadedFor, queue: state.queue };
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
