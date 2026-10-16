import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUEUE,
  addToCart,
  applySyncResults,
  branchDayKey,
  cartTotal,
  markVoid,
  mergeBills,
  nextBatch,
  nextTokenNumber,
  pendingSales,
  pruneQueue,
  recordSale,
  setCartQuantity,
  unsyncedFigures,
  type CounterQueue,
  type NewSale,
} from '@shared/utils/counterQueue';
import { receiptForBill } from '@shared/utils/counterReceipt';
import type { CartLine, CounterOrder } from '@shared/types/counter';

/**
 * The counter's offline queue (requirement 30). Pure rules shared by the app
 * and — at W12 — the web counter, so they are pinned down here.
 */

const IST = 330;
const chai: Omit<CartLine, 'quantity'> = { productId: 'p-chai', name: 'Chai', sku: 'CH', unitPrice: 15 };

function sale(overrides: Partial<NewSale> = {}): NewSale {
  return {
    clientRef: `ref-${Math.random()}`,
    branchId: 'b1',
    occurredAt: '2026-10-14T06:00:00.000Z',
    dayKey: '2026-10-14',
    tokenNumber: 1,
    paymentMethod: 'UPI',
    lines: [{ ...chai, quantity: 2 }],
    currency: 'INR',
    ...overrides,
  };
}

function record(queue: CounterQueue, overrides: Partial<NewSale> = {}) {
  return recordSale(queue, sale(overrides));
}

function serverOrder(overrides: Partial<CounterOrder> = {}): CounterOrder {
  return {
    id: 'o1',
    businessId: 'biz',
    branchId: 'b1',
    tokenNumber: 1,
    tokenDate: '2026-10-14T00:00:00.000Z',
    status: 'CLOSED',
    totalAmount: '30.00',
    currency: 'INR',
    paymentMethod: 'UPI',
    openedAt: '2026-10-14T06:00:00.000Z',
    closedAt: '2026-10-14T06:00:00.000Z',
    clientRef: null,
    deviceTokenNumber: null,
    items: [],
    ...overrides,
  };
}

describe('the cart', () => {
  it('counts the same product up on one line and takes it off at zero', () => {
    let lines = addToCart([], chai);
    lines = addToCart(lines, chai);
    expect(lines).toEqual([{ ...chai, quantity: 2 }]);
    expect(cartTotal(lines)).toBe(30);
    expect(setCartQuantity(lines, 0, 0)).toEqual([]);
  });

  it('keeps a re-priced product on its own line, so no line claims a price nobody charged', () => {
    const lines = addToCart(addToCart([], chai), { ...chai, unitPrice: 18 });
    expect(lines).toHaveLength(2);
  });

  it('totals to the paise without a float tail', () => {
    expect(cartTotal([{ ...chai, unitPrice: 0.1, quantity: 3 }])).toBe(0.3);
  });
});

describe('days and tokens', () => {
  it('puts 00:20 in Kolkata on the Kolkata day, not the UTC one', () => {
    expect(branchDayKey(Date.parse('2026-10-13T18:50:00Z'), 0, IST)).toBe('2026-10-14');
  });

  it('corrects a phone whose clock is wrong', () => {
    const fiveHoursSlow = 5 * 60 * 60 * 1000;
    expect(branchDayKey(Date.parse('2026-10-13T14:00:00Z'), fiveHoursSlow, IST)).toBe('2026-10-14');
  });

  it('continues from the highest number the phone or the server knows', () => {
    let { queue } = record(EMPTY_QUEUE, { tokenNumber: 4 });
    expect(nextTokenNumber(queue, 'b1', '2026-10-14', 2)).toBe(5);
    expect(nextTokenNumber(queue, 'b1', '2026-10-14', 9)).toBe(10);
    expect(nextTokenNumber(queue, 'b1', '2026-10-15', 0)).toBe(1);
    ({ queue } = record(queue, { branchId: 'b2', tokenNumber: 30 }));
    expect(nextTokenNumber(queue, 'b1', '2026-10-14', 0)).toBe(5);
  });
});

