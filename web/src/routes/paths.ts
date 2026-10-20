import { generatePath, type PathParam } from 'react-router';
import { ROUTE_CAPABILITY, type GatedRoute } from '@shared/navigation/routeCapabilities';
import type { Capability } from '@/permissions';
import type { Membership } from '@/types/user';
import { hasCapability } from '@/utils/permissions';

/**
 * Who may open a page:
 *
 * - `appRoute` — exactly what the app needs to open the same screen, read from its
 *   own table (`frontend/src/navigation/routeCapabilities.ts`). Most pages.
 * - `capability` — for a page the app reaches only as a **tab**, which its route
 *   table does not list. None does at present: Reports became a pushed route too
 *   (requirement 33), so it opens on `appRoute` like the rest.
 * - `null` — everyone, as in the app: Home, Settings, Staff, own attendance.
 *
 * Whether a page *shows* in the sidebar is a different question — whose job it is
 * — answered in `constants/navigation.ts`.
 */
type Access = { appRoute: GatedRoute } | { capability: Capability } | null;

type RouteDef = { path: string; access: Access };

export const ROUTES = {
  home: { path: '/', access: null },

  settings: { path: '/settings', access: null },
  // No capability: anybody may change their own password.
  changePassword: { path: '/settings/password', access: null },
  // Open, as in the app: Settings offers it to an owner and to somebody revoked
  // from every business — who holds no capability at all, and needs it most.
  addBusiness: { path: '/settings/add-business', access: null },
  deleteAccount: { path: '/settings/delete-account', access: null },
  // Requirement 28. Opened from Settings, so it lives under it.
  plan: { path: '/settings/plan', access: { appRoute: 'Plan' } },
  notifications: { path: '/notifications', access: null },

  branches: { path: '/branches', access: { appRoute: 'Branches' } },
  addBranch: { path: '/branches/new', access: { appRoute: 'AddBranch' } },
  branchSettings: { path: '/branches/:branchId', access: { appRoute: 'BranchSettings' } },
  workCalendar: { path: '/work-calendar', access: { appRoute: 'WorkCalendar' } },

  products: { path: '/products', access: { appRoute: 'Products' } },
  addProduct: { path: '/products/new', access: { appRoute: 'AddProduct' } },
  editProduct: { path: '/products/:productId/edit', access: { appRoute: 'EditProduct' } },
  upload: { path: '/upload', access: { appRoute: 'Upload' } },

  reports: { path: '/reports', access: { appRoute: 'Reports' } },

  team: { path: '/team', access: { appRoute: 'Team' } },
  inviteMember: { path: '/team/invite', access: { appRoute: 'InviteMember' } },
  staff: { path: '/staff', access: null },
  addStaff: { path: '/staff/new', access: { appRoute: 'AddStaff' } },
  staffDetail: { path: '/staff/:staffMemberId', access: { appRoute: 'StaffDetail' } },
  editStaff: { path: '/staff/:staffMemberId/edit', access: { appRoute: 'EditStaff' } },
  payrollRun: { path: '/payroll/:year/:month', access: { appRoute: 'PayrollRun' } },
  attendance: { path: '/attendance', access: null },

  expenses: { path: '/expenses', access: { appRoute: 'Expenses' } },
  addExpense: { path: '/expenses/new', access: { appRoute: 'AddExpense' } },
  expenseCategories: { path: '/expenses/categories', access: { appRoute: 'ExpenseCategories' } },

  supply: { path: '/supply', access: { appRoute: 'SupplyCatalog' } },
  supplyCart: { path: '/supply/cart/:supplyOrderId', access: { appRoute: 'SupplyCart' } },
  addSupplyItem: { path: '/supply/items/new', access: { appRoute: 'SupplyItemForm' } },
  editSupplyItem: { path: '/supply/items/:inventoryItemId', access: { appRoute: 'SupplyItemForm' } },
  supplyOrders: { path: '/supply-orders', access: { appRoute: 'SupplyOrders' } },
  supplyOrderDetail: { path: '/supply-orders/:supplyOrderId', access: { appRoute: 'SupplyOrderDetail' } },
  desk: { path: '/desk', access: { appRoute: 'SupplyDesk' } },
  deliveries: { path: '/deliveries', access: { appRoute: 'SupplyDeliveries' } },
  payments: { path: '/payments', access: { appRoute: 'SupplyPayments' } },
  paymentAccounts: { path: '/payment-accounts', access: { appRoute: 'PaymentAccounts' } },
  vendors: { path: '/vendors', access: { appRoute: 'Vendors' } },
  addVendor: { path: '/vendors/new', access: { appRoute: 'VendorForm' } },
  editVendor: { path: '/vendors/:vendorId', access: { appRoute: 'VendorForm' } },

  counter: { path: '/counter', access: { appRoute: 'Counter' } },
  receiptPrinter: { path: '/counter/printer', access: { appRoute: 'ReceiptPrinter' } },
} as const satisfies Record<string, RouteDef>;

export type RouteKey = keyof typeof ROUTES;

/** The capability opening this page needs, or null when it is open to everyone. */
export function requiredCapability(key: RouteKey): Capability | null {
  // Widened on purpose: with no page using the `capability` form today, the
  // literal table's own type would narrow that branch away.
  const access = ROUTES[key].access as Access;
  if (!access) return null;
  return 'appRoute' in access ? ROUTE_CAPABILITY[access.appRoute] : access.capability;
}

export function canOpenRoute(membership: Membership | undefined, key: RouteKey): boolean {
  const required = requiredCapability(key);
  return !required || hasCapability(membership, required);
}

type ParamsOf<K extends RouteKey> = { [P in PathParam<(typeof ROUTES)[K]['path']>]: string | number };

/**
 * The address of a page, with its parameters filled in — `pathTo('staffDetail',
 * { staffMemberId })`. A page whose path has parameters cannot be called without
 * them; one without takes none.
 */
export function pathTo<K extends RouteKey>(
  key: K,
  ...[params]: [PathParam<(typeof ROUTES)[K]['path']>] extends [never] ? [] : [ParamsOf<K>]
): string {
  const path: string = ROUTES[key].path;
  if (!params) return path;
  const asStrings = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return generatePath(path, asStrings);
}

/** The pages whose address has no parameters — the only ones a menu can link to directly. */
export type ParamlessRoute = {
  [K in RouteKey]: [PathParam<(typeof ROUTES)[K]['path']>] extends [never] ? K : never;
}[RouteKey];

/**
 * The page standing for an app route that takes no path parameters — for links
 * shared data names by the app's route, as Home's quick actions do. Null when no
 * such page exists, which a test rules out for every route a tile names.
 */
export function routeForAppRoute(appRoute: GatedRoute): ParamlessRoute | null {
  for (const [key, def] of Object.entries(ROUTES) as [RouteKey, RouteDef][]) {
    const access = def.access as Access;
    if (access && 'appRoute' in access && access.appRoute === appRoute && !def.path.includes(':')) {
      return key as ParamlessRoute;
    }
  }
  return null;
}

/**
 * The address of that page. The app's route params become the query string —
 * `{ tab: 'history' }` → `/payments?tab=history` — which is how a web page takes
 * what the app hands a screen.
 */
export function pathForAppRoute(appRoute: GatedRoute, params?: Record<string, string>): string | null {
  const key = routeForAppRoute(appRoute);
  if (!key) return null;
  const query = params ? new URLSearchParams(params).toString() : '';
  return query ? `${ROUTES[key].path}?${query}` : ROUTES[key].path;
}
