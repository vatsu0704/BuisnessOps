import { apiClient } from '@/api/client';
import type { CounterDaySummary, CounterOrder, PaymentMethod } from '@/types/counter';

const base = (businessId: string) => `/businesses/${businessId}`;

/**
 * Open an order and get its token.
 *
 * The token is issued now, not on close — the customer needs a number the
 * moment they order, which is the whole point of a token.
 */
export async function openCounterOrder(
  businessId: string,
  branchId: string,
  paymentMethod?: PaymentMethod
): Promise<CounterOrder> {
  const { data } = await apiClient.post<CounterOrder>(`${base(businessId)}/counter-orders`, {
    branchId,
    paymentMethod,
  });
  return data;
}

export async function getCounterOrder(businessId: string, counterOrderId: string): Promise<CounterOrder> {
  const { data } = await apiClient.get<CounterOrder>(`${base(businessId)}/counter-orders/${counterOrderId}`);
  return data;
}

export async function listCounterOrders(
  businessId: string,
  branchId: string,
  options: { date?: string; status?: CounterOrder['status'] } = {}
): Promise<CounterOrder[]> {
  const { data } = await apiClient.get<CounterOrder[]>(
    `${base(businessId)}/branches/${branchId}/counter-orders`,
    { params: options }
  );
  return data;
}

export async function getCounterDaySummary(
  businessId: string,
  branchId: string,
  date?: string
): Promise<CounterDaySummary> {
  const { data } = await apiClient.get<CounterDaySummary>(
    `${base(businessId)}/branches/${branchId}/counter-day`,
    { params: { date } }
  );
  return data;
}

/**
 * Add a line.
 *
 * Send `productId` for a catalog item and the server takes the price from the
 * catalog — a price the client can name is a price the client can invent.
 * `name` + `unitPrice` is the one-off case, where nothing else can supply them.
 */
export async function addCounterItem(
  businessId: string,
  counterOrderId: string,
  payload: { productId?: string; name?: string; unitPrice?: number; quantity: number }
): Promise<CounterOrder> {
  const { data } = await apiClient.post<CounterOrder>(
    `${base(businessId)}/counter-orders/${counterOrderId}/items`,
    payload
  );
  return data;
}

/** Zero removes the line, the way a till expresses it. */
export async function updateCounterItem(
  businessId: string,
  counterOrderId: string,
  itemId: string,
  quantity: number
): Promise<CounterOrder> {
  const { data } = await apiClient.patch<CounterOrder>(
    `${base(businessId)}/counter-orders/${counterOrderId}/items/${itemId}`,
    { quantity }
  );
  return data;
}

/** Hand the order over. It stays editable — the floor is the day close. */
export async function closeCounterOrder(
  businessId: string,
  counterOrderId: string,
  paymentMethod?: PaymentMethod
): Promise<CounterOrder> {
  const { data } = await apiClient.post<CounterOrder>(
    `${base(businessId)}/counter-orders/${counterOrderId}/close`,
    { paymentMethod }
  );
  return data;
}

export async function reopenCounterOrder(
  businessId: string,
  counterOrderId: string
): Promise<CounterOrder> {
  const { data } = await apiClient.post<CounterOrder>(
    `${base(businessId)}/counter-orders/${counterOrderId}/reopen`
  );
  return data;
}

/** The row survives, so a voided token is never handed out again. */
export async function voidCounterOrder(
  businessId: string,
  counterOrderId: string
): Promise<CounterOrder> {
  const { data } = await apiClient.post<CounterOrder>(
    `${base(businessId)}/counter-orders/${counterOrderId}/void`
  );
  return data;
}

/** After this, nothing from the day can be edited. */
export async function closeCounterDay(businessId: string, branchId: string, date?: string) {
  const { data } = await apiClient.post(`${base(businessId)}/branches/${branchId}/counter-day/close`, {
    date,
  });
  return data;
}

export async function reopenCounterDay(businessId: string, branchId: string, date?: string) {
  const { data } = await apiClient.delete(`${base(businessId)}/branches/${branchId}/counter-day/close`, {
    params: { date },
  });
  return data;
}
