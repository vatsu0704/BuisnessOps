import type { Capability } from '@/permissions';
import { hasCapability } from '@/utils/permissions';
import type { Membership } from '@/types/user';
import type { AppStackParamList } from './AppNavigator';
import { ROUTE_CAPABILITY as GATES, type GatedRoute } from './routeCapabilities';

/**
 * Which capability a route needs before it is registered at all. The table
 * itself lives in `routeCapabilities.ts` as pure data, because the web app opens
 * its pages on the same rules; this file is where it meets the navigator.
 *
 * `AppStackParamList` stays complete and un-narrowed. Making the *type* depend
 * on the role would force a generic param list onto every shared screen and
 * every component that navigates, which is a far worse explosion than this one
 * table. The type describes what the app can do; this describes what this
 * person can do.
 */
export const ROUTE_CAPABILITY: Partial<Record<keyof AppStackParamList, Capability>> = GATES;

/**
 * Every gated route is a real route. The data file cannot name the navigator's
 * type without dragging React Native into the web build, so the check is made
 * here: a renamed or misspelt route in it fails `tsc` on this line.
 */
type UnknownGatedRoute = Exclude<GatedRoute, keyof AppStackParamList>;
export const everyGatedRouteExists: [UnknownGatedRoute] extends [never] ? true : UnknownGatedRoute = true;

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
