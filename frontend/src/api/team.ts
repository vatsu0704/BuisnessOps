import { apiClient } from '@/api/client';
import type { MembershipRole } from '@/types/user';
import type { InviteLookupResult, PendingInvite, TeamMember } from '@/types/team';

export async function listMemberships(businessId: string): Promise<TeamMember[]> {
  const { data } = await apiClient.get<TeamMember[]>(`/businesses/${businessId}/memberships`);
  return data;
}

export async function listInvites(businessId: string): Promise<PendingInvite[]> {
  const { data } = await apiClient.get<PendingInvite[]>(`/businesses/${businessId}/invites`);
  return data;
}

export interface InviteMemberPayload {
  email: string;
  role: MembershipRole;
  branchIds?: string[];
}

export interface InviteMemberResult {
  pending: boolean;
}

/**
 * One call handles both cases: if the email already has an account they
 * join immediately (pending: false); otherwise a pending invite is created
 * and claimed automatically the moment that email signs up (pending: true).
 * Branch access, when relevant, is granted in this same call — no separate
 * grantBranchAccess follow-up needed.
 */
export async function inviteMember(businessId: string, payload: InviteMemberPayload): Promise<InviteMemberResult> {
  const { data } = await apiClient.post<InviteMemberResult>(`/businesses/${businessId}/memberships`, payload);
  return data;
}

/** Public — no auth — used by the signup screen before an account exists. */
export async function lookupInvite(email: string): Promise<InviteLookupResult | null> {
  try {
    const { data } = await apiClient.get<InviteLookupResult>('/invites/lookup', { params: { email } });
    return data;
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) return null;
    throw err;
  }
}
