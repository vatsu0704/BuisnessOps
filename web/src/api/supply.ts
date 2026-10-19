import { apiClient } from './client';
import type {
  ChoosablePaymentMode,
  DeliveryAgent,
  PaymentAccount,
  PaymentHistory,
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

/**
 * Supply orders — the app's `api/supply.ts`: the raw-material catalog, a branch's
 * cart, the three lists of orders, and every step an order moves through.
 *
 * Money and quantities travel as strings (Prisma's `Decimal`); keep them strings
 * until the moment they are shown or summed.
 */

const base = (businessId: string) => `/businesses/${businessId}`;

// --- The raw-material catalog ----------------------------------------------

export async function listSupplyItems(
  businessId: string,
  options: { includeInactive?: boolean } = {}
): Promise<SupplyItem[]> {
  const { data } = await apiClient.get<SupplyItem[]>(`${base(businessId)}/supply-items`, { params: options });
  return data;
}

export interface SupplyItemPayload {
  name: string;
  unit: string;
  category: string | null;
  /** null is a value: no price yet, which makes the item un-orderable without withdrawing it. */
  unitPrice: number | null;
  /** Who supplies it. null is the warehouse's own stock. */
  vendorId: string | null;
}

export async function createSupplyItem(businessId: string, payload: SupplyItemPayload): Promise<SupplyItem> {
  const { data } = await apiClient.post<SupplyItem>(`${base(businessId)}/supply-items`, payload);
  return data;
}

export async function updateSupplyItem(
  businessId: string,
  inventoryItemId: string,
  payload: Partial<SupplyItemPayload> & { isActive?: boolean }
): Promise<SupplyItem> {
  const { data } = await apiClient.patch<SupplyItem>(`${base(businessId)}/supply-items/${inventoryItemId}`, payload);
  return data;
}

// --- The branch's cart -------------------------------------------------------

/** The branch's open cart, created by the server on first use. */
export async function getSupplyCart(businessId: string, branchId: string): Promise<SupplyOrder> {
  const { data } = await apiClient.get<SupplyOrder>(`${base(businessId)}/branches/${branchId}/supply-cart`);
  return data;
}

/**
 * Put something in the cart. No price travels with it — the server takes it from
 * the catalog — and adding the same item again raises its quantity.
 */
export async function addSupplyCartItem(
  businessId: string,
  payload: { branchId: string; inventoryItemId: string; quantity: number }
): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(`${base(businessId)}/supply-cart/items`, payload);
  return data;
}

/** Zero removes the line. */
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
 * Place the cart, which the server splits into one order per supplier. A
 * company-operated branch sends no payment — accounts pays; a franchise says how
 * it is paying, and paying now means it already paid every supplier's QR.
 */
