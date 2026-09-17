import { apiClient } from '@/api/client';
import type { StaffMember } from '@/types/staffing';

export interface CreateStaffPayload {
  branchId: string;
  name: string;
  role: string;
  baseSalary?: number;
  /** Optional — links this StaffMember to an existing account by email, resolved server-side. */
  email?: string;
}

export async function listStaffMembers(businessId: string): Promise<StaffMember[]> {
  const { data } = await apiClient.get<StaffMember[]>(`/businesses/${businessId}/staff`);
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
