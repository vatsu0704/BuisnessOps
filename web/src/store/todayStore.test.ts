import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodaySummary } from '@/types/today';

const getToday = vi.fn<(businessId: string) => Promise<TodaySummary>>();
vi.mock('@/api/today', () => ({ getToday: (id: string) => getToday(id) }));

const { useTodayStore } = await import('./todayStore');

const summary = (sales: string) =>
  ({
    currency: 'INR',
    mixedCurrency: false,
    branches: [],
    totals: { sales, saleCount: 1, expenses: null, expenseCount: null },
    recentBills: null,
  }) as TodaySummary;

/** A promise the test settles by hand, to hold a request in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('todayStore', () => {
  beforeEach(() => {
    getToday.mockReset();
    useTodayStore.getState().reset();
  });

  it('asks once when Home and its tiles load the same business together', async () => {
    getToday.mockResolvedValue(summary('100.00'));
    await Promise.all([useTodayStore.getState().load('b1'), useTodayStore.getState().load('b1')]);
    expect(getToday).toHaveBeenCalledTimes(1);
    expect(useTodayStore.getState().loadedFor).toBe('b1');
  });

  it('always asks again on a later load, because today moves on its own', async () => {
    getToday.mockResolvedValueOnce(summary('100.00')).mockResolvedValueOnce(summary('250.00'));
    await useTodayStore.getState().load('b1');
    await useTodayStore.getState().load('b1');
    expect(getToday).toHaveBeenCalledTimes(2);
    expect(useTodayStore.getState().today?.totals.sales).toBe('250.00');
  });

  it('keeps the figures it had when a refresh fails, and says why', async () => {
    getToday.mockResolvedValueOnce(summary('100.00'));
    await useTodayStore.getState().load('b1');
    getToday.mockRejectedValueOnce(new Error('offline'));
    await useTodayStore.getState().refresh();
    expect(useTodayStore.getState().today?.totals.sales).toBe('100.00');
    expect(useTodayStore.getState().error).toBeTruthy();
  });

  it("never files one business's answer under another switched to meanwhile", async () => {
    const first = deferred<TodaySummary>();
    getToday.mockReturnValueOnce(first.promise).mockResolvedValueOnce(summary('900.00'));
    const slow = useTodayStore.getState().load('b1');
    await useTodayStore.getState().load('b2');
    first.resolve(summary('100.00'));
    await slow;
    expect(useTodayStore.getState().loadedFor).toBe('b2');
    expect(useTodayStore.getState().today?.totals.sales).toBe('900.00');
  });

  it('forgets everything on reset, as a sign-out needs', async () => {
    getToday.mockResolvedValueOnce(summary('100.00'));
    await useTodayStore.getState().load('b1');
    useTodayStore.getState().reset();
    expect(useTodayStore.getState().today).toBeNull();
    expect(useTodayStore.getState().loadedFor).toBeNull();
  });
});
