import { describe, expect, it } from 'vitest';
import { planBanner } from '@shared/constants/plans';
import { membershipAs } from '@/test/fixtures';
import type { Membership, SubscriptionView } from '@/types/user';
import { hasCapability, hasPlanFeature } from './permissions';

// Requirement 28: what someone may do is their role AND their business's plan —
// the same two questions the server asks — and Home's banner speaks only when
// there is something to say, to the people who can act on it.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-13T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function subscription(overrides: Partial<SubscriptionView> = {}): SubscriptionView {
  return {
    plan: 'FRANCHISE',
    status: 'ACTIVE',
    state: 'FULL',
    endsAt: inDays(30),
    graceEndsAt: inDays(37),
    paidBranchCount: 3,
    ...overrides,
  };
}

function on(role: Parameters<typeof membershipAs>[0], sub: SubscriptionView | undefined): Membership {
  const membership = membershipAs(role);
  return { ...membership, business: { ...membership.business, subscription: sub } };
}

describe('role AND plan', () => {
  it('narrows even the owner to what the plan unlocks', () => {
    const owner = on('OWNER', subscription({ plan: 'STARTER' }));
    expect(hasCapability(owner, 'counterOrder:create')).toBe(true);
    expect(hasCapability(owner, 'supplyOrder:create')).toBe(false);
    expect(hasCapability(owner, 'analytics:viewBusiness')).toBe(false);
  });

  it('never grants what the role lacks, whatever the plan', () => {
    expect(hasCapability(on('CASHIER', subscription({ plan: 'FRANCHISE' })), 'team:invite')).toBe(false);
  });

  it('keeps vendors and FOCO branches on Franchise', () => {
    expect(hasPlanFeature(on('OWNER', subscription({ plan: 'GROWTH' })), 'vendors')).toBe(false);
    expect(hasPlanFeature(on('OWNER', subscription({ plan: 'FRANCHISE' })), 'focoBranches')).toBe(true);
  });

  it('narrows nothing for a server that predates plans and sends none', () => {
    expect(hasCapability(on('OWNER', undefined), 'supplyOrder:create')).toBe(true);
    expect(hasPlanFeature(on('OWNER', undefined), 'vendors')).toBe(true);
  });
});

describe('the plan banner', () => {
  it('says nothing while a plan is well inside its period', () => {
    expect(planBanner(subscription(), true, NOW)).toBeNull();
  });

  it('warns the owner, and only the owner, in a trial’s last days', () => {
    const ending = subscription({ status: 'TRIALING', endsAt: inDays(3) });
    expect(planBanner(ending, true, NOW)?.kind).toBe('trialEnding');
    expect(planBanner(ending, false, NOW)).toBeNull();
    expect(planBanner(subscription({ status: 'TRIALING', endsAt: inDays(20) }), true, NOW)).toBeNull();
  });

  it('tells only the owner about grace, and everyone about read-only', () => {
    expect(planBanner(subscription({ state: 'GRACE' }), true, NOW)?.kind).toBe('grace');
    expect(planBanner(subscription({ state: 'GRACE' }), false, NOW)).toBeNull();
    expect(planBanner(subscription({ state: 'READ_ONLY' }), false, NOW)?.kind).toBe('readOnly');
  });
});
