import type { CounterSaleSyncResult, CounterSyncResponse, CounterSyncState } from '../types/counter';
import { nextBatch, pendingSales, toSyncPayload, type CounterQueue } from './counterQueue';

/**
 * Sends the counter's unsent sales to the server (requirement 30) — the rules,
 * shared by the phone and the web so the two cannot drift. Each app hands it its
 * own store, API call and error reader; nothing here knows axios, zustand or a
 * platform.
 *
 * There is no "is it online?" check. A phone's answer is a guess (Wi-Fi with no
 * internet says online) and so is a browser's, so the only honest test is
 * sending, and the runner sends:
 *
 * - whenever an app kicks it — after a sale, on resume, when the counter opens;
 * - and, while anything is still unsent, on a back-off timer — 5s, 15s, 30s,
 *   1 minute, then every 5 minutes — so a shop that loses its connection for an
 *   hour catches up on its own once it returns.
 *
 * One drain at a time; a kick during a drain makes it look once more at the end.
 * A send that never reaches the server leaves everything queued. A refusal that is
 * about the business — its plan has ended (402) or this person may no longer bill
 * here (403) — stops the timer, because retrying cannot fix it; the counter shows
 * why, and the next kick tries again. A 413 halves the batch that was refused. A
 * 401 stops quietly: the session is over and the app is already signing out, and
 * the sales stay for whoever signs in next. A sale the server refuses on its own merits comes back
 * in the results, not as an error, and is kept for a person.
 */

/** What an app makes of a failed send, read by its own HTTP client. */
export type SyncFailure = {
  /** The request never got an answer — offline, a timeout, a refused connection. */
  transport: boolean;
  status: number | null;
  /** The sentence to show when syncing is blocked. */
  message: string;
};

type MaybePromise<T> = T | Promise<T>;

export interface CounterSyncDeps {
  /** The business the counter's data belongs to, and its queue — read fresh on every pass. */
  getState(): MaybePromise<{ businessId: string | null; queue: CounterQueue }>;
  send(businessId: string, sales: ReturnType<typeof toSyncPayload>[]): Promise<CounterSyncResponse>;
  classify(error: unknown): SyncFailure;
  applyResults(results: CounterSaleSyncResult[], serverNow: string): Promise<void>;
  setSyncState(state: CounterSyncState, blockedMessage?: string | null): void;
  /** After the queue empties: the day's totals and lists now include what was sent. */
  refreshBranches(branchIds: string[]): Promise<unknown>;
  /**
   * Run a drain only if no other copy of the app is running one — the web's tabs,
   * which share one queue. Resolves 'busy' when another holds it, and the runner
   * tries again on its timer. The phone has one copy and leaves this out.
   */
  exclusive?(businessId: string, drain: () => Promise<void>): Promise<'ran' | 'busy'>;
  backoffMs?: readonly number[];
  maxSales?: number;
  maxBytes?: number;
}

export const SYNC_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 5 * 60_000] as const;
const MAX_SALES = 20;
const MAX_BYTES = 60_000;

export function createCounterSyncRunner(deps: CounterSyncDeps) {
  const backoff = deps.backoffMs ?? SYNC_BACKOFF_MS;
  let inflight: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function schedule() {
    if (timer) return;
    const delay = backoff[Math.min(attempt, backoff.length - 1)];
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      void kick();
    }, delay);
  }

  function clearSchedule() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function drainFor(businessId: string): Promise<void> {
    let maxSales = deps.maxSales ?? MAX_SALES;
    const touchedBranches = new Set<string>();

    for (;;) {
      const current = await deps.getState();
      // A business switch mid-drain: the rest belongs to the next drain.
      if (current.businessId !== businessId) return;
      const pending = pendingSales(current.queue);
      if (pending.length === 0) break;

      const batch = nextBatch(pending, { maxSales, maxBytes: deps.maxBytes ?? MAX_BYTES });
      deps.setSyncState('syncing');
      try {
        const response = await deps.send(businessId, batch.map(toSyncPayload));
        if ((await deps.getState()).businessId !== businessId) return;
        await deps.applyResults(response.results, response.serverNow);
        batch.forEach((sale) => touchedBranches.add(sale.branchId));
        attempt = 0;
        // Anything the server refused is REJECTED and no longer pending, so the
        // loop cannot spin on it.
      } catch (error) {
        const failure = deps.classify(error);
        if (failure.transport) {
          deps.setSyncState('offline');
          schedule();
          return;
        }
        // Too large: half of what was just refused. A single sale refused as too
        // large is not made smaller by sending it again, so that is the server's
        // trouble like any other.
        if (failure.status === 413 && batch.length > 1) {
          maxSales = Math.max(1, Math.floor(batch.length / 2));
          continue;
        }
        if (failure.status === 402 || failure.status === 403) {
          deps.setSyncState('blocked', failure.message);
          clearSchedule();
          return;
        }
        if (failure.status === 401) return;
        // Anything else is the server's trouble, not the sale's: try again later.
        deps.setSyncState('offline');
        schedule();
        return;
      }
    }

    clearSchedule();
    attempt = 0;
    deps.setSyncState('idle');
    await deps.refreshBranches([...touchedBranches]);
  }

  async function drain(): Promise<void> {
    const { businessId } = await deps.getState();
    if (!businessId) return;
    if (!deps.exclusive) {
      await drainFor(businessId);
      return;
    }
    if ((await deps.exclusive(businessId, () => drainFor(businessId))) === 'busy') schedule();
  }

  /**
   * Send whatever is waiting. Safe to call as often as anything likes: one drain
   * runs at a time, and a call during a drain makes it look once more at the end.
   */
  function kick(): Promise<void> {
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
  function stop() {
    clearSchedule();
    attempt = 0;
  }

  return { kick, stop };
}
