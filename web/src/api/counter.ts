import { apiClient } from './client';
import type { CounterDaySummary, CounterOrder, CounterSyncResponse } from '@/types/counter';
import type { toSyncPayload } from '@shared/utils/counterQueue';

const base = (businessId: string) => `/businesses/${businessId}`;

/**
 * The counter's context for a branch's own today (requirements 29–32): the day's
 * totals and last token, the branch's clock, the UPI payee, what prints at the
 * top of a token, and — for somebody who may read them — the day's expenses. The
 * counter keeps a copy so it bills with no connection.
 *
 * `date` reads a day that is over, for the day cursor. Note the summary's
 * `todayKey`, `utcOffsetMinutes` and `serverNow` are always *now* whatever date
 * is asked for — which is why a past day's summary must never be written into
 * the store's `contexts`, where `todayKey` decides the next token.
 */
export async function getCounterDaySummary(
  businessId: string,
  branchId: string,
  date?: string
): Promise<CounterDaySummary> {
  const { data } = await apiClient.get<CounterDaySummary>(
    `${base(businessId)}/branches/${branchId}/counter-day`,
    { params: date ? { date } : undefined }
  );
  return data;
}

/**
 * The branch's bills for a day, newest first, as the server holds them. Today
 * unless `date` says otherwise. The server caps this at 200 rows.
 */
export async function listCounterOrders(
  businessId: string,
  branchId: string,
  options: { date?: string } = {}
): Promise<CounterOrder[]> {
  const { data } = await apiClient.get<CounterOrder[]>(
    `${base(businessId)}/branches/${branchId}/counter-orders`,
    { params: options.date ? { date: options.date } : undefined }
  );
  return data;
}

/** Void a bill this browser never held — one taken on another device. Online only. */
export async function voidCounterOrder(businessId: string, counterOrderId: string): Promise<CounterOrder> {
  const { data } = await apiClient.post<CounterOrder>(`${base(businessId)}/counter-orders/${counterOrderId}/void`);
  return data;
}

/** Open a closed day again, so a bill refused for it can be sent. */
export async function reopenCounterDay(businessId: string, branchId: string, date: string): Promise<void> {
  await apiClient.delete(`${base(businessId)}/branches/${branchId}/counter-day/close`, { params: { date } });
}

/**
 * Send paid sales made in this browser (requirement 30) — the one way every
 * counter sale is recorded, online or after a stretch offline. One result per
 * sale, in order; a sale already recorded comes back DUPLICATE, so sending again
 * is safe.
 */
export async function syncCounterSales(
  businessId: string,
  sales: ReturnType<typeof toSyncPayload>[]
): Promise<CounterSyncResponse> {
  const { data } = await apiClient.post<CounterSyncResponse>(`${base(businessId)}/counter-sales/sync`, { sales });
  return data;
}
