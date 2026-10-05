import type { BranchOperatingModel } from '@/types/branch';

/**
 * Supply orders — requirements 3, 5, 5.1, 9, 11 and 12.
 *
 * Money and quantities arrive as strings, not numbers: Prisma serializes
 * `Decimal` that way so a value a float cannot hold exactly does not quietly
 * become one in transit. Keep them strings until the moment they are formatted
 * or summed, and parse deliberately rather than letting `+price` happen
 * somewhere by accident.
 */

/** Mirrors the backend `SupplyOrderStatus`. `DRAFT` is the branch's cart. */
export type SupplyOrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PACKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

/**
 * Recorded, never collected — no gateway, no money through this app.
 *
 * ONLINE is "paid before ordering": the cashier paid the payee's UPI QR and
 * said so. COD is "pay on delivery": cash, or the agent's QR, at the counter.
 * ACCOUNTS is a company-operated (FOCO) branch's order, which the accountant
 * pays for once it has arrived — never chosen in the app, set by the server
 * from the branch (requirements 24 and 26).
 */
export type SupplyPaymentMode = 'ONLINE' | 'COD' | 'ACCOUNTS';

/** The modes a cashier may choose. ACCOUNTS is never one of them. */
export type ChoosablePaymentMode = Exclude<SupplyPaymentMode, 'ACCOUNTS'>;

/**
 * The enum names predate requirement 26 and were kept; what they MEAN is now:
 *
 * - PENDING: nothing paid yet.
 * - PAID: the payer says it is paid and the warehouse has not confirmed it —
 *   "Payment sent".
 * - VERIFIED: settled — the warehouse confirmed it, or nobody in the app could
 *   (a vendor; accounts paying), so the payer's record is final. "Paid".
 * - FAILED: the warehouse looked and it had not arrived. The branch can pay again.
 */
export type SupplyPaymentStatus = 'PENDING' | 'PAID' | 'VERIFIED' | 'FAILED';

/** How the agent took the money at the counter. */
export type SupplyCollectedVia = 'CASH' | 'UPI';

/** What the branch says about paying a vendor's own delivery person. */
export type SupplyVendorPaid = 'CASH' | 'UPI' | 'NOT_YET';

/**
 * `ASSIGNMENT` is who is carrying it, and is not a status change: handing a run
 * to a different agent moves nothing along the status machine. Its `note`
 * carries the agent's name, snapshotted when it was given, so the history still
 * reads correctly after that person is renamed or leaves.
 */
export type SupplyOrderEventType = 'STATUS_CHANGE' | 'DELAY' | 'PAYMENT' | 'ASSIGNMENT';

/**
 * Why something is late.
 *
 * The backend validates against exactly this list and stores the code, never a
 * sentence, because it cannot know whether the cashier reading it has the app
 * in Gujarati. `t('supplyDelay.' + reasonCode)` renders it on the device.
 */
export type SupplyDelayReason =
  | 'TRAFFIC'
  | 'STOCK_OUT'
  | 'VEHICLE_ISSUE'
  | 'WEATHER'
  | 'STAFF_SHORTAGE'
  | 'OTHER';

/**
 * A third-party vendor — requirement 25. Supplies some raw material directly
 * rather than from the warehouse's stock, and does not use the app.
 */
