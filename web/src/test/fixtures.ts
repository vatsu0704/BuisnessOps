import type { Role } from '@/permissions';
import type { Membership, User } from '@/types/user';

/** One ACTIVE membership in business b1 with this role. */
export function membershipAs(role: Role, status: Membership['status'] = 'ACTIVE'): Membership {
  return { id: `m-${role}`, businessId: 'b1', role, status, business: { id: 'b1', name: 'Apex Retail Stores' } };
}

export function userWith(memberships: Membership[]): User {
  return {
    id: 'u1',
    email: 'rajesh@apexretail.in',
    name: 'Rajesh Patel',
    phone: null,
    preferredLocale: 'EN',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    memberships,
  };
}
