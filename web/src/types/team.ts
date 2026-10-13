import type { MembershipRole } from './user';

/** A pending invite for an email that has no account yet. */
export interface InviteLookupResult {
  businessName: string;
  role: MembershipRole;
}
