import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_QUEUE, applySyncResults, recordSale, type CounterQueue } from '@shared/utils/counterQueue';
import { createCounterSyncRunner, type CounterSyncDeps, type SyncFailure } from '@shared/utils/counterSyncRunner';
import type { CounterSaleSyncResult, CounterSyncState } from '@shared/types/counter';

/**
 * The counter's sender (requirement 30) — the shared rules both apps run: one
 * drain at a time, the back-off, and what each refusal means.
 */

function queueOf(count: number, branchId = 'sg'): CounterQueue {
  let queue = EMPTY_QUEUE;
  for (let i = 1; i <= count; i += 1) {
    queue = recordSale(queue, {
      clientRef: `ref-${i}`,
      branchId,
      occurredAt: `2026-10-16T06:${String(i % 60).padStart(2, '0')}:00.000Z`,
      dayKey: '2026-10-16',
      tokenNumber: i,
      paymentMethod: 'CASH',
      lines: [{ productId: 'chai', name: 'Chai', sku: 'CH', unitPrice: 15, quantity: 1 }],
      currency: 'INR',
    }).queue;
  }
  return queue;
}

/** A fake counter: its queue, the states it was told, and a send the test controls. */
function harness(count: number, overrides: Partial<CounterSyncDeps> = {}) {
  const store = { businessId: 'b1' as string | null, queue: queueOf(count) };
  const states: CounterSyncState[] = [];
  const blocked: (string | null | undefined)[] = [];
  const batches: number[] = [];
  const refreshed: string[][] = [];
  const accept = (sales: { clientRef: string }[]): CounterSaleSyncResult[] =>
    sales.map((sale, i) => ({ clientRef: sale.clientRef, outcome: 'ACCEPTED', orderId: `o-${sale.clientRef}`, tokenNumber: i + 1, status: 'CLOSED' }));
  const send = vi.fn(async (_businessId: string, sales: { clientRef: string }[]) => {
    batches.push(sales.length);
    return { serverNow: '2026-10-16T06:30:00.000Z', results: accept(sales) };
  });
  const deps: CounterSyncDeps = {
    getState: () => store,
    send,
    classify: (error) => error as SyncFailure,
    applyResults: async (results) => {
      store.queue = applySyncResults(store.queue, results);
    },
    setSyncState: (state, message) => {
      states.push(state);
      blocked.push(message);
    },
    refreshBranches: async (ids) => {
      refreshed.push(ids);
    },
    ...overrides,
  };
  return { store, states, blocked, batches, refreshed, send, runner: createCounterSyncRunner(deps) };
}

/** Let the runner's awaited steps run, without moving any timer. */
async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

const offline: SyncFailure = { transport: true, status: null, message: 'offline' };
const status = (code: number, message = `refused ${code}`): SyncFailure => ({ transport: false, status: code, message });

