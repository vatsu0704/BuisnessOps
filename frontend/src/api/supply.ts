import { apiClient } from '@/api/client';
import type {
  ChoosablePaymentMode,
  DeliveryAgent,
  PaymentAccount,
  PlacedSupplyOrder,
  SettleResult,
  SupplyCollectedVia,
  SupplyDelayReason,
  SupplyItem,
  SupplyOrder,
  SupplyOrderStatus,
  SupplyPaymentOrder,
  SupplyVendorPaid,
  Vendor,
} from '@/types/supply';

const base = (businessId: string) => `/businesses/${businessId}`;

// --- The raw-material catalog ----------------------------------------------

export async function listSupplyItems(
  businessId: string,
  options: { includeInactive?: boolean; search?: string } = {}
): Promise<SupplyItem[]> {
  const { data } = await apiClient.get<SupplyItem[]>(`${base(businessId)}/supply-items`, {
    params: options,
  });
  return data;
}

export async function createSupplyItem(
  businessId: string,
  payload: {
    name: string;
    unit: string;
    category?: string | null;
    unitPrice?: number | null;
    /** Who supplies it. null or omitted is the warehouse's own stock. */
    vendorId?: string | null;
  }
): Promise<SupplyItem> {
  const { data } = await apiClient.post<SupplyItem>(`${base(businessId)}/supply-items`, payload);
  return data;
}

/**
 * `unitPrice: null` is a deliberate value, not a missing one — it withdraws the
 * price and makes the item un-orderable without deactivating it.
 */
export async function updateSupplyItem(
  businessId: string,
  inventoryItemId: string,
  payload: {
    name?: string;
    unit?: string;
    category?: string | null;
    unitPrice?: number | null;
    /** null moves it back to the warehouse's own stock. */
    vendorId?: string | null;
    isActive?: boolean;
  }
): Promise<SupplyItem> {
  const { data } = await apiClient.patch<SupplyItem>(
    `${base(businessId)}/supply-items/${inventoryItemId}`,
    payload
  );
  return data;
}

// --- The branch's cart -------------------------------------------------------

/** The branch's open cart, created by the server on first use. */
export async function getSupplyCart(businessId: string, branchId: string): Promise<SupplyOrder> {
  const { data } = await apiClient.get<SupplyOrder>(
    `${base(businessId)}/branches/${branchId}/supply-cart`
  );
  return data;
}

/**
 * Put something in the cart.
 *
 * No price travels with this: the server takes it from the catalog, because a
 * price the client can name is a price the client can invent. Adding the same
 * item again raises its quantity rather than making a second line.
 */
export async function addSupplyCartItem(
  businessId: string,
  payload: { branchId: string; inventoryItemId: string; quantity: number }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(`${base(businessId)}/supply-cart/items`, payload);
  return data;
}

/** Zero removes the line — how a cart says "take it out". */
export async function updateSupplyOrderItem(
  businessId: string,
  supplyOrderId: string,
  itemId: string,
  quantity: number
): Promise<SupplyOrder> {
  const { data } = await apiClient.patch<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/items/${itemId}`,
    { quantity }
  );
  return data;
}

/**
 * Place the cart — which the server splits into one order per supplier.
 *
 * A company-operated (FOCO) branch sends no payment at all: accounts pays, and
 * the server would ignore one anyway. A franchise branch says how it is paying,
 * and paying now (`ONLINE`) means it already paid every payee's QR and says so
 * with `paymentConfirmed`. No reference has to be typed (requirement 26).
 */
export async function placeSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  payload: { paymentMode?: ChoosablePaymentMode; paymentConfirmed?: boolean; paymentReference?: string }
): Promise<PlacedSupplyOrder> {
  const { data } = await apiClient.post<PlacedSupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/place`,
    payload
  );
  return data;
}

