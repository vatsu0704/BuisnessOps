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
