import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_QUEUE, recordSale } from '@shared/utils/counterQueue';
import type { CounterDaySummary } from '@/types/counter';
import type { CounterDoc, CounterMessage } from '@/utils/counterPersistence';

/**
 * The web counter's store (requirement 30): every change is made to the stored
 * record, a sale is numbered from what is really stored, and the record — the
 * shop's money — outlives the store's memory.
 */

const docs = new Map<string, CounterDoc>();
const listeners = new Set<(message: CounterMessage) => void>();
let failNextWrite = false;
let available = true;
const clone = <T,>(value: T): T => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

vi.mock('@/utils/counterPersistence', () => ({
  isAvailable: async () => available,
  readDoc: async (id: string) => clone(docs.get(id) ?? null),
  updateDoc: async (
    id: string,
    change: (doc: CounterDoc | null) => { doc: CounterDoc; result: unknown }
  ) => {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('QuotaExceededError');
    }
    const { doc, result } = change(clone(docs.get(id) ?? null));
    docs.set(id, clone(doc));
    return { doc, result };
  },
  broadcast: vi.fn(),
  onCounterMessage: (listener: (message: CounterMessage) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

const getCounterDaySummary = vi.fn<(b: string, br: string) => Promise<CounterDaySummary>>();
const listCounterOrders = vi.fn(async () => []);
const listBranchProducts = vi.fn(async () => []);
vi.mock('@/api/counter', () => ({
  getCounterDaySummary: (b: string, br: string) => getCounterDaySummary(b, br),
  listCounterOrders: () => listCounterOrders(),
  voidCounterOrder: vi.fn(),
}));
vi.mock('@/api/product', () => ({ listBranchProducts: () => listBranchProducts() }));

const { useCounterStore } = await import('./counterStore');

const sale = (clientRef: string) => ({
  clientRef,
  branchId: 'sg',
  occurredAt: '2026-10-16T06:00:00.000Z',
  dayKey: '2026-10-16',
  paymentMethod: 'CASH' as const,
  lines: [{ productId: 'chai', name: 'Chai', sku: 'CH', unitPrice: 15, quantity: 2 }],
  currency: 'INR',
});

const context = (serverNow: string) =>
  ({ branchId: 'sg', todayKey: '2026-10-16', serverNow, lastTokenNumber: 0 }) as unknown as CounterDaySummary;

describe('counterStore (web)', () => {
  beforeEach(() => {
    docs.clear();
    listeners.clear();
    failNextWrite = false;
    available = true;
    getCounterDaySummary.mockReset();
    useCounterStore.getState().reset();
  });

  it('keeps a sale on disk before it resolves, and numbers it after the server', async () => {
    await useCounterStore.getState().load('b1');
    const taken = await useCounterStore.getState().completeSale(sale('a'), 12);
    expect(taken.tokenNumber).toBe(13);
    expect(docs.get('b1')?.queue.sales.map((s) => s.clientRef)).toEqual(['a']);
  });

  it("numbers a sale after one another tab took, though this tab never saw it", async () => {
    await useCounterStore.getState().load('b1');
    // Tab B wrote token 1 straight to storage.
    docs.set('b1', {
      version: 1,
      queue: recordSale(EMPTY_QUEUE, { ...sale('from-b'), tokenNumber: 1 }).queue,
      contexts: {},
      orders: {},
      products: {},
      branches: [],
      skewMs: 0,
    });
    const taken = await useCounterStore.getState().completeSale(sale('from-a'), 0);
    expect(taken.tokenNumber).toBe(2);
    expect(useCounterStore.getState().queue.sales).toHaveLength(2);
  });

  it('takes no sale when it cannot be saved', async () => {
    await useCounterStore.getState().load('b1');
    failNextWrite = true;
    await expect(useCounterStore.getState().completeSale(sale('a'), 0)).rejects.toThrow();
    expect(useCounterStore.getState().queue.sales).toHaveLength(0);
  });

  it('refuses every sale in a browser that keeps no data', async () => {
    available = false;
    await useCounterStore.getState().load('b1');
    expect(useCounterStore.getState().storageUnavailable).toBe(true);
    await expect(useCounterStore.getState().completeSale(sale('a'), 0)).rejects.toThrow();
  });

  it('forgets the business on reset but leaves its bills stored', async () => {
    await useCounterStore.getState().load('b1');
    await useCounterStore.getState().completeSale(sale('a'), 0);
    useCounterStore.getState().reset();
    expect(useCounterStore.getState().queue.sales).toHaveLength(0);
    expect(docs.get('b1')?.queue.sales).toHaveLength(1);
    await useCounterStore.getState().load('b1');
    expect(useCounterStore.getState().queue.sales).toHaveLength(1);
  });

  it("reads the record again when another tab says it changed", async () => {
    await useCounterStore.getState().load('b1');
    docs.set('b1', {
      version: 1,
      queue: recordSale(EMPTY_QUEUE, { ...sale('elsewhere'), tokenNumber: 4 }).queue,
      contexts: {},
      orders: {},
      products: {},
      branches: [],
      skewMs: 0,
    });
    listeners.forEach((listener) => listener({ type: 'changed', businessId: 'b1' }));
    await vi.waitFor(() => expect(useCounterStore.getState().queue.sales).toHaveLength(1));
  });

  it('keeps the last menu and context when offline, and says offline rather than error', async () => {
    getCounterDaySummary.mockResolvedValueOnce(context(new Date(Date.now() + 60_000).toISOString()));
    await useCounterStore.getState().load('b1');
    expect(await useCounterStore.getState().refreshBranch('sg')).toBe('ok');
    expect(useCounterStore.getState().skewMs).toBeGreaterThan(50_000);

    const offline = new AxiosError('Network Error', 'ERR_NETWORK');
    getCounterDaySummary.mockRejectedValueOnce(offline);
    listCounterOrders.mockRejectedValueOnce(offline);
    listBranchProducts.mockRejectedValueOnce(offline);
    expect(await useCounterStore.getState().refreshBranch('sg')).toBe('offline');
    expect(useCounterStore.getState().contexts.sg).toBeTruthy();
    expect(useCounterStore.getState().error).toBeNull();
  });
});
