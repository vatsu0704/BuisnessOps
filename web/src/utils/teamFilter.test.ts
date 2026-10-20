import { describe, expect, it } from 'vitest';
import { filterInvites, filterMembers, memberReachesBranch } from '@shared/utils/teamFilter';
import type { PendingInvite, TeamMember } from '@shared/types/team';

function member(
  id: string,
  name: string | null,
  email: string,
  role: TeamMember['role'],
  branches: { id: string; name: string }[] = []
): TeamMember {
  return {
    id,
    role,
    status: 'ACTIVE',
    user: { id: `u-${id}`, name, email },
    branchAccess: branches.map((b) => ({ id: `ba-${id}-${b.id}`, branch: { ...b, code: b.id.toUpperCase() } })),
  };
}

const team: TeamMember[] = [
  member('m1', 'Rajesh Patel', 'rajesh@apexretail.in', 'ADMIN'),
  member('m2', 'Hari Prasad', 'hari@apexretail.in', 'CASHIER', [{ id: 'sg', name: 'SG Highway' }]),
  member('m3', 'Sita Shah', 'sita@apexretail.in', 'STAFF', [{ id: 'pr', name: 'Prahlad Nagar' }]),
  member('m4', null, 'newjoiner@apexretail.in', 'STAFF', [{ id: 'sg', name: 'SG Highway' }]),
];

const ids = (members: readonly TeamMember[]) => members.map((m) => m.id);

describe('finding a team member', () => {
  it('finds a person by name', () => {
    expect(ids(filterMembers(team, { query: 'sita', branchId: null }))).toEqual(['m3']);
  });

  it('finds somebody who has not signed in yet by their email', () => {
    expect(ids(filterMembers(team, { query: 'newjoiner', branchId: null }))).toEqual(['m4']);
  });

  it('ranks a name match above an email match', () => {
    const shared = [
      member('a', 'Someone Else', 'hari@other.in', 'STAFF'),
      member('b', 'Hari Prasad', 'hp@apexretail.in', 'STAFF'),
    ];
    expect(ids(filterMembers(shared, { query: 'hari', branchId: null }))[0]).toBe('b');
  });

  it('keeps everybody when nothing is typed and no branch is chosen', () => {
    expect(ids(filterMembers(team, { query: '', branchId: null }))).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  describe('by branch', () => {
    it('keeps the people granted that branch', () => {
      expect(ids(filterMembers(team, { query: '', branchId: 'pr' }))).toEqual(['m1', 'm3']);
    });

    /**
     * The one that is easy to get wrong: an admin or a manager holds no
     * BranchAccess row at all, so filtering on the rows alone would hide the
     * people most likely to be looked up.
     */
    it('keeps a role that reaches every branch without holding a single row', () => {
      expect(memberReachesBranch(team[0], 'sg')).toBe(true);
      expect(team[0].branchAccess).toHaveLength(0);
      expect(ids(filterMembers(team, { query: '', branchId: 'sg' }))).toContain('m1');
    });

    it('combines with the search', () => {
      expect(ids(filterMembers(team, { query: 'hari', branchId: 'pr' }))).toEqual([]);
      expect(ids(filterMembers(team, { query: 'hari', branchId: 'sg' }))).toEqual(['m2']);
    });
  });

  describe('pending invites', () => {
    const invites: PendingInvite[] = [
      { id: 'i1', email: 'newcook@apexretail.in', role: 'STAFF', branchIds: ['sg'], invitedAt: '' },
      { id: 'i2', email: 'newtill@apexretail.in', role: 'CASHIER', branchIds: ['pr'], invitedAt: '' },
    ];

    it('matches an invite on its email', () => {
      expect(filterInvites(invites, { query: 'newcook', branchId: null }).map((i) => i.id)).toEqual(['i1']);
    });

    it('filters an invite by the branch it will grant', () => {
      expect(filterInvites(invites, { query: '', branchId: 'pr' }).map((i) => i.id)).toEqual(['i2']);
    });
  });
});
