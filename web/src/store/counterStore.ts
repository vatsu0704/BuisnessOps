import { create } from 'zustand';
import { extractErrorMessage, isTransportFailure } from '@/api/client';
import { getCounterDaySummary, listCounterOrders, voidCounterOrder } from '@/api/counter';
import { listBranchProducts } from '@/api/product';
import type { CounterBranch, CounterSaleSyncResult, CounterSyncState, LocalSale } from '@/types/counter';
import {
  EMPTY_QUEUE,
  applySyncResults,
  markVoid,
  nextTokenNumber,
  pruneQueue,
  recordSale,
  removeSale,
  retrySale,
  type NewSale,
} from '@shared/utils/counterQueue';
import { broadcast, isAvailable, onCounterMessage, readDoc, updateDoc, type CounterDoc } from '@/utils/counterPersistence';

/**
 * The web counter — everything it needs to keep billing with no connection
 * (requirements 29 and 30), the app's `counterStore` over the browser's
 * IndexedDB (`utils/counterPersistence.ts`).
 *
 * The same two kinds of thing as on the phone: **the sales this browser made**
 * (`queue`), which are the shop's money — on disk before the token prints, sent
 * by `useCounterSync`, never dropped on the browser's own initiative — and **what
 * the counter read last time it could**: each branch's day context, its bills and
 * its menu, kept through a failed refresh so an offline counter still has its
 * products, its QR and its numbers.
 *
 * What the web adds is tabs. Every change is made to the stored record in one
 * transaction and the record is then this store's state, so two tabs never
 * overwrite each other with a stale copy — and a sale's token is chosen inside
 * that transaction, so two tabs never issue the same one. A change in one tab is
 * read again by the others.
 */

type CounterStore = CounterDoc & {
  loadedFor: string | null;
  syncState: CounterSyncState;
  /** Why syncing stopped: the plan has ended, or this person may no longer bill. */
  blockedMessage: string | null;
  refreshing: Record<string, boolean>;
  /** A refresh that failed for a reason other than being offline. */
  error: string | null;
  /** This browser will not keep data (some private windows): no bill can be taken. */
  storageUnavailable: boolean;

  load: (businessId: string) => Promise<void>;
  refreshBranch: (branchId: string) => Promise<'ok' | 'offline' | 'failed'>;
  rememberBranches: (branches: CounterBranch[]) => void;
  /**
   * Take a paid sale: give it the next token for its branch's day and save it,
   * resolving only once it is on disk. `serverLast` is the highest token the
   * server knows of for that day.
   */
  completeSale: (input: Omit<NewSale, 'tokenNumber'>, serverLast: number) => Promise<LocalSale>;
  voidSale: (clientRef: string) => Promise<void>;
  /** Void a bill this browser never held. Online only. */
  voidServerOrder: (branchId: string, orderId: string) => Promise<void>;
  retry: (clientRef: string) => Promise<void>;
  remove: (clientRef: string) => Promise<void>;
  applyResults: (results: CounterSaleSyncResult[], serverNow: string) => Promise<void>;
  setSyncState: (state: CounterSyncState, blockedMessage?: string | null) => void;
  reset: () => void;
};

const EMPTY: CounterDoc = {
  version: 1,
  queue: EMPTY_QUEUE,
  contexts: {},
  orders: {},
  products: {},
  branches: [],
  skewMs: 0,
};

function docOf(state: CounterDoc): CounterDoc {
  const { version, queue, contexts, orders, products, branches, skewMs } = state;
  return { version, queue, contexts, orders, products, branches, skewMs };
}

/** A stored record from an older shape is ignored rather than half-read. */
function usable(doc: CounterDoc | null): CounterDoc | null {
  return doc && doc.version === 1 ? { ...EMPTY, ...doc, queue: doc.queue ?? EMPTY_QUEUE } : null;
}

/** In-flight load, kept out of the store — see branchStore for why. */
let loading: { businessId: string; promise: Promise<void> } | null = null;
let stopListening: (() => void) | null = null;

