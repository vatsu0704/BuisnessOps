import { describe, expect, it } from 'vitest';
import { ROUTE_CAPABILITY } from '@shared/navigation/routeCapabilities';
import { NAV_GROUPS, SETTINGS_ENTRY } from '@/constants/navigation';
import { ROLES } from '@/permissions';
import { membershipAs } from '@/test/fixtures';
import { passesAnyGate } from '@/utils/permissions';
import { PAGES } from './pages';
import { canOpenRoute, pathTo, requiredCapability, ROUTES, type RouteKey } from './paths';

const KEYS = Object.keys(ROUTES) as RouteKey[];

describe('route access', () => {
  it('opens every app screen on the capability the app opens it on', () => {
    for (const key of KEYS) {
      const access = ROUTES[key].access;
      if (access && 'appRoute' in access) {
        expect(requiredCapability(key), key).toBe(ROUTE_CAPABILITY[access.appRoute]);
      }
    }
  });

  it('gives every gated app screen a page on the web', () => {
    const mapped = new Set(
      KEYS.flatMap((key) => {
        const access = ROUTES[key].access;
        return access && 'appRoute' in access ? [access.appRoute] : [];
      })
    );
    for (const appRoute of Object.keys(ROUTE_CAPABILITY)) {
      expect(mapped.has(appRoute as keyof typeof ROUTE_CAPABILITY), appRoute).toBe(true);
    }
  });

  it('only shows a role sidebar entries it can open', () => {
    const entries = [...NAV_GROUPS.flatMap((g) => g.entries), SETTINGS_ENTRY];
    for (const role of ROLES) {
      const membership = membershipAs(role);
      for (const entry of entries) {
        if (passesAnyGate(membership, entry.gates)) {
          expect(canOpenRoute(membership, entry.route), `${role} sees ${entry.key}`).toBe(true);
        }
      }
    }
  });

  it('opens nothing gated for a revoked membership', () => {
    const revoked = membershipAs('OWNER', 'REVOKED');
    expect(canOpenRoute(revoked, 'team')).toBe(false);
    expect(canOpenRoute(revoked, 'home')).toBe(true);
  });

  it('refuses the three pages whose web gate was wrong before', () => {
    // Expenses opens on viewing, not logging: the warehouse desk reads them.
    expect(canOpenRoute(membershipAs('WAREHOUSE'), 'expenses')).toBe(true);
    expect(canOpenRoute(membershipAs('WAREHOUSE'), 'addExpense')).toBe(false);
    // The catalog opens on viewing it: the accountant reads prices.
    expect(canOpenRoute(membershipAs('ACCOUNTANT'), 'supply')).toBe(true);
    // Payments opens on confirming them: the desk confirms.
    expect(canOpenRoute(membershipAs('WAREHOUSE'), 'payments')).toBe(true);
  });

  it('has a page or placeholder for every route', () => {
    for (const key of KEYS) expect(PAGES[key], key).toBeDefined();
  });
});

describe('pathTo', () => {
  it('fills the parameters in', () => {
    expect(pathTo('staffDetail', { staffMemberId: 's-1' })).toBe('/staff/s-1');
    expect(pathTo('payrollRun', { year: 2026, month: 10 })).toBe('/payroll/2026/10');
    expect(pathTo('reports')).toBe('/reports');
  });
});
