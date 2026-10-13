import { apiClient } from './client';
import type { Holiday, WorkWeek } from '@/types/staffing';

/**
 * The work calendar — the weekly off and the holiday list — as the app's
 * `api/workCalendar.ts`. These set the payroll divisor: working days = calendar
 * days − week-offs − holidays. Both are paid, so they come out of the divisor
 * rather than counting as days not worked.
 */
export async function getWorkWeek(businessId: string): Promise<WorkWeek> {
  const { data } = await apiClient.get<WorkWeek>(`/businesses/${businessId}/work-week`);
  return data;
}

export async function updateWorkWeek(
  businessId: string,
  payload: { weeklyOffDays?: number[]; unmarkedWorkingDayStatus?: WorkWeek['unmarkedWorkingDayStatus'] }
): Promise<Pick<WorkWeek, 'weeklyOffDays' | 'unmarkedWorkingDayStatus'>> {
  const { data } = await apiClient.patch(`/businesses/${businessId}/work-week`, payload);
  return data;
}

export async function listHolidays(
  businessId: string,
  params: { year?: number; branchId?: string } = {}
): Promise<Holiday[]> {
  const { data } = await apiClient.get<Holiday[]>(`/businesses/${businessId}/holidays`, { params });
  return data;
}

export async function createHoliday(
  businessId: string,
  payload: { date: string; name: string; branchId?: string | null; isPaid?: boolean }
): Promise<Holiday> {
  const { data } = await apiClient.post<Holiday>(`/businesses/${businessId}/holidays`, payload);
  return data;
}

export async function deleteHoliday(businessId: string, holidayId: string): Promise<{ id: string }> {
  const { data } = await apiClient.delete<{ id: string }>(`/businesses/${businessId}/holidays/${holidayId}`);
  return data;
}
