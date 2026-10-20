import type {
  CartLine,
  CounterOrder,
  CounterPaymentMethod,
  CounterSaleSyncResult,
  LocalSale,
} from '../types/counter';

/**
 * The counter's sales as the phone holds them — requirements 29 and 30.
 *
 * Pure functions over plain data: no React Native, no storage, no clock of its
 * own (the caller passes the time in). The app keeps the queue in its files and
 * the web counter will keep it in the browser, and both get these same rules —
 * which is also why they are tested under the web's Vitest.
 *
 * The life of a sale: the cashier rings it up (the cart), takes the money, and
 * "Payment done" turns the cart into a `LocalSale` with a token number and a
 * `clientRef`. It is PENDING until the server records it (SYNCED) or refuses it
 * (REJECTED, kept for a person to deal with). A void is the same sale with a new
 * status, and is PENDING again until the server has it.
 */

export interface CounterQueue {
  sales: LocalSale[];
  /** The last token number used on this phone, per `branchId|dayKey`. */
  lastToken: Record<string, number>;
}

export const EMPTY_QUEUE: CounterQueue = { sales: [], lastToken: {} };

/** Rupees to the paise, without a float's tail. */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- The cart ---------------------------------------------------------------

export function lineTotal(line: CartLine): number {
  return money(line.unitPrice * line.quantity);
}

