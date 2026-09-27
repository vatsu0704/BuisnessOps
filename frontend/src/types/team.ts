import type { MembershipRole, MembershipStatus } from './user';

export interface TeamBranchAccess {
  id: string;
  branch: { id: string; name: string; code: string };
}

export interface TeamMember {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  user: { id: string; name: string | null; email: string };
  branchAccess: TeamBranchAccess[];
}

/** Someone invited who has no BizIQ account yet — see invite.service.js. */
export interface PendingInvite {
  id: string;
  email: string;
  role: MembershipRole;
  branchIds: string[];
  invitedAt: string;
}

/** What the signup screen learns from GET /invites/lookup, before an account exists. */
export interface InviteLookupResult {
  businessName: string;
  role: MembershipRole;
}

/**
 * Requirement 18's audit — memberships that already break the one-cashier rule.
 *
 * `sharedBranches` is the shape that needs settling: a branch with more than one
 * cashier. `misassignedCashiers` covers both a cashier holding none (a real,
 * recoverable state) and one holding several. Nothing is rewritten by reading
 * this — an admin decides who keeps which branch, because nothing but a person
 * knows which cashier is the one still turning up.
 */
export interface CashierConflicts {
  sharedBranches: {
    branch: { id: string; name: string; code: string };
    cashiers: { membershipId: string; name: string | null; email: string }[];
  }[];
  misassignedCashiers: {
    membershipId: string;
    name: string | null;
    email: string;
    branchCount: number;
  }[];
}
