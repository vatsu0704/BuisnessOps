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
  /** The phone's own reference for a sale made on it (requirement 30); null for older orders. */
  clientRef: string | null;
  /** The token the phone printed, when the server had to give the sale a different one. */
  deviceTokenNumber: number | null;
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
  /** The day's money by how it was paid. */
  byPaymentMethod: { paymentMethod: PaymentMethod; orderCount: number; totalAmount: string }[];
  isClosed: boolean;
  closedAt: string | null;
  // The rest is the counter's context, cached on the phone so billing carries on
  // without a connection (requirement 30).
  /** The highest token number the server knows of for the day. */
  lastTokenNumber: number;
  /** The branch's own date today, YYYY-MM-DD. */
  todayKey: string;
  /** How far the branch's clock is ahead of UTC, in minutes. */
  utcOffsetMinutes: number;
  /** The server's clock when this was made, to correct a phone whose clock is wrong. */
  serverNow: string;
  /** Who a customer's UPI payment goes to (requirement 32), or null for cash only. */
  payee: CounterPayee | null;
  /** What prints at the top of every token (requirement 31). */
  receiptHeader: CounterReceiptHeader;
  /** The day's spending at the branch — null for somebody who may not read expenses. */
  expenses: { totalAmount: string; count: number } | null;
}

/** How a counter customer pays (requirement 29). */
export type CounterPaymentMethod = 'CASH' | 'UPI';

export interface CounterPayee {
  upiId: string;
  name: string;
}

export interface CounterReceiptHeader {
  businessName: string;
  branchName: string;
  branchCode: string;
  addressLine: string | null;
  phone: string | null;
}

/** One line of a bill being rung up on the phone. */
export interface CartLine {
  productId: string | null;
  name: string;
  /** Printed instead of a name the receipt printer cannot draw. */
  sku: string | null;
  unitPrice: number;
  quantity: number;
}

/**
 * Where a sale made on the phone has got to: waiting to be sent, recorded by the
 * server, or refused by it and waiting for a person.
 */
export type LocalSaleSync = 'PENDING' | 'SYNCED' | 'REJECTED';

/** A paid sale as the phone holds it (requirement 30). */
export interface LocalSale {
  clientRef: string;
  branchId: string;
  /** When it was paid, by the phone's clock corrected against the server's. */
  occurredAt: string;
  /** The branch's date when it was paid. */
  dayKey: string;
  /** The token the phone printed. */
  deviceTokenNumber: number;
  /** The token to show: the printed one, until the server says otherwise. */
  tokenNumber: number;
  status: 'CLOSED' | 'VOID';
  paymentMethod: CounterPaymentMethod;
  lines: CartLine[];
  total: number;
  currency: string;
  sync: LocalSaleSync;
  orderId: string | null;
  renumbered: boolean;
  rejection: { code: string; params: Record<string, unknown> } | null;
}

/** The server's answer for one sale in a sync. */
export interface CounterSaleSyncResult {
  clientRef: string | null;
  outcome: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  orderId?: string;
  tokenNumber?: number;
  tokenDate?: string;
  status?: CounterOrderStatus;
  totalAmount?: string;
  renumbered?: boolean;
  deviceTokenNumber?: number | null;
  clockAdjusted?: boolean;
  code?: string;
  params?: Record<string, unknown>;
}

export interface CounterSyncResponse {
  serverNow: string;
  results: CounterSaleSyncResult[];
}

/** Where sending the counter's sales stands (requirement 30). */
export type CounterSyncState = 'idle' | 'syncing' | 'offline' | 'blocked';

/** A trading branch the counter can bill at, remembered for an offline start. */
export type CounterBranch = { id: string; name: string; code: string };