export function cartTotal(lines: CartLine[]): number {
  return money(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}

/** How many things are on the bill — two teas are two items, as a customer counts. */
export function cartItemCount(lines: { quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Tapping a product: one more of it. The same product at the same price is one
 * line; a price changed since it was first tapped starts a new one, so a line
 * never claims a price nobody charged.
 */
export function addToCart(lines: CartLine[], product: Omit<CartLine, 'quantity'>): CartLine[] {
  const index = lines.findIndex(
    (line) => line.productId === product.productId && line.unitPrice === product.unitPrice && line.name === product.name
  );
  if (index === -1) return [...lines, { ...product, quantity: 1 }];
  return lines.map((line, i) => (i === index ? { ...line, quantity: line.quantity + 1 } : line));
}

/** Zero takes the line off, the way a till does. */
export function setCartQuantity(lines: CartLine[], index: number, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((_, i) => i !== index);
  return lines.map((line, i) => (i === index ? { ...line, quantity } : line));
}

// --- Days and tokens ----------------------------------------------------------

/**
 * The branch's date at an instant, from the offset the server reported.
 *
 * The phone has no dependable time-zone database (Hermes's `Intl` is not one),
 * so the server sends the branch's offset from UTC with the day's context and
 * the phone adds it. `skewMs` corrects a phone whose own clock is wrong.
 */
export function branchDayKey(nowMs: number, skewMs: number, utcOffsetMinutes: number): string {
  return new Date(nowMs + skewMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * A day key moved by whole days, for the counter's day cursor.
 *
 * Built at **noon UTC** rather than midnight: `Branch.timezone` is free-form and
 * promises nothing, so a zone that shifts for daylight saving would land a
 * midnight-plus-24-hours on the same date it started from. India has no DST;
 * other places this could run do.
 */
export function shiftDayKey(dayKey: string, delta: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const noon = Date.UTC(year, month - 1, day, 12);
  return new Date(noon + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Never later than the branch's own today.
 *
 * The clamp belongs to the client: the day endpoints check only the *shape* of a
 * date, and a future one returns an empty day rather than an error. Reading the
 * limit off the device's clock would be wrong in exactly the window a shop is
 * busiest — between 18:30 and midnight IST, a machine set to UTC is already on
 * the day before.
 */
export function clampDayKey(dayKey: string, todayKey: string): string {
  return dayKey > todayKey ? todayKey : dayKey;
}

/** The branch's wall-clock time at an instant, for the printed receipt. */
export function branchClock(instantIso: string, utcOffsetMinutes: number) {
  const local = new Date(Date.parse(instantIso) + utcOffsetMinutes * 60_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

function tokenKey(branchId: string, dayKey: string): string {
  return `${branchId}|${dayKey}`;
}

/**
 * The next token for a branch's day: one past the highest number this phone has
 * used, the server has seen, or any sale on the phone carries. On one phone at
 * one counter that never collides; two phones offline together can, and the
 * server renumbers the later one when it syncs.
 */
export function nextTokenNumber(
  queue: CounterQueue,
  branchId: string,
  dayKey: string,
  serverLast: number | null | undefined
): number {
  let highest = Math.max(queue.lastToken[tokenKey(branchId, dayKey)] ?? 0, serverLast ?? 0);
  for (const sale of queue.sales) {
    if (sale.branchId === branchId && sale.dayKey === dayKey) {
      highest = Math.max(highest, sale.tokenNumber, sale.deviceTokenNumber);
    }
  }
  return highest + 1;
}

// --- Recording, voiding, syncing ----------------------------------------------

export interface NewSale {
  clientRef: string;
  branchId: string;
  occurredAt: string;
  dayKey: string;
  tokenNumber: number;
  paymentMethod: CounterPaymentMethod;
  lines: CartLine[];
  currency: string;
}

export function recordSale(queue: CounterQueue, input: NewSale): { queue: CounterQueue; sale: LocalSale } {
  const sale: LocalSale = {
    clientRef: input.clientRef,
    branchId: input.branchId,
    occurredAt: input.occurredAt,
    dayKey: input.dayKey,
    deviceTokenNumber: input.tokenNumber,
    tokenNumber: input.tokenNumber,
    status: 'CLOSED',
    paymentMethod: input.paymentMethod,
    lines: input.lines.map((line) => ({ ...line })),
    total: cartTotal(input.lines),
    currency: input.currency,
    sync: 'PENDING',
    orderId: null,
    renumbered: false,
    rejection: null,
  };
  const key = tokenKey(input.branchId, input.dayKey);
  return {
    sale,
    queue: {
      sales: [...queue.sales, sale],
      lastToken: { ...queue.lastToken, [key]: Math.max(queue.lastToken[key] ?? 0, input.tokenNumber) },
    },
  };
}

function updateSale(queue: CounterQueue, clientRef: string, change: (sale: LocalSale) => LocalSale): CounterQueue {
  return { ...queue, sales: queue.sales.map((sale) => (sale.clientRef === clientRef ? change(sale) : sale)) };
}

/** A void is the same sale with a new status, sent again. */
export function markVoid(queue: CounterQueue, clientRef: string): CounterQueue {
  return updateSale(queue, clientRef, (sale) => ({ ...sale, status: 'VOID', sync: 'PENDING', rejection: null }));
}

/** Send a refused sale again — after somebody reopened its day, say. */
export function retrySale(queue: CounterQueue, clientRef: string): CounterQueue {
  return updateSale(queue, clientRef, (sale) => ({ ...sale, sync: 'PENDING', rejection: null }));
}

/** Take a refused sale off this phone. Only ever after a person has confirmed it. */
export function removeSale(queue: CounterQueue, clientRef: string): CounterQueue {
  return { ...queue, sales: queue.sales.filter((sale) => sale.clientRef !== clientRef) };
}

export function pendingSales(queue: CounterQueue): LocalSale[] {
  return queue.sales.filter((sale) => sale.sync === 'PENDING');
}

export function rejectedSales(queue: CounterQueue): LocalSale[] {
  return queue.sales.filter((sale) => sale.sync === 'REJECTED');
}

/** The shape `POST /counter-sales/sync` takes for one sale. */
export function toSyncPayload(sale: LocalSale) {
  return {
    clientRef: sale.clientRef,
    branchId: sale.branchId,
    occurredAt: sale.occurredAt,
    status: sale.status,
    paymentMethod: sale.paymentMethod,
    deviceTokenNumber: sale.deviceTokenNumber,
    items: sale.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  };
}

/**
 * The next sales to send: oldest first, at most `maxSales`, and small enough
 * to stay well inside the server's JSON body limit.
 */
export function nextBatch(
  pending: LocalSale[],
  { maxSales, maxBytes }: { maxSales: number; maxBytes: number }
): LocalSale[] {
  const batch: LocalSale[] = [];
  let bytes = 2;
  for (const sale of [...pending].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const size = JSON.stringify(toSyncPayload(sale)).length + 1;
    if (batch.length > 0 && (batch.length >= maxSales || bytes + size > maxBytes)) break;
    batch.push(sale);
    bytes += size;
  }
  return batch;
}

/**
 * Fold the server's answers in.
 *
 * Recorded (ACCEPTED, or DUPLICATE — already there) takes the server's token and
 * id. A sale is only marked SYNCED when the server holds the status the phone
 * holds: if it was voided here while the send was in flight, it stays PENDING
 * and the void goes next time. Refused keeps the reason for a person to read.
 */
export function applySyncResults(queue: CounterQueue, results: CounterSaleSyncResult[]): CounterQueue {
  const byRef = new Map(results.filter((result) => result.clientRef).map((result) => [result.clientRef!, result]));
  return {
    ...queue,
    sales: queue.sales.map((sale) => {
      const result = byRef.get(sale.clientRef);
      if (!result || sale.sync !== 'PENDING') return sale;
      if (result.outcome === 'REJECTED') {
        return {
          ...sale,
          sync: 'REJECTED',
          rejection: { code: result.code ?? 'INTERNAL_ERROR', params: result.params ?? {} },
        };
      }
      const serverStatus = result.status === 'VOID' ? 'VOID' : 'CLOSED';
      // A sale voided on the server (from another phone) wins: it cannot be un-voided.
      const status = serverStatus === 'VOID' ? 'VOID' : sale.status;
      return {
        ...sale,
        status,
        sync: status === serverStatus ? 'SYNCED' : 'PENDING',
        orderId: result.orderId ?? sale.orderId,
        tokenNumber: result.tokenNumber ?? sale.tokenNumber,
        renumbered: result.renumbered ?? sale.renumbered,
        rejection: null,
      };
    }),
  };
}

/**
 * Forget what no longer needs remembering: sales the server has, from a day that
 * is over at their branch, and token counters for past days. A sale not yet
 * recorded — or refused — is never dropped, whatever its day.
 */
export function pruneQueue(queue: CounterQueue, todayByBranch: Record<string, string>): CounterQueue {
  const sales = queue.sales.filter((sale) => {
    if (sale.sync !== 'SYNCED') return true;
    const today = todayByBranch[sale.branchId];
    return !today || sale.dayKey >= today;
  });
  const lastToken: Record<string, number> = {};
  for (const [key, value] of Object.entries(queue.lastToken)) {
    const [branchId, dayKey] = key.split('|');
    const today = todayByBranch[branchId];
    if (!today || dayKey >= today) lastToken[key] = value;
  }
  return { sales, lastToken };
}

// --- What the counter shows -----------------------------------------------------

export interface BillLine {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** One bill in the day's list, wherever it currently lives. */
export interface DisplayBill {
  key: string;
  clientRef: string | null;
  orderId: string | null;
  tokenNumber: number;
  /** The number on the printed slip, when the server gave the bill another one. */
  printedNumber: number | null;
  status: 'OPEN' | 'CLOSED' | 'VOID';
  paymentMethod: string;
  total: number;
  itemCount: number;
  /** When it was paid (or opened, for an order from the old flow). */
  at: string;
  /** The server has it as it is shown. */
  synced: boolean;
  rejected: boolean;
  lines: BillLine[];
}

function fromServer(order: CounterOrder): DisplayBill {
  const lines = order.items.map((item) => ({
    name: item.productNameSnapshot,
    sku: null,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
  }));
  return {
    key: order.clientRef ?? order.id,
    clientRef: order.clientRef,
    orderId: order.id,
    tokenNumber: order.tokenNumber,
    printedNumber: order.deviceTokenNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    total: Number(order.totalAmount),
    itemCount: cartItemCount(lines),
    at: order.closedAt ?? order.openedAt,
    synced: true,
    rejected: false,
    lines,
  };
}

/** A sale the phone holds, as the counter's list shows it — and as the receipt prints it. */
export function billOfSale(sale: LocalSale): DisplayBill {
  return {
    key: sale.clientRef,
    clientRef: sale.clientRef,
    orderId: sale.orderId,
    tokenNumber: sale.tokenNumber,
    printedNumber: sale.renumbered ? sale.deviceTokenNumber : null,
    status: sale.status,
    paymentMethod: sale.paymentMethod,
    total: sale.total,
    itemCount: cartItemCount(sale.lines),
    at: sale.occurredAt,
    synced: sale.sync === 'SYNCED',
    rejected: sale.sync === 'REJECTED',
    lines: sale.lines.map((line) => ({
      name: line.name,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: lineTotal(line),
    })),
  };
}

/**
 * The day's bills at a branch: what the server sent, with the phone's own sales
 * laid over it. The phone's copy wins for a sale it holds — it is newer when a
 * void has not reached the server yet, and it knows the product codes the
 * receipt needs. Newest token first.
 */
export function mergeBills(
  serverOrders: CounterOrder[],
  queue: CounterQueue,
  branchId: string,
  dayKey: string
): DisplayBill[] {
  const bills = new Map<string, DisplayBill>();
  for (const order of serverOrders) {
    if (order.branchId === branchId) bills.set(order.clientRef ?? order.id, fromServer(order));
  }
  for (const sale of queue.sales) {
    if (sale.branchId === branchId && sale.dayKey === dayKey) bills.set(sale.clientRef, billOfSale(sale));
  }
  return [...bills.values()].sort((a, b) => b.tokenNumber - a.tokenNumber || b.at.localeCompare(a.at));
}

/**
 * The day's figures the server does not know yet: the phone's sales for the day
 * that are not in the server's list. Added to the server's own totals, so a
 * day's figures are right offline and do not count anything twice once online.
 */
export function unsyncedFigures(
  serverOrders: CounterOrder[],
  queue: CounterQueue,
  branchId: string,
  dayKey: string
): { count: number; total: number } {
  const known = new Set(serverOrders.map((order) => order.clientRef).filter(Boolean));
  let count = 0;
  let total = 0;
  for (const sale of queue.sales) {
    if (sale.branchId !== branchId || sale.dayKey !== dayKey) continue;
    if (sale.status !== 'CLOSED' || sale.sync === 'SYNCED' || known.has(sale.clientRef)) continue;
    count += 1;
    total += sale.total;
  }
  return { count, total: money(total) };
}
