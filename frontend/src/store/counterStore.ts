import { create } from 'zustand';
import { extractErrorMessage, isTransportFailure } from '@/api/client';
import { getCounterDaySummary, listCounterOrders, voidCounterOrder } from '@/api/counter';
import { listBranchProducts } from '@/api/product';
import { readJson, writeJson } from '@/utils/textStore';
import {
  EMPTY_QUEUE,
  applySyncResults,
  markVoid,
  pruneQueue,
  recordSale,
  removeSale,
  retrySale,
  type CounterQueue,
  type NewSale,
} from '@/utils/counterQueue';
import type {
  CounterBranch,
  CounterDaySummary,
  CounterOrder,
  CounterSaleSyncResult,
  CounterSyncState,
  LocalSale,
} from '@/types/counter';
import type { BranchProduct } from '@/types/product';

/**
 * The counter — everything it needs to keep billing with no connection
 * (requirements 29 and 30).
 *
 * Held per business, like every store (`loadedFor`), and written to the app's
 * own files (`textStore`) under `counter-<businessId>`, so it survives the app
 * being killed, the phone going offline, and the cashier signing out. Two
 * kinds of thing live here:
 *
 * - **The sales the phone made** (`queue`). These are the shop's money. They
 *   are written to disk before the token prints, sent by `utils/counterSync.ts`,
 *   and only ever removed once the server has them for a day that is over — or
 *   when a person confirms removing one the server refused. Signing out does not
 *   remove them; the next person to sign in to this business sends them.
 * - **What the counter read last time it could** — each branch's day context
 *   (payee, receipt header, last token, today's totals), today's server list and
 *   the branch's menu. A failed refresh keeps these, so an offline counter
 *   still has its products, its QR and its numbers.
 */

// Declared with the shared types, so the web's counter reads the same shapes.
export type { CounterBranch, CounterSyncState };

type Persisted = {
  version: 1;
  queue: CounterQueue;
  contexts: Record<string, CounterDaySummary>;
  orders: Record<string, CounterOrder[]>;
  products: Record<string, BranchProduct[]>;
  branches: CounterBranch[];
  /** How far the phone's clock is behind the server's, in ms (server − phone). */
  skewMs: number;
};

type CounterStore = Persisted & {
  loadedFor: string | null;
  syncState: CounterSyncState;
  /** Why syncing stopped: the plan has ended, or this person may no longer bill. */
  blockedMessage: string | null;
  refreshing: Record<string, boolean>;
  /** A refresh that failed for a reason other than being offline. */
  error: string | null;

  load: (businessId: string) => Promise<void>;
  refreshBranch: (branchId: string) => Promise<'ok' | 'offline' | 'failed'>;
  rememberBranches: (branches: CounterBranch[]) => void;
  completeSale: (input: NewSale) => Promise<LocalSale>;
  voidSale: (clientRef: string) => Promise<void>;
  /** Void an order the phone never held — one from before requirement 29. Online only. */
  voidServerOrder: (branchId: string, orderId: string) => Promise<void>;
  retry: (clientRef: string) => Promise<void>;
  remove: (clientRef: string) => Promise<void>;
  applyResults: (results: CounterSaleSyncResult[], serverNow: string) => Promise<void>;
  setSyncState: (state: CounterSyncState, blockedMessage?: string | null) => void;
  reset: () => void;
};

const EMPTY: Persisted = {
  version: 1,
  queue: EMPTY_QUEUE,
  contexts: {},
  orders: {},
  products: {},
  branches: [],
  skewMs: 0,
};

const keyFor = (businessId: string) => `counter-${businessId}`;

/** In-flight load, kept out of the store — see branchStore for why. */
let loading: { businessId: string; promise: Promise<void> } | null = null;