describe('counterSyncRunner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends oldest first in batches of 20, then says idle and refreshes each branch once', async () => {
    const h = harness(45);
    await h.runner.kick();
    expect(h.batches).toEqual([20, 20, 5]);
    expect(h.states.at(-1)).toBe('idle');
    expect(h.refreshed).toEqual([['sg']]);
    expect(h.store.queue.sales.every((sale) => sale.sync === 'SYNCED')).toBe(true);
  });

  it('backs off 5s, 15s, 30s, 1 min, then every 5 min while there is no connection', async () => {
    const h = harness(1);
    h.send.mockRejectedValue(offline);
    await h.runner.kick();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.states.at(-1)).toBe('offline');
    for (const [delay, calls] of [
      [5_000, 2],
      [15_000, 3],
      [30_000, 4],
      [60_000, 5],
      [300_000, 6],
      [300_000, 7],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(h.send).toHaveBeenCalledTimes(calls - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.send).toHaveBeenCalledTimes(calls);
    }
  });

  it('starts the back-off over once a send gets through', async () => {
    const h = harness(1);
    h.send.mockRejectedValueOnce(offline).mockRejectedValueOnce(offline);
    await h.runner.kick();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.states.at(-1)).toBe('idle');
    h.store.queue = queueOf(2);
    h.send.mockRejectedValueOnce(offline);
    await h.runner.kick();
    // The first wait again, not the third.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.states.at(-1)).toBe('idle');
  });

  it('halves the refused batch on 413, and treats a 413 at one sale as the server being unwell', async () => {
    const h = harness(20);
    h.send.mockImplementation(async (_b, sales) => {
      h.batches.push(sales.length);
      if (sales.length > 5) throw status(413);
      return {
        serverNow: '2026-10-16T06:30:00.000Z',
        results: sales.map((sale: { clientRef: string }) => ({ clientRef: sale.clientRef, outcome: 'ACCEPTED' as const, status: 'CLOSED' as const })),
      };
    });
    await h.runner.kick();
    expect(h.batches.slice(0, 3)).toEqual([20, 10, 5]);
    expect(h.states.at(-1)).toBe('idle');

    // A small batch is halved from its own size, not from the ceiling of 20.
    const three = harness(3);
    three.send.mockImplementation(async (_b, sales) => {
      three.batches.push(sales.length);
      throw status(413);
    });
    await three.runner.kick();
    expect(three.batches).toEqual([3, 1]);

    const one = harness(1);
    one.send.mockRejectedValue(status(413));
    await one.runner.kick();
    expect(one.send).toHaveBeenCalledTimes(1);
    expect(one.states.at(-1)).toBe('offline');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(one.send).toHaveBeenCalledTimes(2);
  });

  it('stops on 402 and 403 with the reason, and sets no timer', async () => {
    for (const code of [402, 403]) {
      const h = harness(1);
      h.send.mockRejectedValue(status(code, 'Your plan has ended'));
      await h.runner.kick();
      expect(h.states.at(-1)).toBe('blocked');
      expect(h.blocked.at(-1)).toBe('Your plan has ended');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(h.send).toHaveBeenCalledTimes(1);
    }
  });

  it('says nothing and sets no timer on 401, and tries later on a 500', async () => {
    const signedOut = harness(1);
    signedOut.send.mockRejectedValue(status(401));
    await signedOut.runner.kick();
    expect(signedOut.states).toEqual(['syncing']);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(signedOut.send).toHaveBeenCalledTimes(1);

    const unwell = harness(1);
    unwell.send.mockRejectedValueOnce(status(500));
    await unwell.runner.kick();
    expect(unwell.states.at(-1)).toBe('offline');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(unwell.states.at(-1)).toBe('idle');
  });

  it('runs one drain at a time, and looks once more for a sale made during it', async () => {
    const h = harness(1);
    let release!: () => void;
    h.send.mockImplementationOnce(async (_b, sales) => {
      await new Promise<void>((resolve) => (release = resolve));
      h.batches.push(sales.length);
      return { serverNow: '2026-10-16T06:30:00.000Z', results: sales.map((s: { clientRef: string }) => ({ clientRef: s.clientRef, outcome: 'ACCEPTED' as const, status: 'CLOSED' as const })) };
    });
    const first = h.runner.kick();
    await flush();
    // A sale arrives while the first send is out, and somebody kicks again.
    h.store.queue = recordSale(h.store.queue, {
      clientRef: 'late',
      branchId: 'sg',
      occurredAt: '2026-10-16T07:00:00.000Z',
      dayKey: '2026-10-16',
      tokenNumber: 9,
      paymentMethod: 'UPI',
      lines: [{ productId: 'chai', name: 'Chai', sku: 'CH', unitPrice: 15, quantity: 1 }],
      currency: 'INR',
    }).queue;
    const second = h.runner.kick();
    expect(second).toBe(first);
    release();
    await first;
    expect(h.store.queue.sales.find((sale) => sale.clientRef === 'late')?.sync).toBe('SYNCED');
  });

  it('applies nothing when the business changed while a send was out', async () => {
    const h = harness(1);
    h.send.mockImplementationOnce(async (_b, sales) => {
      h.store.businessId = 'b2';
      return { serverNow: '2026-10-16T06:30:00.000Z', results: sales.map((s: { clientRef: string }) => ({ clientRef: s.clientRef, outcome: 'ACCEPTED' as const })) };
    });
    await h.runner.kick();
    expect(h.store.queue.sales[0].sync).toBe('PENDING');
  });

  it('never spins on a sale the server refused', async () => {
    const h = harness(1);
    h.send.mockResolvedValue({
      serverNow: '2026-10-16T06:30:00.000Z',
      results: [{ clientRef: 'ref-1', outcome: 'REJECTED', code: 'COUNTER_ORDER_DAY_CLOSED', params: {} }],
    });
    await h.runner.kick();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.store.queue.sales[0].sync).toBe('REJECTED');
    expect(h.states.at(-1)).toBe('idle');
  });

  it('leaves the sending to another copy that holds the lock, and tries again later', async () => {
    let busy = true;
    const h = harness(1, {
      exclusive: async (_businessId, drain) => {
        if (busy) return 'busy';
        await drain();
        return 'ran';
      },
    });
    await h.runner.kick();
    expect(h.send).not.toHaveBeenCalled();
    busy = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('stops its timer on stop()', async () => {
    const h = harness(1);
    h.send.mockRejectedValue(offline);
    await h.runner.kick();
    h.runner.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});
