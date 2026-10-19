import { apiClient } from './client';
import type { MyStaffMember, StaffMember } from '@/types/staffing';

/** The staff records — the app's `api/staff.ts`. A staff member is a person on a roster, with or without an account. */

export interface CreateStaffPayload {
  branchId: string;
  name: string;
  role: string;
  baseSalary?: number;
  /** Links this record to an existing account by email, resolved by the server. */
  email?: string;
  phone?: string;
  employeeCode?: string;
  hiredOn?: string;
  notes?: string;
}

/**
 * Every field optional. `baseSalary` needs `staff:setPay`, and the server refuses
 * the whole request from anyone without it who sends the key at all — so leave
 * the key out rather than sending it empty.
 */
export type UpdateStaffPayload = Partial<CreateStaffPayload> & {
  email?: string | null;
  exitedOn?: string | null;
};

export async function listStaffMembers(businessId: string): Promise<StaffMember[]> {
  const { data } = await apiClient.get<StaffMember[]>(`/businesses/${businessId}/staff`);
  return data;
}

/** "Am I a staff member of this business?" — a 404 when not, which is an answer rather than a failure. */
export async function getMyStaffMember(businessId: string): Promise<MyStaffMember> {
  const { data } = await apiClient.get<MyStaffMember>(`/businesses/${businessId}/staff/me`);
  return data;
}

export async function getStaffMember(businessId: string, staffMemberId: string): Promise<StaffMember> {
  const { data } = await apiClient.get<StaffMember>(`/businesses/${businessId}/staff/${staffMemberId}`);
  return data;
}

export async function createStaffMember(businessId: string, payload: CreateStaffPayload): Promise<StaffMember> {
  const { data } = await apiClient.post<StaffMember>(`/businesses/${businessId}/staff`, payload);
  return data;
}

export async function updateStaffMember(
  businessId: string,
  staffMemberId: string,
  payload: UpdateStaffPayload
): Promise<StaffMember> {
  const { data } = await apiClient.patch<StaffMember>(`/businesses/${businessId}/staff/${staffMemberId}`, payload);
  return data;
}

/** Not a delete: attendance and past payslips survive, and the person leaves the roster. */
export async function setStaffActive(businessId: string, staffMemberId: string, active: boolean): Promise<StaffMember> {
  const action = active ? 'reactivate' : 'deactivate';
  const { data } = await apiClient.post<StaffMember>(`/businesses/${businessId}/staff/${staffMemberId}/${action}`);
  return data;
}
