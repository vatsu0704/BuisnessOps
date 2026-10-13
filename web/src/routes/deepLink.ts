import type { Membership } from '@/types/user';
import type { NotificationDeepLink } from '@/types/notification';
import { canOpenRoute, pathTo, ROUTES, type RouteKey } from './paths';

/**
 * Which web page stands for each app route a notification can point at. The
 * parameter names are the same on both sides (`supplyOrderId`), so they carry
 * straight across.
 */
const APP_ROUTE_TO_PAGE: Record<string, RouteKey> = {
  Tabs: 'home',
  Attendance: 'attendance',
  SupplyOrderDetail: 'supplyOrderDetail',
  SupplyOrders: 'supplyOrders',
  SupplyPayments: 'payments',
  SupplyDesk: 'desk',
  SupplyDeliveries: 'deliveries',
  Notifications: 'notifications',
};

/**
 * Where a notification should take this person. A route they can no longer open —
 * demoted since it was sent, or acting under another business — or one this build
 * does not know lands on Home, as the app's `resolveDeepLink` does: a click that
 * does nothing is worse than one that goes home.
 */
export function resolveDeepLink(membership: Membership | undefined, link: NotificationDeepLink | null): string {
  if (!link) return pathTo('home');
  const key = APP_ROUTE_TO_PAGE[link.route];
  if (!key || !canOpenRoute(membership, key)) return pathTo('home');

  const path: string = ROUTES[key].path;
  const needed = [...path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]);
  const params = link.params ?? {};
  if (needed.some((name) => !params[name])) return pathTo('home');
  return needed.reduce((built, name) => built.replace(`:${name}`, encodeURIComponent(params[name])), path);
}
