import { apiClient } from './client';
import type { TodaySummary } from '@/types/today';

/**
 * Today at a glance (requirement 33): each reachable branch on its own day, the
 * spending only for somebody who may read expenses, the latest bills only for
 * somebody who bills. Behind `analytics:viewToday`.
 */
export async function getToday(businessId: string): Promise<TodaySummary> {
  const { data } = await apiClient.get<TodaySummary>(`/businesses/${businessId}/today`);
  return data;
}
