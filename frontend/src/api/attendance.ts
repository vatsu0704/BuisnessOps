import { apiClient } from '@/api/client';
import type { AttendanceRecord, AttendanceStatus, DailyRoster } from '@/types/staffing';

export interface Coordinates {
  latitude?: number;
  longitude?: number;
}

export async function punchIn(businessId: string, coords: Coordinates): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<AttendanceRecord>(`/businesses/${businessId}/attendance/punch-in`, coords);
  return data;
}

export async function punchOut(businessId: string, coords: Coordinates): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<AttendanceRecord>(`/businesses/${businessId}/attendance/punch-out`, coords);
  return data;
}

export async function getMyAttendance(
  businessId: string,
  month: number,
  year: number
): Promise<AttendanceRecord[]> {
  const { data } = await apiClient.get<AttendanceRecord[]>(`/businesses/${businessId}/attendance/me`, {
    params: { month, year },
  });
  return data;
}

export async function getStaffAttendance(
  businessId: string,
  staffMemberId: string,
  month: number,
  year: number
): Promise<AttendanceRecord[]> {
  const { data } = await apiClient.get<AttendanceRecord[]>(
    `/businesses/${businessId}/staff/${staffMemberId}/attendance`,
    { params: { month, year } }
  );
  return data;
}

export async function markAttendance(
  businessId: string,
  staffMemberId: string,
  payload: { date: string; status: AttendanceStatus; notes?: string }
): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<AttendanceRecord>(
    `/businesses/${businessId}/staff/${staffMemberId}/attendance/mark`,
    payload
  );
  return data;
}

/**
 * Every ACTIVE staff member of a branch for a day, with their attendance row
 * or null. Previously this endpoint returned only rows that existed, so anyone
 * who hadn't punched was invisible and "who hasn't punched in yet?" could not
 * be answered.
 */
export async function getDailyRoster(
  businessId: string,
  branchId: string,
  date: string
): Promise<DailyRoster> {
  const { data } = await apiClient.get<DailyRoster>(
    `/businesses/${businessId}/branches/${branchId}/attendance`,
    { params: { date } }
  );
  return data;
}