/** The branch withdrawing its own order, allowed only before it is accepted. */
export async function cancelSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  note?: string
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/cancel`,
    { note }
  );
  return data;
}

// --- Reading -----------------------------------------------------------------

/** A branch's own orders, cart included — requirement 11's tracking view. */
export async function listSupplyOrders(
  businessId: string,
  options: { branchId?: string; status?: SupplyOrderStatus } = {}
): Promise<SupplyOrder[]> {
  const { data } = await apiClient.get<SupplyOrder[]>(`${base(businessId)}/supply-orders`, {
    params: options,
  });
  return data;
}

/** Requirement 3: one desk, every branch's incoming orders. Carts excluded. */
export async function listDeskOrders(
  businessId: string,
  options: { branchId?: string; status?: SupplyOrderStatus } = {}
): Promise<SupplyOrder[]> {
  const { data } = await apiClient.get<SupplyOrder[]>(`${base(businessId)}/supply-desk`, {
    params: options,
  });
  return data;
}

/** Requirement 12: the run this agent is carrying. */
export async function listDeliveryOrders(
  businessId: string,
  options: { includeDelivered?: boolean } = {}
): Promise<SupplyOrder[]> {
  const { data } = await apiClient.get<SupplyOrder[]>(`${base(businessId)}/supply-deliveries`, {
    params: options,
  });
  return data;
}

export async function getSupplyOrder(businessId: string, supplyOrderId: string): Promise<SupplyOrder> {
  const { data } = await apiClient.get<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}`
  );
  return data;
}

// --- Moving it along ----------------------------------------------------------

/**
 * Each of these is one step of the status machine the server enforces, so an
 * out-of-order call is refused there rather than guarded here — the screen
 * hides the buttons that do not apply, and the server is what makes that true.
 */
export async function acceptSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  promisedAt?: string
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/accept`,
    { promisedAt }
  );
  return data;
}

export async function packSupplyOrder(businessId: string, supplyOrderId: string): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/pack`
  );
  return data;
}

/**
 * Send it out, naming who is carrying it.
 *
 * The agent is optional, and stays so: a business with no delivery agent yet
 * still has to be able to ship, and an unnamed run shows up for every agent
 * covering that branch instead of disappearing.
 */
export async function dispatchSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  deliveryAgentMembershipId?: string
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/dispatch`,
    { deliveryAgentMembershipId }
  );
  return data;
}

/**
 * Who the desk may hand a run to, free ones first.
 *
 * Not the team list, and not reachable with `team:view` — the warehouse desk
 * holds neither. See the endpoint's comment for why availability is reported
 * rather than enforced.
 */
export async function listDeliveryAgents(businessId: string): Promise<DeliveryAgent[]> {
  const { data } = await apiClient.get<DeliveryAgent[]>(`${base(businessId)}/supply-delivery-agents`);
  return data;
}

/** Give the run to an agent, or move it to a different one. */
export async function assignSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  deliveryAgentMembershipId: string
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/assign`,
    { deliveryAgentMembershipId }
  );
  return data;
}

/**
 * Mark it delivered.
 *
 * `collectedVia` is the agent saying how the branch's money reached them —
 * cash in hand, or the cashier scanning the QR the agent showed (requirements
 * 22 and 26). The server decides whether it was needed — it is the half that
 * can see the order — and refuses a pay-on-delivery order without it, rather
 * than recording money as received because the goods arrived.
 */
export async function deliverSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  collectedVia?: SupplyCollectedVia
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/deliver`,
    { collectedVia }
  );
  return data;
}

/**
 * The branch says a vendor's goods arrived (requirement 25). A franchise branch
 * paying on delivery also says whether it paid the vendor's own delivery person.
 */
export async function receiveSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  vendorPaid?: SupplyVendorPaid
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/receive`,
    { vendorPaid }
  );
  return data;
}

/**
 * A franchise branch pays for an order it already placed: early, again after
 * the warehouse said it never arrived, or a vendor after the goods came.
 * Cash is for a vendor only — the warehouse's cash goes through the agent.
 */
