import { describe, expect, it } from 'vitest';
import {
  BRANCH_SCOPED_ROLES,
  INVITABLE_ROLES,
  asAssignmentConflict,
  asBranchConflict,
  canRemoveMember,
  cashierByBranch,
  hasCashierConflicts,
  isSingleBranchRole,
  reachesEveryBranch,
} from '@shared/utils/teamRules';
import { roleHas } from '@/permissions';
import type { TeamMember } from '@/types/team';
import type { MembershipRole } from '@/types/user';

/**
 * The Team and Invite rules both apps read (`frontend/src/utils/teamRules.ts`).
 * Each expectation is asked of the matrix rather than written as a role list, so a
 * role moved in the backend catalog moves these with it.
 */

const member = (
  id: string,
  role: MembershipRole,
  branches: string[] = [],
  status: TeamMember['status'] = 'ACTIVE'
): TeamMember => ({
  id,
  role,
  status,
  user: { id: `u-${id}`, name: id, email: `${id}@example.com` },
  branchAccess: branches.map((b) => ({ id: `${id}-${b}`, branch: { id: b, name: b, code: b } })),
});

const refusal = (status: number, code: string, params: Record<string, unknown>) => ({
  response: { status, data: { code, params } },
});

describe('who may be invited, and to what', () => {
  it('never offers the owner, and offers every other role in the matrix', () => {
    expect(INVITABLE_ROLES).not.toContain('OWNER');
    expect(INVITABLE_ROLES.length).toBeGreaterThan(0);
  });

  it('asks for branches exactly for the roles whose reach is not every branch', () => {
    for (const role of INVITABLE_ROLES) {
      expect(BRANCH_SCOPED_ROLES.has(role)).toBe(!roleHas(role, 'branch:allAccess'));
      expect(reachesEveryBranch(role)).toBe(roleHas(role, 'branch:allAccess'));
    }
  });

  it('limits exactly one role to a single branch, and it is a branch-scoped one', () => {
    const single = INVITABLE_ROLES.filter(isSingleBranchRole);
    expect(single).toHaveLength(1);
    expect(BRANCH_SCOPED_ROLES.has(single[0])).toBe(true);
  });
});

describe('cashierByBranch', () => {
  const cashier = INVITABLE_ROLES.find(isSingleBranchRole)!;

  it('names the cashier holding each branch', () => {
    const map = cashierByBranch([member('hari', cashier, ['b1']), member('sita', cashier, ['b2'])]);
    expect(map.get('b1')?.id).toBe('hari');
    expect(map.get('b2')?.id).toBe('sita');
  });

  it('does not let a revoked cashier keep a branch looking taken', () => {
    const map = cashierByBranch([member('hari', cashier, ['b1'], 'REVOKED')]);
    expect(map.has('b1')).toBe(false);
  });

  it('ignores everyone who is not the single-branch role', () => {
    const other = INVITABLE_ROLES.find((r) => !isSingleBranchRole(r) && BRANCH_SCOPED_ROLES.has(r))!;
    expect(cashierByBranch([member('ravi', other, ['b1'])]).size).toBe(0);
  });
});

describe('hasCashierConflicts', () => {
  it('is false for no report and for an empty one', () => {
    expect(hasCashierConflicts(null)).toBe(false);
    expect(hasCashierConflicts({ sharedBranches: [], misassignedCashiers: [] })).toBe(false);
  });

  it('is true when a cashier has no branch', () => {
    expect(
      hasCashierConflicts({
        sharedBranches: [],
        misassignedCashiers: [{ membershipId: 'm1', name: 'Hari', email: 'h@x.in', branchCount: 0 }],
      })
    ).toBe(true);
  });
});

describe("reading requirement 18's 409s", () => {
  it('recognises a branch that already has a cashier, with who and what it vacates', () => {
    expect(
      asAssignmentConflict(
        refusal(409, 'BRANCH_ALREADY_HAS_CASHIER', { branch: 'MG Road', cashier: 'Hari', currentBranch: 'Station' })
      )
    ).toEqual({ code: 'BRANCH_ALREADY_HAS_CASHIER', branch: 'MG Road', cashier: 'Hari', currentBranch: 'Station' });
  });

  it('recognises a cashier who already has a branch', () => {
    expect(
      asAssignmentConflict(refusal(409, 'CASHIER_ALREADY_HAS_BRANCH', { branch: 'MG Road', currentBranch: 'Station' }))
    ).toMatchObject({ code: 'CASHIER_ALREADY_HAS_BRANCH', currentBranch: 'Station' });
  });

  it('leaves every other failure to the ordinary error banner', () => {
    expect(asAssignmentConflict(refusal(403, 'PERMISSION_DENIED', {}))).toBeNull();
    expect(asAssignmentConflict(refusal(409, 'SOMETHING_ELSE', { branch: 'x' }))).toBeNull();
    expect(asAssignmentConflict(new Error('offline'))).toBeNull();
    expect(asAssignmentConflict(null)).toBeNull();
  });

  it('asks at the invite door only when the holder is named', () => {
    expect(asBranchConflict(refusal(409, 'BRANCH_ALREADY_HAS_CASHIER', { branch: 'MG Road', cashier: 'Hari' }))).toEqual({
      branch: 'MG Road',
      cashier: 'Hari',
    });
    expect(asBranchConflict(refusal(409, 'BRANCH_ALREADY_HAS_CASHIER', { branch: 'MG Road' }))).toBeNull();
  });
});

describe('canRemoveMember', () => {
  const owner = { id: 'o', role: 'OWNER' as MembershipRole };
  const manager = { id: 'm', role: 'MANAGER' as MembershipRole };

  it('never offers removing yourself — which also keeps a business from losing its only owner', () => {
    expect(canRemoveMember(owner, member('o', 'OWNER'))).toBe(false);
  });

  it('never offers removing someone who outranks you', () => {
    expect(canRemoveMember(manager, member('a', 'ADMIN'))).toBe(false);
    expect(canRemoveMember(manager, member('o', 'OWNER'))).toBe(false);
  });

  it('offers removing an equal or a junior, while they are active', () => {
    expect(canRemoveMember(manager, member('m2', 'MANAGER'))).toBe(true);
    expect(canRemoveMember(owner, member('s', 'STAFF'))).toBe(true);
    expect(canRemoveMember(owner, member('s', 'STAFF', [], 'REVOKED'))).toBe(false);
  });

  it('offers nothing with no viewer', () => {
    expect(canRemoveMember(undefined, member('s', 'STAFF'))).toBe(false);
  });
});
