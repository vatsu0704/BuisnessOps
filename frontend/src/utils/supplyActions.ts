// Pure: shared with the web app (web/ reads it through @shared), so it may import
// nothing but relative paths. Each app draws the buttons; this decides which.
import type { SupplyDelayReason, SupplyOrder, SupplyOrderStatus } from '../types/supply';

/**
 * What one supply order offers this person — the rules behind the order
 * screen's buttons, in one place so the app and the web cannot disagree about
 * them.
 *
 * Every action comes from a capability, so a button that renders is a button
 * whose request will succeed; the status machine on the server is what actually
 * decides, and this only avoids showing a move that cannot be made.
 *
 * ## A vendor's order (requirement 25)
 *
 * Runs on its own, shorter status machine — nothing is packed or dispatched,
 * because a vendor's goods never pass through the warehouse. For a
 * company-operated branch the desk sends it on to the vendor; for a franchise
 * the branch does. Either way the BRANCH says when it arrived, since nobody of
 * ours carried it.
 *
 * ## Money (requirements 22, 24 and 26)
 *
 * - The agent at the counter takes a pay-on-delivery order's money as cash, or
 *   shows the warehouse's UPI QR for the cashier to scan.
 * - A franchise branch pays when a payment did not arrive, or when it received
 *   a vendor's goods without paying them yet.
 * - The warehouse — the desk, or accounts — says whether a payment arrived.
 * - A company-operated branch's order shows none of this: accounts pays it.
 */

/** What this person may do to supply orders, from the capability matrix. */
export type SupplyCapabilities = {
  /** `supplyOrder:fulfil` — the desk: accept, pack, dispatch, reject, forward to a vendor. */
  fulfil: boolean;
  /** `supplyOrder:deliver` — carry it and mark it delivered. */
  deliver: boolean;
  /** `supplyOrder:delay` — post "+30 minutes, traffic". */
  delay: boolean;
  /** `supplyOrder:create` — the branch: cancel before it is accepted, pay. */
  order: boolean;
  /** `supplyOrder:receive` — say a vendor's goods arrived. */
  receive: boolean;
  /** `supplyPayment:verify` — say whether a payment reached the warehouse. */
  verify: boolean;
};

/**
 * The single next step. Pairs that share a label differ in what pressing it
 * does: `deliver` and `receive` happen at once, while `collect` and `receiveAsk`
 * first ask about money that is still owed on arrival.
 */
export type SupplyPrimaryAction =
  /** Opens the "when will it be ready?" question. */
  | 'accept'
  | 'pack'
  /** Opens the agent picker: dispatch names who is taking it. */
  | 'dispatch'
  | 'deliver'
  /** Mark delivered, asking first how the pay-on-delivery money was taken. */
  | 'collect'
  /** A company-operated branch's vendor order, forwarded by the desk. */
  | 'sendToVendor'
  | 'receive'
  /** Received, asking first whether the vendor's own person was paid. */
  | 'receiveAsk'
  /** Opens the QR to pay for it after it was placed. */
  | 'pay';

export interface SupplyOrderActions {
  /** Null is a real state — a delivered order, or a cashier looking at one being packed. */
  primary: SupplyPrimaryAction | null;
  delay: boolean;
  reject: boolean;
  /** Change who is carrying it, separately from dispatching. */
  reassign: boolean;
  cancel: boolean;
  /** "Received" — a payment came to the warehouse. */
  verify: boolean;
  /** "Not received", beside it — only for a payment claimed, not one already marked not received. */
  verifyFailed: boolean;
  /** Send the order to the vendor on WhatsApp. */
  whatsapp: boolean;
}

/** Why something is late — the order the reasons are offered in. */
export const DELAY_REASONS: readonly SupplyDelayReason[] = [
  'TRAFFIC',
  'STOCK_OUT',
  'VEHICLE_ISSUE',
  'WEATHER',
  'STAFF_SHORTAGE',
  'OTHER',
];

/** Quick promises, so accepting does not need a date picker to say "an hour". */
export const PROMISE_CHOICES: readonly number[] = [30, 60, 120];

