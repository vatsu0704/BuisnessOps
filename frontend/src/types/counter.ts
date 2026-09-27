/**
 * Mirrors the backend `PaymentMethod` enum.
 *
 * `UNSPECIFIED` is the default and carries meaning: requirement 1's counter has
 * no payment step, so "we did not ask" has to be sayable. Writing `OTHER`
 * instead would put a permanent lie into the cash-vs-digital mix metric.
 */
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'WALLET' | 'OTHER' | 'MIXED' | 'UNSPECIFIED';

export type CounterOrderStatus = 'OPEN' | 'CLOSED' | 'VOID';

export interface CounterOrderItem {
  id: string;
  productId: string | null;
  /** Snapshotted when rung up — a later rename must not rewrite this receipt. */
  productNameSnapshot: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  createdAt: string;
}

export interface CounterOrder {
  id: string;
  businessId: string;
  branchId: string;
  /** What the customer is called by. Unique per branch per day. */
  tokenNumber: number;
  tokenDate: string;
  status: CounterOrderStatus;
  totalAmount: string;
  currency: string;
  paymentMethod: PaymentMethod;
  openedAt: string;
  closedAt: string | null;
  items: CounterOrderItem[];
}

/** The day's running totals — requirement 1's "the money keeps counting". */
export interface CounterDaySummary {
  branchId: string;
  date: string;
  currency: string;
  orderCount: number;
  openCount: number;
  /** Counted separately rather than silently omitted: voids are information. */
  voidCount: number;
  itemCount: number;
  totalAmount: string;
  isClosed: boolean;
  closedAt: string | null;
}
