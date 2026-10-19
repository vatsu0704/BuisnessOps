import { describe, expect, it } from 'vitest';
import { groupByPayee, historyTotals, payeeKey, readyIds, toggleSelection } from '@shared/utils/supplyPayments';
import type { PaymentHistory, SupplyPaymentOrder } from '@/types/supply';

/**
 * The Payments rules both apps read (`frontend/src/utils/supplyPayments.ts`):
 * who an order's money goes to, the one-payee-per-payment selection, and the
 * month's history totals.
 */

const vendor = (id: string, name: string) => ({ id, name, phone: null, upiId: null, upiName: null, isActive: true });

function order(id: string, status: SupplyPaymentOrder['status'], total: string, vendorName: string | null = null) {
  return {
    id,
    status,
    totalAmount: total,
    currency: 'INR',
    vendorId: vendorName ? `v-${vendorName}` : null,
    vendor: vendorName ? vendor(`v-${vendorName}`, vendorName) : null,
  } as SupplyPaymentOrder;
}

describe('groupByPayee', () => {
  it('puts the warehouse first and vendors by name, counting only what has arrived as ready', () => {
    const sections = groupByPayee(
      [
        order('a', 'DELIVERED', '1000.00', 'Zen Ice'),
        order('b', 'DISPATCHED', '500.00'),
        order('c', 'DELIVERED', '1200.50'),
        order('d', 'DELIVERED', '300.00', 'Amul'),
      ],
      'From the warehouse'
    );
    expect(sections.map((s) => s.payeeName)).toEqual(['From the warehouse', 'Amul', 'Zen Ice']);
    expect(sections[0]).toMatchObject({ readyCount: 1, readyTotal: 1200.5, isVendor: false });
    expect(sections[0].data.map((o) => o.id)).toEqual(['b', 'c']);
    expect(readyIds(sections[0])).toEqual(new Set(['c']));
  });

  it('keys an order by its payee', () => {
    expect(payeeKey(order('a', 'DELIVERED', '1', 'Amul'))).toBe('v-Amul');
    expect(payeeKey(order('b', 'DELIVERED', '1'))).toBe('WAREHOUSE');
  });
});

describe('toggleSelection', () => {
  const warehouseA = order('a', 'DELIVERED', '100');
  const warehouseB = order('b', 'DELIVERED', '200');
  const onTheWay = order('c', 'DISPATCHED', '50');
  const amul = order('d', 'DELIVERED', '75', 'Amul');

  it('ticks and unticks an order that has arrived', () => {
    const one = toggleSelection(new Set(), [], warehouseA);
    expect(one).toEqual(new Set(['a']));
    const two = toggleSelection(one, [warehouseA], warehouseB);
    expect(two).toEqual(new Set(['a', 'b']));
    expect(toggleSelection(two, [warehouseA, warehouseB], warehouseA)).toEqual(new Set(['b']));
  });

  it('never ticks one still on its way', () => {
    expect(toggleSelection(new Set(['a']), [warehouseA], onTheWay)).toEqual(new Set(['a']));
  });

  it('starts over when the order is owed to somebody else — one payment, one payee', () => {
    expect(toggleSelection(new Set(['a', 'b']), [warehouseA, warehouseB], amul)).toEqual(new Set(['d']));
  });
});

describe('historyTotals', () => {
  const row = (
    operatingModel: 'FOCO' | 'FM',
    paymentStatus: PaymentHistory['totals'][number]['paymentStatus'],
    orderCount: number,
    totalAmount: string
  ) => ({ operatingModel, paymentStatus, orderCount, totalAmount });

  it('counts what accounts paid, what franchise branches sent, and what still waits to be confirmed', () => {
    const totals = historyTotals([
      row('FOCO', 'VERIFIED', 3, '9000.00'),
      row('FOCO', 'PENDING', 2, '400.00'),
      row('FM', 'VERIFIED', 1, '1500.00'),
      row('FM', 'PAID', 2, '2500.00'),
      row('FM', 'FAILED', 1, '700.00'),
    ]);
    expect(totals.foco).toEqual({ amount: 9000, count: 3 });
    expect(totals.fm).toEqual({ amount: 4000, count: 3 });
    expect(totals.waiting).toEqual({ amount: 2500, count: 2 });
  });
});
