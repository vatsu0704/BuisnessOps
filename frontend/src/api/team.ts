import { apiClient } from '@/api/client';
import type { MembershipRole } from '@/types/user';
import type { CashierConflicts, InviteLookupResult, PendingInvite, TeamMember } from '@/types/team';

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
  /**
   * Requirement 18 — the admin has been shown whose branch this takes and said
   * yes. Without it, inviting a cashier onto an occupied branch comes back 409
   * naming the current holder, and nothing is written.
   */
  confirm?: boolean;
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

/**
 * Widen a branch-scoped member's reach by one branch — or, for a cashier, move
 * them to it, since a cashier holds exactly one (requirement 18).
 *
 * `confirm` is the swap. Without it an assignment that would put two cashiers on
 * a branch, or two branches on a cashier, returns 409 with the blocker named in
 * `params`, so the app can ask before anything moves.
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

/**
 * Which branches have more than one cashier, and which cashiers do not have
 * exactly one branch. Read-only: it reports, it does not fix.
 */
export async function listCashierConflicts(businessId: string): Promise<CashierConflicts> {
  const { data } = await apiClient.get<CashierConflicts>(`/businesses/${businessId}/cashier-conflicts`);
  return data;
}

/** Narrow a branch-scoped member's scope by one branch. */
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
