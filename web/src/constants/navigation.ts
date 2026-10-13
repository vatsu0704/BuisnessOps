import type { IconType } from 'react-icons';
import {
  IoBarChartOutline,
  IoBicycleOutline,
  IoCalculatorOutline,
  IoCardOutline,
  IoCloudUploadOutline,
  IoCubeOutline,
  IoFileTrayFullOutline,
  IoHomeOutline,
  IoOptionsOutline,
  IoPeopleOutline,
  IoPricetagsOutline,
  IoReceiptOutline,
  IoWalletOutline,
} from 'react-icons/io5';
import type { Gate } from '@/utils/permissions';

/**
 * Every place the sidebar can take someone, each with the gates that decide who
 * sees it. A role sees the entries it passes — so adding a role adds no rows
 * here, and adding a surface adds one row that every role holding its
 * capability gets.
 *
 * The gates are the app's own: a mobile tab's capability, and the Home card's
 * `hideWhen` where the two differ. The web has no five-tab budget, so an entry
 * the app moves off its tab bar purely for room (an owner's Counter) stays here;
 * an entry the app hides because it is not that person's *job* (an owner's
 * deliveries) is hidden here too.
 *
 * `built: true` marks the pages the web has so far. Every other entry opens the
 * "coming to the web" page — the route exists, so the sidebar is the real one
 * and each page replaces its placeholder as it is ported.
 */
export type NavLabelKey =
  | 'tabs.home'
  | 'tabs.reports'
  | 'tabs.counter'
  | 'tabs.products'
  | 'tabs.supply'
  | 'tabs.desk'
  | 'tabs.deliveries'
  | 'tabs.payments'
  | 'tabs.staff'
  | 'tabs.settings'
  | 'expenses.title'
  | 'upload.title'
  | 'web.nav.supplyOrders';

export type NavEntry = {
  key: string;
  path: string;
  icon: IconType;
  labelKey: NavLabelKey;
  /** Shown to anyone who passes any one gate; null means everyone. */
  gates: Gate[] | null;
  built?: boolean;
};

export type NavGroup = {
  key: string;
  labelKey: 'web.nav.overview' | 'web.nav.branch' | 'web.nav.supply' | 'web.nav.people';
  entries: NavEntry[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    labelKey: 'web.nav.overview',
    entries: [
      { key: 'home', path: '/', icon: IoHomeOutline, labelKey: 'tabs.home', gates: null, built: true },
      {
        key: 'reports',
        path: '/reports',
        icon: IoBarChartOutline,
        labelKey: 'tabs.reports',
        gates: [{ capability: 'analytics:viewBusiness' }],
      },
      {
        key: 'upload',
        path: '/upload',
        icon: IoCloudUploadOutline,
        labelKey: 'upload.title',
        gates: [{ capability: 'dataSource:manage' }],
      },
    ],
  },
  {
    key: 'branch',
    labelKey: 'web.nav.branch',
    entries: [
      {
        key: 'counter',
        path: '/counter',
        icon: IoCalculatorOutline,
        labelKey: 'tabs.counter',
        gates: [{ capability: 'counterOrder:create' }],
      },
      {
        key: 'products',
        path: '/products',
        icon: IoPricetagsOutline,
        labelKey: 'tabs.products',
        gates: [{ capability: 'product:view' }],
      },
      {
        key: 'expenses',
        path: '/expenses',
        icon: IoWalletOutline,
        labelKey: 'expenses.title',
        gates: [{ capability: 'expense:log' }],
      },
    ],
  },
  {
    key: 'supply',
    labelKey: 'web.nav.supply',
    entries: [
      // Ordering raw material is a branch's job, not an admin's; the catalog
      // behind it is also the desk's way in to stocking and pricing it.
      {
        key: 'supply',
        path: '/supply',
        icon: IoCubeOutline,
        labelKey: 'tabs.supply',
        gates: [
          { capability: 'supplyOrder:create', hideWhen: { holds: 'analytics:viewBusiness' } },
          { capability: 'supplyItem:manage' },
        ],
      },
      {
        key: 'supplyOrders',
        path: '/supply-orders',
        icon: IoReceiptOutline,
        labelKey: 'web.nav.supplyOrders',
        gates: [{ capability: 'supplyOrder:view' }],
      },
      {
        key: 'desk',
        path: '/desk',
        icon: IoFileTrayFullOutline,
        labelKey: 'tabs.desk',
        gates: [{ capability: 'supplyOrder:fulfil' }],
      },
      // Whoever runs the desk is not who carries the run.
      {
        key: 'deliveries',
        path: '/deliveries',
        icon: IoBicycleOutline,
        labelKey: 'tabs.deliveries',
        gates: [{ capability: 'supplyOrder:deliver', hideWhen: { holds: 'supplyOrder:fulfil' } }],
      },
      // Paying (accounts) and confirming a payment arrived (the desk) are one screen.
      {
        key: 'payments',
        path: '/payments',
        icon: IoCardOutline,
        labelKey: 'tabs.payments',
        gates: [{ capability: 'supplyPayment:settle' }, { capability: 'supplyPayment:verify' }],
      },
    ],
  },
  {
    key: 'people',
    labelKey: 'web.nav.people',
    entries: [
      // Everyone has their own attendance, so everyone has Staff.
      { key: 'staff', path: '/staff', icon: IoPeopleOutline, labelKey: 'tabs.staff', gates: null },
    ],
  },
];

/** Pinned to the foot of the sidebar: the language, the account, the way out. */
export const SETTINGS_ENTRY: NavEntry = {
  key: 'settings',
  path: '/settings',
  icon: IoOptionsOutline,
  labelKey: 'tabs.settings',
  gates: null,
};

export const ALL_NAV_ENTRIES: NavEntry[] = [...NAV_GROUPS.flatMap((g) => g.entries), SETTINGS_ENTRY];