export async function placeSupplyOrder(
  businessId: string,
  supplyOrderId: string,
  payload: { paymentMode?: ChoosablePaymentMode; paymentConfirmed?: boolean }
): Promise<PlacedSupplyOrder> {
  const { data } = await apiClient.post<PlacedSupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/place`,
    payload
  );
  return data;
}

/** The branch withdrawing its own order, allowed only before it is accepted. */
export async function cancelSupplyOrder(businessId: string, supplyOrderId: string): Promise<SupplyOrder> {
  const { data } = await apiClient.post<SupplyOrder>(`${base(businessId)}/supply-orders/${supplyOrderId}/cancel`, {});
  return data;
}

// --- Reading -----------------------------------------------------------------

type ListOptions = { status?: SupplyOrderStatus };

/** A branch's own orders, cart included — requirement 11's tracking view. */
export async function listSupplyOrders(businessId: string, options: ListOptions = {}): Promise<SupplyOrder[]> {
  const { data } = await apiClient.get<SupplyOrder[]>(`${base(businessId)}/supply-orders`, { params: options });
  return data;
}

/** Requirement 3: one desk, every branch's incoming orders, oldest first. Carts excluded. */
export async function listDeskOrders(businessId: string, options: ListOptions = {}): Promise<SupplyOrder[]> {
  const { data } = await apiClient.get<SupplyOrder[]>(`${base(businessId)}/supply-desk`, { params: options });
  return data;
}

/** Requirement 12: the run this agent is carrying. */
export async function listDeliveryOrders(businessId: string): Promise<SupplyOrder[]> {
  const { data } = await apiClient.get<SupplyOrder[]>(`${base(businessId)}/supply-deliveries`);
  return data;
}

export async function getSupplyOrder(businessId: string, supplyOrderId: string): Promise<SupplyOrder> {
  const { data } = await apiClient.get<SupplyOrder>(`${base(businessId)}/supply-orders/${supplyOrderId}`);
  return data;
}

// --- Moving it along ----------------------------------------------------------
// Each is one step of the status machine the server enforces; the page hides the
// buttons that do not apply, and the server is what makes that true.

async function step(businessId: string, supplyOrderId: string, verb: string, body: object = {}) {
  const { data } = await apiClient.post<SupplyOrder>(
    `${base(businessId)}/supply-orders/${supplyOrderId}/${verb}`,
    body
  );
  return data;
}

export const acceptSupplyOrder = (businessId: string, supplyOrderId: string, promisedAt?: string) =>
  step(businessId, supplyOrderId, 'accept', { promisedAt });

export const packSupplyOrder = (businessId: string, supplyOrderId: string) => step(businessId, supplyOrderId, 'pack');

/** Send it out, naming who is carrying it — or nobody yet, which every agent covering the branch then sees. */
export const dispatchSupplyOrder = (businessId: string, supplyOrderId: string, deliveryAgentMembershipId?: string) =>
  step(businessId, supplyOrderId, 'dispatch', { deliveryAgentMembershipId });

/** Give the run to an agent, or move it to a different one. */
export const assignSupplyOrder = (businessId: string, supplyOrderId: string, deliveryAgentMembershipId: string) =>
  step(businessId, supplyOrderId, 'assign', { deliveryAgentMembershipId });

/** How the branch's money reached the agent; the server refuses a pay-on-delivery order without it. */
export const deliverSupplyOrder = (businessId: string, supplyOrderId: string, collectedVia?: SupplyCollectedVia) =>
  step(businessId, supplyOrderId, 'deliver', { collectedVia });

/** The branch says a vendor's goods arrived, and whether the vendor's own person was paid. */
export const receiveSupplyOrder = (businessId: string, supplyOrderId: string, vendorPaid?: SupplyVendorPaid) =>
  step(businessId, supplyOrderId, 'receive', { vendorPaid });

/** A franchise branch paying for an order it already placed. Cash is for a vendor only. */
export const paySupplyOrder = (businessId: string, supplyOrderId: string, method: 'UPI' | 'CASH') =>
  step(businessId, supplyOrderId, 'pay', { method });

export const rejectSupplyOrder = (
  businessId: string,
  supplyOrderId: string,
  payload: { reasonCode: SupplyDelayReason; note?: string }
) => step(businessId, supplyOrderId, 'reject', payload);

/** Requirement 9, from either end — the desk or the agent carrying it. */
export const postSupplyDelay = (
  businessId: string,
  supplyOrderId: string,
  payload: { delayMinutes: number; reasonCode: SupplyDelayReason; note?: string }
) => step(businessId, supplyOrderId, 'delays', payload);

export const verifySupplyPayment = (businessId: string, supplyOrderId: string, outcome: 'VERIFIED' | 'FAILED') =>
  step(businessId, supplyOrderId, 'verify-payment', { outcome });

/**
 * Who the desk may hand a run to, freest first — a name, a duty state and a
 * count, under `supplyOrder:fulfil`. Not the team list: the desk holds no
 * `team:view`.
 */
export async function listDeliveryAgents(businessId: string): Promise<DeliveryAgent[]> {
  const { data } = await apiClient.get<DeliveryAgent[]>(`${base(businessId)}/supply-delivery-agents`);
  return data;
}

// --- Vendors and payments (requirements 25–27) ---------------------------------

export async function listVendors(businessId: string, options: { includeInactive?: boolean } = {}): Promise<Vendor[]> {
  const { data } = await apiClient.get<Vendor[]>(`${base(businessId)}/vendors`, { params: options });
  return data;
}

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
 * Pay for a batch of delivered FOCO orders, all to one payee, in one go. All or
 * nothing on the server: one order that is not due refuses the batch.
 */
export async function settleSupplyPayments(
  businessId: string,
  payload: { supplyOrderIds: string[] }
): Promise<SettleResult> {
  const { data } = await apiClient.post<SettleResult>(`${base(businessId)}/supply-payments/settle`, payload);
  return data;
}

/** Requirement 35 — what was paid in a month, optionally for one kind of branch. */
export async function listPaymentHistory(
  businessId: string,
  params: { month: string; model?: 'FOCO' | 'FM' }
): Promise<PaymentHistory> {
  const { data } = await apiClient.get<PaymentHistory>(`${base(businessId)}/supply-payments/history`, { params });
  return data;
}

export async function createVendor(businessId: string, payload: { name: string; phone: string | null }): Promise<Vendor> {
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

// --- Where money goes (requirements 26 and 32) — `paymentAccount:manage` --------

type UpiPayload = { upiId: string | null; upiName: string | null };

/** Accounts' half of a vendor: where a payment to them goes. `upiId: null` clears it. */
export async function setVendorUpi(businessId: string, vendorId: string, payload: UpiPayload): Promise<Vendor> {
  const { data } = await apiClient.patch<Vendor>(`${base(businessId)}/vendors/${vendorId}/upi`, payload);
  return data;
}

export async function getPaymentAccount(businessId: string): Promise<PaymentAccount> {
  const { data } = await apiClient.get<PaymentAccount>(`${base(businessId)}/payment-account`);
  return data;
}

/** Where a payment for warehouse stock goes. */
export async function setPaymentAccount(businessId: string, payload: UpiPayload): Promise<PaymentAccount> {
  const { data } = await apiClient.patch<PaymentAccount>(`${base(businessId)}/payment-account`, payload);
  return data;
}

/** Where the business's counter customers pay. */
export async function setCounterAccount(businessId: string, payload: UpiPayload): Promise<PaymentAccount> {
  const { data } = await apiClient.patch<PaymentAccount>(`${base(businessId)}/payment-account/counter`, payload);
  return data;
}

/** One shop's own counter UPI ID; null puts it back on the business's. */
export async function setBranchCounterAccount(
  businessId: string,
  branchId: string,
  payload: UpiPayload
): Promise<PaymentAccount> {
  const { data } = await apiClient.patch<PaymentAccount>(
    `${base(businessId)}/branches/${branchId}/payment-account/counter`,
    payload
  );
  return data;
}