describe('syncing', () => {
  it('marks a recorded sale synced with the server’s token', () => {
    const { queue, sale: made } = record(EMPTY_QUEUE, { tokenNumber: 3 });
    const next = applySyncResults(queue, [
      { clientRef: made.clientRef, outcome: 'ACCEPTED', orderId: 'o9', tokenNumber: 4, status: 'CLOSED', renumbered: true },
    ]);
    expect(next.sales[0]).toMatchObject({ sync: 'SYNCED', orderId: 'o9', tokenNumber: 4, deviceTokenNumber: 3, renumbered: true });
    expect(pendingSales(next)).toHaveLength(0);
  });

  it('keeps a sale voided while it was being sent pending, so the void goes next', () => {
    const { queue, sale: made } = record(EMPTY_QUEUE);
    const voided = markVoid(queue, made.clientRef);
    const next = applySyncResults(voided, [
      { clientRef: made.clientRef, outcome: 'ACCEPTED', orderId: 'o1', tokenNumber: 1, status: 'CLOSED' },
    ]);
    expect(next.sales[0]).toMatchObject({ status: 'VOID', sync: 'PENDING', orderId: 'o1' });
  });

  it('accepts a void the server already has from another phone', () => {
    const { queue, sale: made } = record(EMPTY_QUEUE);
    const next = applySyncResults(queue, [
      { clientRef: made.clientRef, outcome: 'DUPLICATE', orderId: 'o1', tokenNumber: 1, status: 'VOID' },
    ]);
    expect(next.sales[0]).toMatchObject({ status: 'VOID', sync: 'SYNCED' });
  });

  it('keeps a refused sale, with the reason, out of the next send', () => {
    const { queue, sale: made } = record(EMPTY_QUEUE);
    const next = applySyncResults(queue, [
      { clientRef: made.clientRef, outcome: 'REJECTED', code: 'COUNTER_ORDER_DAY_CLOSED', params: {} },
    ]);
    expect(next.sales[0]).toMatchObject({ sync: 'REJECTED', rejection: { code: 'COUNTER_ORDER_DAY_CLOSED' } });
    expect(pendingSales(next)).toHaveLength(0);
  });

  it('sends the oldest first, within the count and the size', () => {
    let queue = EMPTY_QUEUE;
    for (let i = 0; i < 5; i += 1) {
      ({ queue } = record(queue, { occurredAt: `2026-10-14T0${5 - i}:00:00.000Z`, tokenNumber: i + 1 }));
    }
    const batch = nextBatch(pendingSales(queue), { maxSales: 3, maxBytes: 60_000 });
    expect(batch.map((s) => s.occurredAt)).toEqual([
      '2026-10-14T01:00:00.000Z',
      '2026-10-14T02:00:00.000Z',
      '2026-10-14T03:00:00.000Z',
    ]);
    expect(nextBatch(pendingSales(queue), { maxSales: 20, maxBytes: 10 })).toHaveLength(1);
  });

  it('forgets synced sales from a finished day, never unsent ones', () => {
    let queue = EMPTY_QUEUE;
    let old;
    ({ queue, sale: old } = record(queue, { dayKey: '2026-10-13', tokenNumber: 8 }));
    queue = applySyncResults(queue, [{ clientRef: old.clientRef, outcome: 'ACCEPTED', status: 'CLOSED', tokenNumber: 8 }]);
    ({ queue } = record(queue, { dayKey: '2026-10-12', tokenNumber: 2 }));
    const pruned = pruneQueue(queue, { b1: '2026-10-14' });
    expect(pruned.sales.map((s) => s.dayKey)).toEqual(['2026-10-12']);
    expect(Object.keys(pruned.lastToken)).toEqual([]);
  });
});

describe('what the counter shows', () => {
  it('lays the phone’s copy over the server’s, newest token first', () => {
    const { queue, sale: made } = record(EMPTY_QUEUE, { tokenNumber: 2 });
    const voided = markVoid(queue, made.clientRef);
    const bills = mergeBills(
      [serverOrder({ id: 'o1', tokenNumber: 1 }), serverOrder({ id: 'o2', tokenNumber: 2, clientRef: made.clientRef })],
      voided,
      'b1',
      '2026-10-14'
    );
    expect(bills.map((bill) => [bill.tokenNumber, bill.status, bill.synced])).toEqual([
      [2, 'VOID', false],
      [1, 'CLOSED', true],
    ]);
  });

  it('adds only what the server does not know yet to the day’s figures', () => {
    let queue = EMPTY_QUEUE;
    let known;
    ({ queue, sale: known } = record(queue, { tokenNumber: 1 }));
    ({ queue } = record(queue, { tokenNumber: 2 }));
    ({ queue } = record(queue, { tokenNumber: 3, dayKey: '2026-10-13' }));
    const figures = unsyncedFigures([serverOrder({ clientRef: known.clientRef })], queue, 'b1', '2026-10-14');
    expect(figures).toEqual({ count: 1, total: 30 });
  });

  it('prints the number on the customer’s slip and the branch’s own time', () => {
    const bills = mergeBills(
      [serverOrder({ tokenNumber: 9, deviceTokenNumber: 7, closedAt: '2026-10-14T06:05:00.000Z' })],
      EMPTY_QUEUE,
      'b1',
      '2026-10-14'
    );
    const receipt = receiptForBill(bills[0], {
      header: { businessName: 'Tea', branchName: 'A', branchCode: 'A', addressLine: null, phone: null },
      utcOffsetMinutes: IST,
      currency: 'INR',
      paperWidth: 58,
      copy: true,
    });
    expect(receipt).toMatchObject({ tokenNumber: 7, copy: true, columns: 32, paymentMethod: 'UPI' });
    expect(receipt.at).toEqual({ year: 2026, month: 10, day: 14, hour: 11, minute: 35 });
  });
});
