import { apiClient } from '@/api/client';
import type {
  DeliveryAgent,
  SupplyDelayReason,
  SupplyItem,
  SupplyOrder,
  SupplyOrderStatus,
  SupplyPaymentMode,
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
  payload: { name: string; unit: string; category?: string | null; unitPrice?: number | null }
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

export async function placeSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  payload: { paymentMode: SupplyPaymentMode; paymentReference?: string }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
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
 * `cashCollected` is the agent saying the branch's cash is actually in their
 * hand (requirement 22). The server decides whether it was needed — it is the
 * half that can see the order — and refuses a cash-on-delivery order without
 * it, rather than recording money as received because the goods arrived.
 */
export async function deliverSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  cashCollected?: boolean
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/deliver`,
    { cashCollected }
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
