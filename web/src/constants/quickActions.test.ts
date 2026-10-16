import { describe, expect, it } from 'vitest';
import en from '@shared/i18n/locales/en.json';
import { QUICK_ACTIONS, isQuickActionVisible, quickActionLabelKey } from '@shared/constants/quickActions';
import { ROUTE_CAPABILITY } from '@shared/navigation/routeCapabilities';
import type { Plan } from '@shared/permissions';
import { ROLES } from '@/permissions';
import { membershipAs } from '@/test/fixtures';
import { hasCapability } from '@/utils/permissions';

/**
 * Home's quick actions (requirement 33) — shared data both apps render. A tile
 * that shows must open, for every role on every plan, or it is a button that
 * leads to a refusal.
 */
const PLANS: Plan[] = ['STARTER', 'GROWTH', 'FRANCHISE'];

function onPlan(role: (typeof ROLES)[number], plan: Plan) {
  const membership = membershipAs(role);
  return {
    ...membership,
    business: {
      ...membership.business,
      subscription: {
        plan,
        status: 'ACTIVE' as const,
        state: 'FULL' as const,
        endsAt: null,
        graceEndsAt: null,
        paidBranchCount: null,
      },
    },
  };
}

describe('quick actions', () => {
  it('only shows a tile whose screen opens, for every role on every plan', () => {
    for (const plan of PLANS) {
      for (const role of ROLES) {
        const membership = onPlan(role, plan);
        const has = (capability: Parameters<typeof hasCapability>[1]) => hasCapability(membership, capability);
        for (const action of QUICK_ACTIONS) {
          if (!isQuickActionVisible(action, has)) continue;
          const gate = (ROUTE_CAPABILITY as Record<string, Parameters<typeof hasCapability>[1] | undefined>)[action.route];
          if (gate) expect(has(gate), `${role} on ${plan} sees ${action.key}`).toBe(true);
        }
      }
    }
  });

  it('gives the till to whoever bills, and reports to nobody who only bills', () => {
    const has = (role: (typeof ROLES)[number]) => (capability: Parameters<typeof hasCapability>[1]) =>
      hasCapability(onPlan(role, 'FRANCHISE'), capability);
    const keysFor = (role: (typeof ROLES)[number]) =>
      QUICK_ACTIONS.filter((action) => isQuickActionVisible(action, has(role))).map((action) => action.key);

    expect(keysFor('CASHIER')).toContain('billing');
    expect(keysFor('CASHIER')).not.toContain('reports');
    expect(keysFor('OWNER')).toEqual(expect.arrayContaining(['billing', 'reports', 'paymentHistory']));
    expect(keysFor('OWNER')).not.toContain('supply');
    expect(keysFor('WAREHOUSE')).not.toContain('paymentHistory');
    expect(keysFor('DELIVERY_AGENT')).toContain('deliveries');
  });

  it('has a label in the source language for every tile', () => {
    const labels = (en as { quickActions: Record<string, string> }).quickActions;
    for (const action of QUICK_ACTIONS) {
      const key = quickActionLabelKey(action.key).split('.')[1];
      expect(labels[key], action.key).toBeTruthy();
    }
  });
});
