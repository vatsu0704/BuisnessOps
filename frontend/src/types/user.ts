import type { Plan, Role } from '../permissions';

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

/**
 * Requirement 28 — where a business's subscription stands, as every member
 * receives it on their membership.
 *
 * - FULL: inside the trial or the paid period.
 * - GRACE: the period has ended; nothing changes for GRACE_DAYS except that the
 *   owner is told.
 * - READ_ONLY: grace is over, or the plan was cancelled. Everything can be read
 *   and exported, nothing new saved.
 */
export type SubscriptionState = 'FULL' | 'GRACE' | 'READ_ONLY';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'CANCELLED';

export interface SubscriptionView {
  plan: Plan;
  /** null when the business has no subscription on record. */
  status: SubscriptionStatus | null;
  state: SubscriptionState;
  /** When the trial or the paid period ends. null for an open-ended plan. */
  endsAt: string | null;
  graceEndsAt: string | null;
  /** Trading branches paid for. null during the trial, which has no limit. */
  paidBranchCount: number | null;
}

/** The owner's Plan screen: the subscription, the branches in use, and every plan's contents. */
export interface SubscriptionSummary extends SubscriptionView {
  interval: 'MONTHLY' | 'YEARLY' | null;
  billedBranchCount: number;
  /** Who to write to about changing the plan; null until the company's details are set. */
  contactEmail: string | null;
  plans: { code: Plan; capabilities: string[] | '*'; features: string[]; roles: string[] }[];
}

export interface Membership {
  id: string;
  businessId: string;
  role: MembershipRole;
  status: MembershipStatus;
  /**
   * Enough of the business to name it in the switcher. The full Business
   * record is fetched only for the one being acted under - listing every
   * business someone belongs to must not cost one request per membership.
   *
   * `subscription` is what the app gates on beside the role (requirement 28).
   * Optional because a server from before plans does not send it, and then the
   * plan narrows nothing — that server enforces no plan either.
   */
  business: { id: string; name: string; subscription?: SubscriptionView };
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