export async function paySupplyOrder(
  businessId: string,
  supplyOrderId: string,
  payload: { method: 'UPI' | 'CASH'; paymentReference?: string }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/pay`,
    payload
  );
  return data;
}

/** The desk's verb for the same end state as `cancel`, with a required reason. */
export async function rejectSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  payload: { reasonCode: SupplyDelayReason; note?: string }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/reject`,
    payload
  );
  return data;
}

/** Requirement 9, posted from either end — the desk or the agent carrying it. */
export async function postSupplyDelay(
  businessId: string,
  supplyOrderId: string,
  payload: { delayMinutes: number; reasonCode: SupplyDelayReason; note?: string }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/delays`,
    payload
  );
  return data;
}

export async function verifySupplyPayment(
  businessId: string,
  supplyOrderId: string,
  payload: { outcome: 'VERIFIED' | 'FAILED'; note?: string }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/verify-payment`,
    payload
  );
  return data;
}

// --- Accounts (requirement 27) -------------------------------------------------

/** What accounts pays for: every FOCO order still unpaid, delivered or on its way. */
export async function listPaymentsDue(businessId: string): Promise<SupplyPaymentOrder[]> {
  const { data } = await apiClient.get<SupplyPaymentOrder[]>(`${base(businessId)}/supply-payments/due`);
  return data;
}

/** Payments sent to the warehouse that nobody has confirmed yet. */
export async function listPaymentsToConfirm(businessId: string): Promise<SupplyPaymentOrder[]> {
  const { data } = await apiClient.get<SupplyPaymentOrder[]>(`${base(businessId)}/supply-payments/to-confirm`);
  return data;
}

/**
 * Pay for a batch of delivered FOCO orders, all to one payee, in one go. All
 * or nothing on the server: one order that is not due refuses the batch.
 */
export async function settleSupplyPayments(
  businessId: string,
  payload: { supplyOrderIds: string[]; paymentReference?: string }
): Promise<SettleResult> {
  const { data } = await apiClient.post<SettleResult>(`${base(businessId)}/supply-payments/settle`, payload);
  return data;
}

// --- Vendors and payees (requirements 25 and 26) --------------------------------

export async function listVendors(
  businessId: string,
  options: { includeInactive?: boolean } = {}
): Promise<Vendor[]> {
  const { data } = await apiClient.get<Vendor[]>(`${base(businessId)}/vendors`, { params: options });
  return data;
}

export async function createVendor(
  businessId: string,
  payload: { name: string; phone?: string | null }
): Promise<Vendor> {
  const { data } = await apiClient.post<Vendor>(`${base(businessId)}/vendors`, payload);
  return data;
}

/** The desk's half: name, phone, withdrawn. Never where the money goes. */
export async function updateVendor(
  businessId: string,
  vendorId: string,
  payload: { name?: string; phone?: string | null; isActive?: boolean }
): Promise<Vendor> {
  const { data } = await apiClient.patch<Vendor>(`${base(businessId)}/vendors/${vendorId}`, payload);
  return data;
}

/** Accounts' half: where a payment to this vendor goes. `upiId: null` clears it. */
export async function setVendorUpi(
  businessId: string,
  vendorId: string,
  payload: { upiId: string | null; upiName?: string | null }
): Promise<Vendor> {
  const { data } = await apiClient.patch<Vendor>(`${base(businessId)}/vendors/${vendorId}/upi`, payload);
  return data;
}

/** Where a payment for warehouse stock goes. */
export async function getPaymentAccount(businessId: string): Promise<PaymentAccount> {
  const { data } = await apiClient.get<PaymentAccount>(`${base(businessId)}/payment-account`);
  return data;
}

export async function setPaymentAccount(
  businessId: string,
  payload: { upiId: string | null; upiName?: string | null }
): Promise<PaymentAccount> {
  const { data } = await apiClient.patch<PaymentAccount>(`${base(businessId)}/payment-account`, payload);
  return data;
}
