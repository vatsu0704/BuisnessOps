import { apiClient } from '@/api/client';
import type { AttendanceRecord, AttendanceStatus } from '@/types/staffing';

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
