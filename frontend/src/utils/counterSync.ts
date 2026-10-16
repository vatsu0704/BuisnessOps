import axios from 'axios';
import { extractErrorMessage, isTransportFailure } from '@/api/client';
import { syncCounterSales } from '@/api/counter';
import { useCounterStore } from '@/store/counterStore';
import { nextBatch, pendingSales, toSyncPayload } from '@/utils/counterQueue';

/**
 * Sends the counter's unsent sales to the server (requirement 30).
 *
 * There is no "is the phone online?" check — React Native has none built in,
 * and NetInfo's answer is a guess anyway (Wi-Fi with no internet says online).
 * The only honest test is sending, so the runner sends:
 *
 * - right after every sale, so an online counter is up to date within a second;
 * - when the app comes back to the foreground, and whenever the counter is opened;
 * - and, while anything is still unsent, on a back-off timer — 5s, 15s, 30s,
 *   1 minute, then every 5 minutes — so a shop that loses its connection for an
 *   hour catches up on its own once it returns.
 *
 * A send that never reaches the server leaves everything queued. A refusal that
 * is about the business — its plan has ended (402) or this person may no longer
 * bill here (403) — stops the timer, because retrying cannot fix it; the counter
 * shows why, and the next foreground or counter visit tries again. A sale the
 * server refuses on its own merits comes back in the results, not as an error,
 * and is kept for a person.
 */

const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 5 * 60_000];
const MAX_BYTES = 60_000;

let inflight: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

function schedule() {
  if (timer) return;
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  attempt += 1;
  timer = setTimeout(() => {
    timer = null;
    kickCounterSync();
  }, delay);
}

function clearSchedule() {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function drain(): Promise<void> {
  const store = useCounterStore.getState();
  const businessId = store.loadedFor;
  if (!businessId) return;

  let maxSales = 20;
  const touchedBranches = new Set<string>();

  for (;;) {
    const current = useCounterStore.getState();
    // A business switch mid-drain: the rest belongs to the next drain.
    if (current.loadedFor !== businessId) return;
    const pending = pendingSales(current.queue);
    if (pending.length === 0) break;

    const batch = nextBatch(pending, { maxSales, maxBytes: MAX_BYTES });
    current.setSyncState('syncing');
    try {
      const response = await syncCounterSales(businessId, batch.map(toSyncPayload));
      if (useCounterStore.getState().loadedFor !== businessId) return;
      await useCounterStore.getState().applyResults(response.results, response.serverNow);
      batch.forEach((sale) => touchedBranches.add(sale.branchId));
      attempt = 0;
      // Anything the server refused stays REJECTED and is no longer pending, so
      // the loop cannot spin on it.
    } catch (err) {
      if (isTransportFailure(err)) {
        useCounterStore.getState().setSyncState('offline');
        schedule();
        return;
      }
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 413 && maxSales > 1) {
        maxSales = Math.max(1, Math.floor(maxSales / 2));
        continue;
      }
      if (status === 402 || status === 403) {
        useCounterStore.getState().setSyncState('blocked', extractErrorMessage(err));
        clearSchedule();
        return;
      }
      if (status === 401) {
        // The session is over; the API client is already signing out. The sales
        // stay on the phone for whoever signs in next.
        return;
      }
      // Anything else is the server's trouble, not the sale's: try again later.
      useCounterStore.getState().setSyncState('offline');
      schedule();
      return;
    }
  }

  clearSchedule();
  attempt = 0;
  useCounterStore.getState().setSyncState('idle');
  // The day's totals and list now include what was sent.
  await Promise.all([...touchedBranches].map((branchId) => useCounterStore.getState().refreshBranch(branchId)));
}

/**
 * Send whatever is waiting. Safe to call as often as anything likes: one drain
 * runs at a time, and a call during a drain makes it look once more at the end.
 */
export function kickCounterSync(): Promise<void> {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      do {
        again = false;
        await drain();
      } while (again);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Stop the timer — on sign-out, so nothing is sent with nobody signed in. */
export function stopCounterSync() {
  clearSchedule();
  attempt = 0;
}
