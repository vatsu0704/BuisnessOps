export type MembershipRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'REVOKED';
export type Locale = 'EN' | 'HI' | 'GU';

export interface Membership {
  id: string;
  businessId: string;
  role: MembershipRole;
  status: MembershipStatus;
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
