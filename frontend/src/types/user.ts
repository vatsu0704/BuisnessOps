export type MembershipRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'REVOKED';
export type Locale = 'EN' | 'HI' | 'GU' | 'MR';

export interface Membership {
  id: string;
  businessId: string;
  role: MembershipRole;
  status: MembershipStatus;
  /**
   * Enough of the business to name it in the switcher. The full Business
   * record is fetched only for the one being acted under - listing every
   * business someone belongs to must not cost one request per membership.
   */
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
