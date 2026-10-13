import { describe, expect, it } from 'vitest';
import { membershipAs } from '@/test/fixtures';
import { resolveDeepLink } from './deepLink';

describe('resolveDeepLink', () => {
  it('opens the order a notification is about', () => {
    expect(
      resolveDeepLink(membershipAs('CASHIER'), { route: 'SupplyOrderDetail', params: { supplyOrderId: 'o-42' } })
    ).toBe('/supply-orders/o-42');
  });

  it('opens the pages the backend links to', () => {
    expect(resolveDeepLink(membershipAs('STAFF'), { route: 'Attendance' })).toBe('/attendance');
    expect(resolveDeepLink(membershipAs('ACCOUNTANT'), { route: 'SupplyPayments' })).toBe('/payments');
  });

  it('goes Home when the role can no longer open the page', () => {
    expect(resolveDeepLink(membershipAs('STAFF'), { route: 'SupplyPayments' })).toBe('/');
  });

  it('goes Home for a route this build does not know, or a link missing its id', () => {
    expect(resolveDeepLink(membershipAs('OWNER'), { route: 'SomethingNew' })).toBe('/');
    expect(resolveDeepLink(membershipAs('OWNER'), { route: 'SupplyOrderDetail' })).toBe('/');
    expect(resolveDeepLink(membershipAs('OWNER'), null)).toBe('/');
  });
});