/** Stages at which the desk may still change who is carrying it. */
const ASSIGNABLE: SupplyOrderStatus[] = ['ACCEPTED', 'PACKED', 'DISPATCHED'];
const DELAYABLE: SupplyOrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED'];
/** A vendor's order before the branch has said it arrived. */
const VENDOR_OPEN: SupplyOrderStatus[] = ['PLACED', 'ACCEPTED'];

/**
 * Money the branch still owes on arrival. Mirrors the server's rule rather than
 * guessing at it: an ONLINE order, a COD one already paid, or one accounts pays
 * for has nothing left to hand over.
 */
export function cashOutstanding(order: SupplyOrder): boolean {
  return order.paymentMode === 'COD' && order.paymentStatus === 'PENDING';
}

export function supplyOrderActions(order: SupplyOrder, can: SupplyCapabilities): SupplyOrderActions {
  const fromVendor = !!order.vendorId;
  const owed = cashOutstanding(order);

  // A franchise branch paying for its own order after placing it: the warehouse
  // said a payment never arrived, or a vendor's goods came and were not paid for
  // then. Pay-on-delivery to the warehouse is NOT offered early — that money is
  // taken by the agent at the counter.
  const payable =
    can.order &&
    order.paymentMode !== 'ACCOUNTS' &&
    order.status !== 'DRAFT' &&
    order.status !== 'CANCELLED' &&
    (order.paymentStatus === 'FAILED' ||
      (fromVendor && order.paymentStatus === 'PENDING' && order.status === 'DELIVERED'));
  const pay: SupplyPrimaryAction | null = payable ? 'pay' : null;

  let primary: SupplyPrimaryAction | null;
  if (fromVendor) {
    primary =
      can.fulfil && order.status === 'PLACED' && order.operatingModel === 'FOCO'
        ? 'sendToVendor'
        : can.receive && VENDOR_OPEN.includes(order.status)
          ? // A vendor owed on arrival is asked about; one paid already, or paid
            // by accounts, is simply received.
            owed
            ? 'receiveAsk'
            : 'receive'
          : pay;
  } else {
    primary =
      can.fulfil && order.status === 'PLACED'
        ? 'accept'
        : can.fulfil && order.status === 'ACCEPTED'
          ? 'pack'
          : can.fulfil && order.status === 'PACKED'
            ? 'dispatch'
            : can.deliver && order.status === 'DISPATCHED'
              ? // Pay on delivery asks first (requirement 22): the goods arriving
                // is not evidence the money did, and only the person at the
                // counter knows. Anything already settled is delivered at once —
                // a question whose answer cannot matter teaches people to tap
                // through it.
                owed
                ? 'collect'
                : 'deliver'
              : pay;
  }

  // The warehouse confirms money that came to the warehouse — not a vendor's,
  // and not accounts paying the business's own bill.
  const verify =
    can.verify &&
    !fromVendor &&
    order.paymentMode !== 'ACCOUNTS' &&
    (order.paymentStatus === 'PAID' || order.paymentStatus === 'FAILED');

  return {
    primary,
    delay: can.delay && DELAYABLE.includes(order.status),
    // The desk rejects what reaches the desk: every warehouse order, and a
    // vendor order only when it was the desk's to forward.
    reject: fromVendor
      ? can.fulfil && order.operatingModel === 'FOCO' && VENDOR_OPEN.includes(order.status)
      : can.fulfil && ['PLACED', 'ACCEPTED', 'PACKED'].includes(order.status),
    // A vendor brings its own goods, so there is nobody of ours to name.
    reassign: can.fulfil && !fromVendor && ASSIGNABLE.includes(order.status),
    cancel: can.order && ['DRAFT', 'PLACED'].includes(order.status),
    verify,
    verifyFailed: verify && order.paymentStatus === 'PAID',
    // Whoever is sending it on: the desk for a company-operated branch, the
    // branch itself for a franchise.
    whatsapp:
      fromVendor &&
      !!order.vendor?.phone &&
      VENDOR_OPEN.includes(order.status) &&
      (order.operatingModel === 'FOCO' ? can.fulfil : can.order),
  };
}

/** The order's lines as a vendor reads them on WhatsApp — "• Milk × 20 litre". */
export function vendorOrderLines(order: SupplyOrder): string {
  return order.items
    .map((line) => `• ${line.itemNameSnapshot} × ${Number(line.quantity)} ${line.unitSnapshot}`)
    .join('\n');
}
