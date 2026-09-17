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
