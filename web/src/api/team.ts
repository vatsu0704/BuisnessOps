import { apiClient } from './client';
import type { MembershipRole } from '@/types/user';
import type { CashierConflicts, InviteLookupResult, PendingInvite, TeamMember } from '@/types/team';

/**
 * The team — the app's `api/team.ts`. Every change is reloaded from the server
 * afterwards (`refreshTeam`) rather than patched in place: the server decides
 * what a revoke means, and guessing it here is how the two drift apart.
 */

export async function listMemberships(businessId: string): Promise<TeamMember[]> {
  const { data } = await apiClient.get<TeamMember[]>(`/businesses/${businessId}/memberships`);
  return data;
}

export async function listInvites(businessId: string): Promise<PendingInvite[]> {
  const { data } = await apiClient.get<PendingInvite[]>(`/businesses/${businessId}/invites`);
  return data;
}

/**
 * Which branches have more than one cashier, and which cashiers do not have
 * exactly one branch (requirement 18). Read-only: it reports, it does not fix.
 */
export async function listCashierConflicts(businessId: string): Promise<CashierConflicts> {
  const { data } = await apiClient.get<CashierConflicts>(`/businesses/${businessId}/cashier-conflicts`);
  return data;
}

export interface InviteMemberPayload {
  email: string;
  role: MembershipRole;
  branchIds?: string[];
  /**
   * Requirement 18 — the admin has been shown whose branch this takes and said
   * yes. Without it, inviting a cashier onto an occupied branch comes back 409
   * naming the current holder, and nothing is written.
   */
  confirm?: boolean;
}

/**
 * One call for both cases: an email that already has an account joins at once
 * (`pending: false`); otherwise a pending invite is created and claimed the
 * moment that email signs up. Branch access is granted in the same call.
 */
export async function inviteMember(businessId: string, payload: InviteMemberPayload): Promise<{ pending: boolean }> {
  const { data } = await apiClient.post<{ pending: boolean }>(`/businesses/${businessId}/memberships`, payload);
  return data;
}

/** Withdraw an invite that was never accepted. Inviting the address again revives it. */
export async function revokeInvite(businessId: string, inviteId: string): Promise<void> {
  await apiClient.delete(`/businesses/${businessId}/invites/${inviteId}`);
}

/**
 * End someone's access to this business. The membership stays, as REVOKED — it
 * carries the record of every day they marked — and the API refuses that person's
 * next request. Re-inviting the same email is the way back.
 */
export async function revokeMembership(businessId: string, membershipId: string): Promise<void> {
  await apiClient.post(`/businesses/${businessId}/memberships/${membershipId}/revoke`);
}

/**
 * Widen a branch-scoped member's reach by one branch — or, for a cashier, move
 * them to it, since a cashier holds exactly one (requirement 18). `confirm` is the
 * swap: without it, a clash comes back 409 with the blocker named in `params`, and
 * the retry is this same request with it.
 */
export async function assignBranchAccess(
  businessId: string,
  membershipId: string,
  branchId: string,
  options: { confirm?: boolean } = {}
): Promise<void> {
  await apiClient.post(`/businesses/${businessId}/memberships/${membershipId}/branch-access`, {
    branchId,
    ...(options.confirm ? { confirm: true } : {}),
  });
}

/** Narrow a branch-scoped member's scope by one branch. */
export async function removeBranchAccess(businessId: string, membershipId: string, branchId: string): Promise<void> {
  await apiClient.delete(`/businesses/${businessId}/memberships/${membershipId}/branch-access/${branchId}`);
}

/**
 * Whether this email already has a pending invite. Null when it has none (a 404),
 * so sign-up can offer "Join <business>" instead of asking for business details.
 */
export async function lookupInvite(email: string): Promise<InviteLookupResult | null> {
  try {
    const { data } = await apiClient.get<InviteLookupResult>('/invites/lookup', { params: { email } });
    return data;
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) return null;
    throw err;
  }
}
