import { apiClient } from '@/api/client';
import type { TodaySummary } from '@/types/today';

/** Today's sales, bills and spending at the branches this person reaches (requirement 33). */
export async function getToday(businessId: string): Promise<TodaySummary> {
  const { data } = await apiClient.get<TodaySummary>(`/businesses/${businessId}/today`);
  return data;
}