export const useCounterStore = create<CounterStore>((set, get) => {
  /** Write what must survive to disk. Awaited wherever a sale changes. */
  async function persist() {
    const { loadedFor, version, queue, contexts, orders, products, branches, skewMs } = get();
    if (!loadedFor) return;
    await writeJson(keyFor(loadedFor), { version, queue, contexts, orders, products, branches, skewMs });
  }

  function skewFrom(serverNow: string | undefined) {
    const server = serverNow ? Date.parse(serverNow) : NaN;
    return Number.isFinite(server) ? server - Date.now() : get().skewMs;
  }

  return {
    ...EMPTY,
    loadedFor: null,
    syncState: 'idle',
    blockedMessage: null,
    refreshing: {},
    error: null,

    load(businessId) {
      if (get().loadedFor === businessId) return Promise.resolve();
      if (loading?.businessId === businessId) return loading.promise;
      const promise = (async () => {
        const saved = await readJson<Partial<Persisted>>(keyFor(businessId));
        // Another load may have started for a different business meanwhile.
        if (loading?.businessId !== businessId) return;
        set({
          ...EMPTY,
          ...(saved?.version === 1 ? saved : {}),
          queue: saved?.queue ?? EMPTY_QUEUE,
          loadedFor: businessId,
          syncState: 'idle',
          blockedMessage: null,
          refreshing: {},
          error: null,
        });
      })().finally(() => {
        if (loading?.businessId === businessId) loading = null;
      });
      loading = { businessId, promise };
      return promise;
    },

    async refreshBranch(branchId) {
      const businessId = get().loadedFor;
      if (!businessId) return 'failed';
      set((state) => ({ refreshing: { ...state.refreshing, [branchId]: true } }));
      const [context, orders, products] = await Promise.allSettled([
        getCounterDaySummary(businessId, branchId),
        listCounterOrders(businessId, branchId),
        listBranchProducts(businessId, branchId),
      ]);
      // A business switch while the requests were out: these belong elsewhere.
      if (get().loadedFor !== businessId) return 'failed';

      const failures = [context, orders, products].filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      set((state) => {
        const next: Partial<CounterStore> = { refreshing: { ...state.refreshing, [branchId]: false } };
        if (context.status === 'fulfilled') {
          next.contexts = { ...state.contexts, [branchId]: context.value };
          next.skewMs = skewFrom(context.value.serverNow);
          const todayByBranch = Object.fromEntries(
            Object.entries({ ...state.contexts, [branchId]: context.value }).map(([id, ctx]) => [id, ctx.todayKey])
          );
          next.queue = pruneQueue(state.queue, todayByBranch);
        }
        if (orders.status === 'fulfilled') next.orders = { ...state.orders, [branchId]: orders.value };
        if (products.status === 'fulfilled') next.products = { ...state.products, [branchId]: products.value };
        // Offline is not an error worth a banner — the sync pill already says so,
        // and the cached data is still on screen.
        const realFailure = failures.find((failure) => !isTransportFailure(failure.reason));
        next.error = realFailure ? extractErrorMessage(realFailure.reason) : null;
        return next;
      });
      await persist();
      if (failures.length === 0) return 'ok';
      return failures.every((failure) => isTransportFailure(failure.reason)) ? 'offline' : 'failed';
    },

    rememberBranches(branches) {
      const current = get().branches;
      const same =
        current.length === branches.length &&
        current.every((branch, i) => branch.id === branches[i].id && branch.name === branches[i].name);
      if (same || !get().loadedFor) return;
      set({ branches });
      void persist();
    },

    async completeSale(input) {
      const { queue, sale } = recordSale(get().queue, input);
      set({ queue });
      // On disk before the caller prints: a token in a customer's hand must
      // never belong to a sale the phone could still lose.
      await persist();
      return sale;
    },

    async voidSale(clientRef) {
      set({ queue: markVoid(get().queue, clientRef) });
      await persist();
    },

    async voidServerOrder(branchId, orderId) {
      const businessId = get().loadedFor;
      if (!businessId) return;
      const updated = await voidCounterOrder(businessId, orderId);
      set((state) => ({
        orders: {
          ...state.orders,
          [branchId]: (state.orders[branchId] ?? []).map((order) => (order.id === orderId ? updated : order)),
        },
      }));
      await persist();
    },

    async retry(clientRef) {
      set({ queue: retrySale(get().queue, clientRef) });
      await persist();
    },

    async remove(clientRef) {
      set({ queue: removeSale(get().queue, clientRef) });
      await persist();
    },

    async applyResults(results, serverNow) {
      set({ queue: applySyncResults(get().queue, results), skewMs: skewFrom(serverNow) });
      await persist();
    },

    setSyncState(syncState, blockedMessage = null) {
      set({ syncState, blockedMessage });
    },

    reset() {
      // Memory only. The files stay: they hold sales the server may not have.
      loading = null;
      set({ ...EMPTY, loadedFor: null, syncState: 'idle', blockedMessage: null, refreshing: {}, error: null });
    },
  };
});
