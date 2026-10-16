import type { Capability } from '../permissions';

/**
 * Home's quick actions — requirement 33, the tile grid a shop's phone opens on.
 *
 * Pure data, shared with the web: which tiles exist, what each opens, and the
 * capability that decides who sees it — the same `{ holds, unless }` shape Home's
 * sections and the tab bar use, never a role name. A tile that renders is a tile
 * whose screen opens: a web test checks every role against the route rules.
 *
 * These replaced Home's full-width "door" cards — a card that only opened another
 * screen, with no figure on it. Cards that carry a figure or a list (punch-in,
 * the payments due, the branches to chase) stay cards.
 */

/** App routes a tile may open. Checked against the navigator in QuickActionsSection. */
export type QuickActionRoute =
  | 'Counter'
  | 'Products'
  | 'Reports'
  | 'Expenses'
  | 'SupplyCatalog'
  | 'SupplyOrders'
  | 'SupplyDesk'
  | 'SupplyDeliveries'
  | 'SupplyPayments'
  | 'Upload';

export type QuickActionKey =
  | 'billing'
  | 'items'
  | 'expenses'
  | 'reports'
  | 'supply'
  | 'rawMaterial'
  | 'orders'
  | 'desk'
  | 'deliveries'
  | 'paymentHistory'
  | 'upload';

export type QuickAction = {
  key: QuickActionKey;
  capability: Capability;
  /** Hide for anyone who `holds` this, unless they also hold `unless` — whose job it is. */
  hideWhen?: { holds: Capability; unless?: Capability };
  /** An Ionicons glyph name; the web maps it to its own icon set. */
  icon: string;
  route: QuickActionRoute;
  params?: Record<string, string>;
  /** The one tile drawn large, across the top: the till. */
  primary?: boolean;
};

export const QUICK_ACTIONS: QuickAction[] = [
  { key: 'billing', capability: 'counterOrder:create', icon: 'calculator-outline', route: 'Counter', primary: true },
  { key: 'items', capability: 'product:view', icon: 'pricetags-outline', route: 'Products' },
  { key: 'expenses', capability: 'expense:view', icon: 'wallet-outline', route: 'Expenses' },
  { key: 'reports', capability: 'analytics:viewBranch', icon: 'bar-chart-outline', route: 'Reports' },
  // A branch orders raw material; an owner or admin does not, so for them this
  // gives way to the raw-material tile below.
  {
    key: 'supply',
    capability: 'supplyOrder:create',
    hideWhen: { holds: 'analytics:viewBusiness' },
    icon: 'cart-outline',
    route: 'SupplyCatalog',
  },
  { key: 'rawMaterial', capability: 'supplyItem:manage', icon: 'cube-outline', route: 'SupplyCatalog' },
  { key: 'orders', capability: 'supplyOrder:view', icon: 'receipt-outline', route: 'SupplyOrders' },
  { key: 'desk', capability: 'supplyOrder:fulfil', icon: 'file-tray-full-outline', route: 'SupplyDesk' },
  // Whoever runs the desk is not who carries the run.
  {
    key: 'deliveries',
    capability: 'supplyOrder:deliver',
    hideWhen: { holds: 'supplyOrder:fulfil' },
    icon: 'bicycle-outline',
    route: 'SupplyDeliveries',
  },
  {
    key: 'paymentHistory',
    capability: 'supplyPayment:viewHistory',
    icon: 'time-outline',
    route: 'SupplyPayments',
    params: { tab: 'history' },
  },
  { key: 'upload', capability: 'dataSource:manage', icon: 'cloud-upload-outline', route: 'Upload' },
];

/** The translation key for a tile's label. */
export function quickActionLabelKey(key: QuickActionKey) {
  return `quickActions.${key}` as const;
}

/** Whether a tile shows, given a way to ask about one capability. */
export function isQuickActionVisible(action: QuickAction, has: (capability: Capability) => boolean): boolean {
  if (!has(action.capability)) return false;
  if (!action.hideWhen) return true;
  return !(has(action.hideWhen.holds) && !(action.hideWhen.unless && has(action.hideWhen.unless)));
}