export interface Vendor {
  id: string;
  businessId: string;
  name: string;
  /** For the "send to vendor" WhatsApp message. As typed. */
  phone: string | null;
  /** Where a payment to them goes. null until accounts sets one. */
  upiId: string | null;
  upiName: string | null;
  upiUpdatedAt: string | null;
  upiUpdatedByMembership: { id: string; user: { id: string; name: string | null } | null } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Where a payment for WAREHOUSE stock goes — one per business. */
export interface PaymentAccount {
  businessName: string;
  upiId: string | null;
  upiName: string | null;
  upiUpdatedAt: string | null;
  upiUpdatedByMembership: { id: string; user: { id: string; name: string | null } | null } | null;
}

/** The catalog row — a backend `InventoryItem`. Business-wide, not per branch. */
export interface SupplyItem {
  id: string;
  businessId: string;
  name: string;
  unit: string;
  category: string | null;
  /** null means no price has been set, which makes the item un-orderable. */
  unitPrice: string | null;
  /** Who supplies it. null is the warehouse's own stock. */
  vendorId: string | null;
  vendor: { id: string; name: string; isActive: boolean } | null;
  isActive: boolean;
}

export interface SupplyOrderItem {
  id: string;
  inventoryItemId: string | null;
  /**
   * The line's catalog item as it is NOW, for its current supplier — which is
   * what a cart is split by when it is placed. Only meaningful on a cart; a
   * placed order's own `vendor` is the authority. null when the item has since
   * been deleted.
   */
  inventoryItem?: { vendorId: string | null; vendor: SupplyOrderVendor | null } | null;
  /** Snapshotted when it was ordered — a later rename must not rewrite this. */
  itemNameSnapshot: string;
  unitSnapshot: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  createdAt: string;
}

/** Whoever did something, as the API returns them alongside the order. */
export interface SupplyActor {
  id: string;
  role: string;
  user: { id: string; name: string | null } | null;
}

/**
 * Where the order is going, carried on the order itself.
 *
 * The delivery agent opens one screen, and the branch endpoints are not theirs
 * to call, so the destination travels with the order rather than costing a
 * second request. `latitude`/`longitude` are Decimal strings, like every other
 * Decimal here.
 */
export interface SupplyDestination {
  id: string;
  name: string;
  code: string;
  /**
   * Who pays for the branch's NEXT order. The cart reads it to decide whether to
   * ask how the cashier is paying at all; a placed order has its own snapshot.
   */
  operatingModel?: BranchOperatingModel;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
}

/** Whether attendance says this person is on shift right now. */
export type DeliveryAgentDuty = 'ON_DUTY' | 'OFF_DUTY' | 'UNKNOWN';

/**
 * Someone the desk may hand a run to — deliberately not a team member.
 *
 * The warehouse desk holds no `team:view`, so this is the narrowest thing that
 * answers "who can carry this, and who is free": a name, a duty state and a
 * count. Availability is shown, never enforced — `UNKNOWN` is what a business
 * that does not use punch-in reports for everybody, and an off-duty agent is
 * still assignable because the desk knows things the app does not.
 */
export interface DeliveryAgent {
  membershipId: string;
  name: string | null;
  dutyState: DeliveryAgentDuty;
  /** Set only while `dutyState` is `ON_DUTY`. */
  onDutySince: string | null;
  /** Runs already dispatched to them and not yet delivered. */
  activeRuns: number;
}

export interface SupplyOrderEvent {
  id: string;
  type: SupplyOrderEventType;
  fromStatus: SupplyOrderStatus | null;
  toStatus: SupplyOrderStatus | null;
  delayMinutes: number | null;
  /** A `supplyDelay.*` or `supplyEvent.*` key, never a sentence. */
  reasonCode: string | null;
  /** The actor's own words, shown exactly as typed. */
  note: string | null;
  actorMembership: SupplyActor | null;
  createdAt: string;
}

/** The vendor an order is from, as it travels with the order — payee included. */
export interface SupplyOrderVendor {
  id: string;
  name: string;
  phone: string | null;
  upiId: string | null;
  upiName: string | null;
  isActive: boolean;
}

/** The business, as it travels with an order: the warehouse's payee. */
export interface SupplyOrderBusiness {
  name: string;
  supplyUpiId: string | null;
  supplyUpiName: string | null;
}

/** One of the orders a placed cart became. A cart with two suppliers is two orders. */
export interface PlacedOrderSummary {
  id: string;
  orderNumber: number | null;
  vendorId: string | null;
  vendorName: string | null;
  totalAmount: string;
  paymentStatus: SupplyPaymentStatus;
}

export interface SupplyOrder {
  id: string;
  businessId: string;
  branchId: string;
  branch: SupplyDestination | null;
  /** null is the warehouse. A vendor order never passes through it. */
  vendorId: string | null;
  vendor: SupplyOrderVendor | null;
  business: SupplyOrderBusiness | null;
  /** The branch's model when this was placed — it decides who pays. */
  operatingModel: BranchOperatingModel;
  /** Orders split from one cart share it. */
  placementId: string | null;
  /** null while it is still a cart — numbers are issued when an order is placed. */
  orderNumber: number | null;
  status: SupplyOrderStatus;
  totalAmount: string;
  currency: string;
  paymentMode: SupplyPaymentMode | null;
  paymentStatus: SupplyPaymentStatus;
  paymentReference: string | null;
  paymentVerifiedAt: string | null;
  /** When it is currently expected. Each delay pushes it, when one was given. */
  promisedAt: string | null;
  placedByMembership: SupplyActor | null;
  deliveryAgentMembership: SupplyActor | null;
  placedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: SupplyOrderItem[];
  events: SupplyOrderEvent[];
}

/**
 * An order as the Payments lists return it (requirement 27): everything a list
 * of payments shows, and not the event timeline, which is most of an order's
 * weight and which none of those rows display.
 */
export type SupplyPaymentOrder = Omit<SupplyOrder, 'events'>;

/** What placing a cart returns: the first order, and every order the cart became. */
export interface PlacedSupplyOrder extends SupplyOrder {
  placedOrders: PlacedOrderSummary[];
}

/** What paying for a batch of FOCO orders returns. */
export interface SettleResult {
  count: number;
  totalAmount: string;
  currency: string;
  supplyOrderIds: string[];
}