export const useCounterStore = create<CounterStore>((set, get) => {
  /**
   * Change the stored record and take it as this store's state. Throws when it
   * cannot be saved — the caller has not taken the sale.
   */
  async function write<T>(change: (doc: CounterDoc) => { doc: CounterDoc; result: T }, durable: boolean): Promise<T> {
    const businessId = get().loadedFor;
    if (!businessId) throw new Error('The counter has not loaded');
    const { doc, result } = await updateDoc(
      businessId,
      (stored) => change(usable(stored) ?? docOf(get())),
      { durable }
    );
    if (get().loadedFor === businessId) set(docOf(doc));
    return result;
  }

  function skewFrom(serverNow: string | undefined) {
    const server = serverNow ? Date.parse(serverNow) : NaN;
    return Number.isFinite(server) ? server - Date.now() : get().skewMs;
  }

  /** Another tab changed the record, or told us how sending stands. */
  function listen() {
    stopListening?.();
    stopListening = onCounterMessage((message) => {
      const businessId = get().loadedFor;
      if (!businessId || message.businessId !== businessId) return;
      if (message.type === 'sync-state') {
        set({ syncState: message.state, blockedMessage: message.blockedMessage });
        return;
      }
      void readDoc(businessId)
        .then((doc) => {
          const fresh = usable(doc);
          if (fresh && get().loadedFor === businessId) set(docOf(fresh));
        })
        .catch(() => undefined);
    });
  }

  return {
    ...EMPTY,
    loadedFor: null,
    syncState: 'idle',
    blockedMessage: null,
    refreshing: {},
    error: null,
    storageUnavailable: false,

    load(businessId) {
      if (get().loadedFor === businessId) return Promise.resolve();
      if (loading?.businessId === businessId) return loading.promise;
      const promise = (async () => {
        const available = await isAvailable();
        const saved = available ? usable(await readDoc(businessId).catch(() => null)) : null;
        // Another load may have started for a different business meanwhile.
        if (loading?.businessId !== businessId) return;
        set({
          ...EMPTY,
          ...(saved ?? {}),
          loadedFor: businessId,
          syncState: 'idle',
          blockedMessage: null,
          refreshing: {},
          error: null,
          storageUnavailable: !available,
        });
        listen();
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
      // Offline is not an error worth a banner — the sync pill already says so,
      // and the kept data is still on the page.
      const realFailure = failures.find((failure) => !isTransportFailure(failure.reason));
      set((state) => ({
        refreshing: { ...state.refreshing, [branchId]: false },
        error: realFailure ? extractErrorMessage(realFailure.reason) : null,
      }));

      const merge = (doc: CounterDoc): CounterDoc => {
        const next = { ...doc };
        if (context.status === 'fulfilled') {
          next.contexts = { ...doc.contexts, [branchId]: context.value };
          next.skewMs = skewFrom(context.value.serverNow);
          const todayByBranch = Object.fromEntries(Object.entries(next.contexts).map(([id, ctx]) => [id, ctx.todayKey]));
          next.queue = pruneQueue(doc.queue, todayByBranch);
        }
        if (orders.status === 'fulfilled') next.orders = { ...doc.orders, [branchId]: orders.value };
        if (products.status === 'fulfilled') next.products = { ...doc.products, [branchId]: products.value };
        return next;
      };
      if (get().storageUnavailable) {
        set((state) => docOf(merge(docOf(state))));
      } else {
        await write((doc) => ({ doc: merge(doc), result: undefined }), false).catch(() => undefined);
      }
      if (failures.length === 0) return 'ok';
      return failures.every((failure) => isTransportFailure(failure.reason)) ? 'offline' : 'failed';
    },

    rememberBranches(branches) {
      const current = get().branches;
      const same =
        current.length === branches.length &&
        current.every((branch, i) => branch.id === branches[i].id && branch.name === branches[i].name);
      if (same || !get().loadedFor) return;
      if (get().storageUnavailable) {
        set({ branches });
        return;
      }
      void write((doc) => ({ doc: { ...doc, branches }, result: undefined }), false).catch(() => undefined);
    },

    async completeSale(input, serverLast) {
      if (get().storageUnavailable) throw new Error('This browser is not keeping data');
      // On disk before the caller prints: a token in a customer's hand must never
      // belong to a sale the browser could still lose. Numbered from the stored
      // record, inside the same transaction, so another tab cannot take it too.
      return write((doc) => {
        const tokenNumber = nextTokenNumber(doc.queue, input.branchId, input.dayKey, serverLast);
        const { queue, sale } = recordSale(doc.queue, { ...input, tokenNumber });
        return { doc: { ...doc, queue }, result: sale };
      }, true);
    },

    async voidSale(clientRef) {
      await write((doc) => ({ doc: { ...doc, queue: markVoid(doc.queue, clientRef) }, result: undefined }), true);
    },

    async voidServerOrder(branchId, orderId) {
      const businessId = get().loadedFor;
      if (!businessId) return;
      const updated = await voidCounterOrder(businessId, orderId);
      const swap = (doc: CounterDoc): CounterDoc => ({
        ...doc,
        orders: {
          ...doc.orders,
          [branchId]: (doc.orders[branchId] ?? []).map((order) => (order.id === orderId ? updated : order)),
        },
      });
      if (get().storageUnavailable) set((state) => docOf(swap(docOf(state))));
      else await write((doc) => ({ doc: swap(doc), result: undefined }), false);
    },

    async retry(clientRef) {
      await write((doc) => ({ doc: { ...doc, queue: retrySale(doc.queue, clientRef) }, result: undefined }), true);
    },

    async remove(clientRef) {
      await write((doc) => ({ doc: { ...doc, queue: removeSale(doc.queue, clientRef) }, result: undefined }), true);
    },

    async applyResults(results, serverNow) {
      const skewMs = skewFrom(serverNow);
      await write(
        (doc) => ({ doc: { ...doc, queue: applySyncResults(doc.queue, results), skewMs }, result: undefined }),
        true
      );
    },

    setSyncState(syncState, blockedMessage = null) {
      set({ syncState, blockedMessage });
      const businessId = get().loadedFor;
      // Every tab shows the same pill, though only one is sending.
      if (businessId) broadcast({ type: 'sync-state', businessId, state: syncState, blockedMessage });
    },

    reset() {
      // Memory only. The stored record stays: it holds sales the server may not have.
      loading = null;
      stopListening?.();
      stopListening = null;
      set({
        ...EMPTY,
        loadedFor: null,
        syncState: 'idle',
        blockedMessage: null,
        refreshing: {},
        error: null,
        storageUnavailable: false,
      });
    },
  };
});
