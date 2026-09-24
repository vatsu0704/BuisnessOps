import type { Role } from '@/permissions';

/**
 * Derived from the permission matrix rather than written out by hand.
 *
 * A hand-maintained union is a lie waiting to happen: the API returns whatever
 * the Postgres enum holds, the value is cast on an API response so TypeScript
 * never checks it, and a role the app has not been told about silently falls
 * through every `Set<MembershipRole>.has()` as false — a cashier would get a
 * STAFF-shaped app with no error anywhere. Derived, adding a role to the
 * backend catalog updates this union on the same commit, and
 * `npm run lint:permissions` fails if the mirror drifts from the backend.
 */
export type MembershipRole = Role;
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
