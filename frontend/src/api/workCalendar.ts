import { apiClient } from '@/api/client';
import type { Holiday, WorkWeek } from '@/types/staffing';
import type { Branch } from '@/types/branch';

/**
 * The work calendar — the weekly off and the holiday list.
 *
 * These set the payroll divisor: working days = calendar days − week-offs −
 * holidays. Week-offs and holidays are paid, so they are excluded from the
 * divisor rather than counted as days not worked.
 */
export async function getWorkWeek(businessId: string): Promise<WorkWeek> {
  const { data } = await apiClient.get<WorkWeek>(`/businesses/${businessId}/work-week`);
  return data;
}

export async function updateWorkWeek(
  businessId: string,
  payload: { weeklyOffDays?: number[]; unmarkedWorkingDayStatus?: 'PRESENT' | 'ABSENT' }
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

/**
 * Branch settings were write-once at creation until this endpoint existed, so
 * a geofence could never be corrected and a wrong timezone permanently
 * mis-filed punches near local midnight.
 */
export async function updateBranch(
  businessId: string,
  branchId: string,
  payload: {
    name?: string;
    city?: string;
    region?: string;
    timezone?: string;
    latitude?: number | null;
    longitude?: number | null;
    /** null clears the geofence. */
    geofenceRadiusMeters?: number | null;
    weeklyOffOverride?: boolean;
    weeklyOffDays?: number[];
  }
): Promise<Branch> {
  const { data } = await apiClient.patch<Branch>(`/businesses/${businessId}/branches/${branchId}`, payload);
  return data;
}
