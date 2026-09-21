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

/**
 * Withdraw an invite that was never accepted. The row is kept as REVOKED
 * rather than deleted, so inviting the same address again simply revives it.
 */
export async function revokeInvite(businessId: string, inviteId: string): Promise<void> {
  await apiClient.delete(`/businesses/${businessId}/invites/${inviteId}`);
}

/**
 * End someone's access to this business. A soft revoke server-side: the
 * membership row stays (it carries the audit trail of every attendance day
 * they marked) and its status becomes REVOKED, which the API refuses on the
 * revoked person's very next request.
 *
 * Re-inviting the same email is the way back — there is no separate reinstate.
 */
export async function revokeMembership(businessId: string, membershipId: string): Promise<void> {
  await apiClient.post(`/businesses/${businessId}/memberships/${membershipId}/revoke`);
}

/** Narrow a MANAGER/STAFF member's scope by one branch. */
export async function removeBranchAccess(
  businessId: string,
  membershipId: string,
  branchId: string
): Promise<void> {
  await apiClient.delete(`/businesses/${businessId}/memberships/${membershipId}/branch-access/${branchId}`);
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
