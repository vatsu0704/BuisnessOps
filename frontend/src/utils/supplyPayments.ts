// Pure: shared with the web app (web/ reads it through @shared), so it may import
// nothing but relative paths.
import type { PaymentHistory, SupplyPaymentOrder } from '../types/supply';

/**
 * The rules behind the Payments screen — requirements 26, 27 and 35 — in one
 * place so the app and the web cannot disagree about them.
 */

/** One payment pays one UPI ID: the warehouse's, or one vendor's. */
export function payeeKey(order: SupplyPaymentOrder): string {
  return order.vendorId ?? 'WAREHOUSE';
}

/** The orders one payment can cover: everything owed to one payee. */
export type PayeeSection = {
  key: string;
  payeeName: string;
  isVendor: boolean;
  readyTotal: number;
  readyCount: number;
  currency: string;
  data: SupplyPaymentOrder[];
};

/**
 * What accounts owes, grouped by WHO it is owed to — the warehouse first, then
 * vendors by name, the same order the cart uses. An order still on its way is in
 * its group but not in the ready figures: accounts sees it coming and pays for it
 * once it has arrived, which is Vatsal's rule and the server's.
 */
export function groupByPayee(due: SupplyPaymentOrder[], warehouseName: string): PayeeSection[] {
  const byPayee = new Map<string, PayeeSection>();
  for (const order of due) {
    const key = payeeKey(order);
    const section = byPayee.get(key) ?? {
      key,
      payeeName: order.vendor?.name ?? warehouseName,
      isVendor: !!order.vendor,
      readyTotal: 0,
      readyCount: 0,
      currency: order.currency,
      data: [],
    };
    section.data.push(order);
    if (order.status === 'DELIVERED') {
      section.readyTotal += Number(order.totalAmount);
      section.readyCount += 1;
    }
    byPayee.set(key, section);
  }
  return [...byPayee.values()].sort((a, b) => {
    if (!a.isVendor) return -1;
    if (!b.isVendor) return 1;
    return a.payeeName.localeCompare(b.payeeName);
  });
}

/**
 * Tick or untick one order. Only a delivered order can be ticked, and one
 * payment goes to one payee: ticking somebody else's order starts a new
 * selection rather than building one payment to two people. `selection` is what
 * is ticked and still payable — the orders behind `selected`.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  selection: SupplyPaymentOrder[],
  order: SupplyPaymentOrder
): Set<string> {
  if (order.status !== 'DELIVERED') return new Set(selected);
  const samePayee = selection.length === 0 || payeeKey(selection[0]) === payeeKey(order);
  const next = samePayee ? new Set(selected) : new Set<string>();
  if (next.has(order.id)) next.delete(order.id);
  else next.add(order.id);
  return next;
}

/** Every order in a payee's group that has arrived — "Select all that arrived". */
export function readyIds(section: PayeeSection): Set<string> {
  return new Set(section.data.filter((order) => order.status === 'DELIVERED').map((order) => order.id));
}

type Sum = { amount: number; count: number };

/**
 * A month's payment totals (requirement 35), over the whole month whatever the
 * list was cut to: what accounts paid for company branches, what franchise
 * branches paid (sent counts — it left their hands), and what is still waiting
 * for whoever received it to confirm.
 */
export function historyTotals(totals: PaymentHistory['totals']): { foco: Sum; fm: Sum; waiting: Sum } {
  const sum = (keep: (row: PaymentHistory['totals'][number]) => boolean): Sum =>
    totals
      .filter(keep)
      .reduce((acc, row) => ({ amount: acc.amount + Number(row.totalAmount), count: acc.count + row.orderCount }), {
        amount: 0,
        count: 0,
      });
  return {
    foco: sum((row) => row.operatingModel === 'FOCO' && row.paymentStatus === 'VERIFIED'),
    fm: sum((row) => row.operatingModel === 'FM' && (row.paymentStatus === 'VERIFIED' || row.paymentStatus === 'PAID')),
    waiting: sum((row) => row.paymentStatus === 'PAID'),
  };
}
