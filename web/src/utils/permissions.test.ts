import { describe, expect, it } from 'vitest';
import { membershipAs, userWith } from '@/test/fixtures';
import { activeMembership, hasCapability, hasNoActiveBusiness, passesAnyGate, passesGate } from './permissions';

describe('passesGate', () => {
  it('asks for the capability', () => {
    expect(passesGate(membershipAs('CASHIER'), { capability: 'counterOrder:create' })).toBe(true);
    expect(passesGate(membershipAs('DELIVERY_AGENT'), { capability: 'counterOrder:create' })).toBe(false);
  });

  it('hides what is not this person’s job, even when they may do it', () => {
    const deliveries = { capability: 'supplyOrder:deliver', hideWhen: { holds: 'supplyOrder:fulfil' } } as const;
    expect(passesGate(membershipAs('DELIVERY_AGENT'), deliveries)).toBe(true);
    // An owner holds every capability, and does not carry the run.
    expect(passesGate(membershipAs('OWNER'), deliveries)).toBe(false);
  });

  it('keeps it for whoever also holds `unless`', () => {
    const gate = {
      capability: 'product:view',
      hideWhen: { holds: 'supplyOrder:create', unless: 'analytics:viewBusiness' },
    } as const;
    expect(passesGate(membershipAs('CASHIER'), gate)).toBe(false);
    expect(passesGate(membershipAs('ADMIN'), gate)).toBe(true);
  });

  it('treats an empty gate list as everyone, and any one gate as enough', () => {
    expect(passesAnyGate(membershipAs('STAFF'), null)).toBe(true);
    expect(
      passesAnyGate(membershipAs('WAREHOUSE'), [
        { capability: 'supplyPayment:settle' },
        { capability: 'supplyPayment:verify' },
      ])
    ).toBe(true);
  });
});

describe('memberships', () => {
  it('holds nothing once revoked', () => {
    expect(hasCapability(membershipAs('OWNER', 'REVOKED'), 'team:view')).toBe(false);
  });

  it('honours the remembered business only while it is active', () => {
    const user = userWith([
      { ...membershipAs('OWNER'), businessId: 'b1' },
      { ...membershipAs('CASHIER', 'REVOKED'), id: 'm2', businessId: 'b2' },
    ]);
    expect(activeMembership(user, 'b2')?.businessId).toBe('b1');
    expect(hasNoActiveBusiness(userWith([membershipAs('STAFF', 'REVOKED')]))).toBe(true);
  });
});
