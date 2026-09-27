import { apiClient } from '@/api/client';
import type { MyStaffMember, StaffMember } from '@/types/staffing';

export interface CreateStaffPayload {
  branchId: string;
  name: string;
  role: string;
  baseSalary?: number;
  /** Optional — links this StaffMember to an existing account by email, resolved server-side. */
  email?: string;
  phone?: string;
  employeeCode?: string;
  hiredOn?: string;
  notes?: string;
}

/**
 * Every field optional. `email: null` unlinks the app account; omitting the key
 * leaves it alone. `baseSalary` needs the `staff:setPay` capability and the
 * server 403s anyone without it who sends the key at all — so omit it rather
 * than sending undefined, or the whole update fails and not just the pay.
 */
export type UpdateStaffPayload = Partial<CreateStaffPayload> & {
  email?: string | null;
  exitedOn?: string | null;
};

export async function listStaffMembers(businessId: string): Promise<StaffMember[]> {
  const { data } = await apiClient.get<StaffMember[]>(`/businesses/${businessId}/staff`);
  return data;
}

/**
 * "Am I a staff member of this business?" — 404 when not.
 *
 * Replaces the old trick of calling a *month* endpoint and reading its 404,
 * which conflated "no attendance this month" with "not staff here".
 */
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
  const { data } = await apiClient.patch<StaffMember>(
    `/businesses/${businessId}/staff/${staffMemberId}`,
    payload
  );
  return data;
}

/** Not a delete: attendance and past payslips survive, the person leaves the roster. */
export async function setStaffActive(
  businessId: string,
  staffMemberId: string,
  active: boolean
): Promise<StaffMember> {
  const action = active ? 'reactivate' : 'deactivate';
  const { data } = await apiClient.post<StaffMember>(
    `/businesses/${businessId}/staff/${staffMemberId}/${action}`
  );
  return data;
}
