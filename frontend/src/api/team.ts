import { apiClient } from '@/api/client';
import type { MembershipRole } from '@/types/user';
import type { TeamMember } from '@/types/team';

export async function listMemberships(businessId: string): Promise<TeamMember[]> {
  const { data } = await apiClient.get<TeamMember[]>(`/businesses/${businessId}/memberships`);
  return data;
}

export interface InviteMemberPayload {
  email: string;
  role: MembershipRole;
}

export async function inviteMember(businessId: string, payload: InviteMemberPayload): Promise<TeamMember> {
  const { data } = await apiClient.post<TeamMember>(`/businesses/${businessId}/memberships`, payload);
  return data;
}

export async function grantBranchAccess(businessId: string, membershipId: string, branchId: string): Promise<void> {
  await apiClient.post(`/businesses/${businessId}/memberships/${membershipId}/branch-access`, { branchId });
}
