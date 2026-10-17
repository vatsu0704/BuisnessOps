import type { CounterBranch, CounterDaySummary, CounterOrder, CounterSyncState } from '@/types/counter';
import type { BranchProduct } from '@/types/product';
import type { CounterQueue } from '@shared/utils/counterQueue';

/**
 * Where the web counter keeps its bills (requirement 30) — the browser's
 * IndexedDB, the web's version of the app's `utils/textStore.ts` files.
 *
 * Not localStorage, for the reasons that matter to money:
 *
 * - **Saved before printed.** A write here resolves only once the transaction
 *   has committed (`durability: 'strict'` for a sale), so the token is printed
 *   for a bill that is on disk. localStorage returns before its write reaches the
 *   disk, and a crash or a power cut can lose it.
 * - **A full disk refuses rather than pretends.** The transaction aborts and the
 *   sale is not taken; localStorage's quota error is easy to swallow.
 * - **Two tabs cannot issue the same token.** Every change reads the stored
 *   record, changes it and writes it in one read-write transaction, and the
 *   browser runs those one after another across tabs — so the token is chosen
 *   inside the transaction from what is really stored, never from a tab's own
 *   stale copy (`update`).
 *
 * One record per business, in the app's own persisted shape. Other tabs hear of
 * a change on a BroadcastChannel and read it again.
 */

export type CounterDoc = {
  version: 1;
  queue: CounterQueue;
  contexts: Record<string, CounterDaySummary>;
  orders: Record<string, CounterOrder[]>;
  products: Record<string, BranchProduct[]>;
  branches: CounterBranch[];
  /** How far this computer's clock is behind the server's, in ms (server − here). */
  skewMs: number;
};

/** What one tab tells the others. */
export type CounterMessage =
  | { type: 'changed'; businessId: string }
  | { type: 'sync-state'; businessId: string; state: CounterSyncState; blockedMessage: string | null };

const DB_NAME = 'hisabkitab';
const DB_VERSION = 1;
const STORE = 'counter';
const CHANNEL = 'hisabkitab-counter';

let opening: Promise<IDBDatabase> | null = null;
let persistAsked = false;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer copy of the app opened in another tab wants to upgrade: step aside.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB would not open'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  }).catch((err) => {
    opening = null;
    throw err;
  });
  return opening;
}

/**
 * Ask the browser not to clear this site's storage when the disk runs low — once.
 * Chrome grants it to an installed or much-used site; asking costs nothing.
 */
function askToPersist() {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** Whether bills can be kept in this browser at all — some private windows refuse. */
export async function isAvailable(): Promise<boolean> {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

export async function readDoc(businessId: string): Promise<CounterDoc | null> {
  const db = await openDb();
  return new Promise<CounterDoc | null>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(businessId);
    request.onsuccess = () => resolve((request.result as CounterDoc | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read, change and write one business's record in a single transaction, and
 * resolve once it has committed. `change` must be synchronous — IndexedDB
 * commits a transaction as soon as nothing is pending on it — which the shared
 * queue rules already are.
 */
export async function updateDoc<T>(
  businessId: string,
  change: (current: CounterDoc | null) => { doc: CounterDoc; result: T },
  { durable }: { durable: boolean }
): Promise<{ doc: CounterDoc; result: T }> {
  const db = await openDb();
  askToPersist();
  const outcome = await new Promise<{ doc: CounterDoc; result: T }>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite', { durability: durable ? 'strict' : 'relaxed' });
    const store = tx.objectStore(STORE);
    let changed: { doc: CounterDoc; result: T } | null = null;
    const read = store.get(businessId);
    read.onsuccess = () => {
      try {
        changed = change((read.result as CounterDoc | undefined) ?? null);
        store.put(changed.doc, businessId);
      } catch (err) {
        tx.abort();
        reject(err);
      }
    };
    tx.oncomplete = () => (changed ? resolve(changed) : reject(new Error('Nothing was written')));
    tx.onerror = () => reject(tx.error ?? new Error('The write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('The write was abandoned'));
  });
  broadcast({ type: 'changed', businessId });
  return outcome;
}

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  }
  return channel;
}

/** Tell the other tabs. A browser without BroadcastChannel re-reads on focus instead. */
export function broadcast(message: CounterMessage) {
  getChannel()?.postMessage(message);
}

/** Hear the other tabs. Returns the way to stop listening. */
export function onCounterMessage(listener: (message: CounterMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => undefined;
  const handler = (event: MessageEvent<CounterMessage>) => listener(event.data);
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
