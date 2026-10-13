import type { Role } from '@/permissions';

/** Derived from the permission matrix, so a role added to the backend arrives here by itself. */
export type MembershipRole = Role;
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'REVOKED';
export type Locale = 'EN' | 'HI' | 'GU' | 'MR';

export interface Membership {
  id: string;
  businessId: string;
  role: MembershipRole;
  status: MembershipStatus;
  /** Enough of the business to name it in a switcher. */
  business: { id: string; name: string };
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  preferredLocale: Locale;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
  memberships?: Membership[];
}
