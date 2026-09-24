import type { Capability } from '@/permissions';
import { hasCapability } from '@/utils/permissions';
import type { Membership } from '@/types/user';
import type { AppStackParamList } from './AppNavigator';

/**
 * Which capability a route needs before it is registered at all.
 *
 * The strings here are the **same** ones the backend guards the matching
 * endpoints with, which is the whole point: a route this table lets a person
 * reach is a route whose requests will succeed. Two separate lists of role
 * names would agree on the day they were written and drift silently after.
 *
 * A route absent from this map is open to everyone — Home, Settings and the
 * tab host itself, plus the self-service screens (Attendance) that every role
 * uses for their own record.
 *
 * `AppStackParamList` stays complete and un-narrowed. Making the *type* depend
 * on the role would force a generic param list onto every shared screen and
 * every component that navigates, which is a far worse explosion than this one
 * table. The type describes what the app can do; this describes what this
 * person can do.
 */
export const ROUTE_CAPABILITY: Partial<Record<keyof AppStackParamList, Capability>> = {
  AddBranch: 'branch:create',
  BranchSettings: 'branch:update',
  Upload: 'dataSource:manage',
  AddStaff: 'staff:create',
  EditStaff: 'staff:update',
  StaffDetail: 'staff:viewOthers',
  PayrollRun: 'payroll:run',
  WorkCalendar: 'workCalendar:manage',
  Team: 'team:view',
  InviteMember: 'team:invite',
  Products: 'product:view',
  AddProduct: 'product:manage',
  EditProduct: 'product:manage',
};

/** Is this route one the current membership may open? */
export function canOpenRoute(
  membership: Membership | undefined,
  route: keyof AppStackParamList
): boolean {
  const required = ROUTE_CAPABILITY[route];
  return !required || hasCapability(membership, required);
}

/**
 * Where a deep link should actually land.
 *
 * A push notification names a route that may no longer be open to its
 * recipient: they were demoted since it was sent, or they are currently acting
 * under a different business. Dispatching into an unregistered route is a
 * silent no-op in production — a tap that does nothing, which nobody reports —
 * so resolve it to Home instead of trusting the payload.
 */
export function resolveDeepLink(
  membership: Membership | undefined,
  route: keyof AppStackParamList,
  params?: object
): { route: keyof AppStackParamList; params?: object } {
  if (!canOpenRoute(membership, route)) return { route: 'Tabs' };
  return { route, params };
}
