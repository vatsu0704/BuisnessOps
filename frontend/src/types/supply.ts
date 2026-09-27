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
 * Recorded, never collected — no gateway, no money through this app. ONLINE
 * means the branch paid some other way and typed the reference the warehouse
 * then checks against its own records.
 */
export type SupplyPaymentMode = 'ONLINE' | 'COD';

export type SupplyPaymentStatus = 'PENDING' | 'PAID' | 'VERIFIED' | 'FAILED';

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

/** The catalog row — a backend `InventoryItem`. Business-wide, not per branch. */
export interface SupplyItem {
  id: string;
  businessId: string;
  name: string;
  unit: string;
  category: string | null;
  /** null means no price has been set, which makes the item un-orderable. */
  unitPrice: string | null;
  isActive: boolean;
}

export interface SupplyOrderItem {
  id: string;
  inventoryItemId: string | null;
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

export interface SupplyOrder {
  id: string;
  businessId: string;
  branchId: string;
  branch: SupplyDestination | null;
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
