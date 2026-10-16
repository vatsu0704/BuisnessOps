import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ParseKeys } from 'i18next';
import type { IconType } from 'react-icons';
import {
  IoBarChartOutline,
  IoBicycleOutline,
  IoBusinessOutline,
  IoCalculatorOutline,
  IoPrintOutline,
  IoCalendarOutline,
  IoCardOutline,
  IoCartOutline,
  IoCashOutline,
  IoCloudUploadOutline,
  IoCubeOutline,
  IoFileTrayFullOutline,
  IoFingerPrintOutline,
  IoHomeOutline,
  IoNotificationsOutline,
  IoOptionsOutline,
  IoPeopleOutline,
  IoPersonAddOutline,
  IoPersonOutline,
  IoPricetagsOutline,
  IoQrCodeOutline,
  IoReceiptOutline,
  IoRibbonOutline,
  IoStorefrontOutline,
  IoTrashOutline,
  IoWalletOutline,
} from 'react-icons/io5';
import type { RouteKey } from './paths';

type PageDef = {
  /** The page's name, which is also the placeholder's title until it is ported. */
  titleKey: ParseKeys;
  icon: IconType;
  /** The page itself, loaded when first opened. Absent: "coming to the web". */
  Page?: LazyExoticComponent<ComponentType>;
};

/**
 * Every route's page. A `Record` over `RouteKey`, so adding a route fails `tsc`
 * until it says what it shows — and porting a screen is adding its `Page` here.
 *
 * Each page is its own chunk: someone who only ever opens Home never downloads
 * the counter.
 */
export const PAGES: Record<RouteKey, PageDef> = {
  home: { titleKey: 'tabs.home', icon: IoHomeOutline, Page: lazy(() => import('@/pages/HomePage')) },

  settings: { titleKey: 'settings.title', icon: IoOptionsOutline, Page: lazy(() => import('@/pages/SettingsPage')) },
  addBusiness: {
    titleKey: 'addBusiness.title',
    icon: IoBusinessOutline,
    Page: lazy(() => import('@/pages/AddBusinessPage')),
  },
  deleteAccount: {
    titleKey: 'deleteAccount.title',
    icon: IoTrashOutline,
    Page: lazy(() => import('@/pages/DeleteAccountPage')),
  },
  plan: { titleKey: 'plans.title', icon: IoRibbonOutline, Page: lazy(() => import('@/pages/PlanPage')) },
  notifications: {
    titleKey: 'notificationCentre.title',
    icon: IoNotificationsOutline,
    Page: lazy(() => import('@/pages/NotificationsPage')),
  },

  addBranch: {
    titleKey: 'addBranch.title',
    icon: IoStorefrontOutline,
    Page: lazy(() => import('@/pages/AddBranchPage')),
  },
  branchSettings: {
    titleKey: 'branchSettings.title',
    icon: IoStorefrontOutline,
    Page: lazy(() => import('@/pages/BranchSettingsPage')),
  },
  workCalendar: {
    titleKey: 'workCalendar.title',
    icon: IoCalendarOutline,
    Page: lazy(() => import('@/pages/WorkCalendarPage')),
  },

  products: {
    titleKey: 'products.title',
    icon: IoPricetagsOutline,
    Page: lazy(() => import('@/pages/ProductsPage')),
  },
  addProduct: {
    titleKey: 'addProduct.title',
    icon: IoPricetagsOutline,
    Page: lazy(() => import('@/pages/AddProductPage')),
  },
  editProduct: {
    titleKey: 'editProduct.title',
    icon: IoPricetagsOutline,
    Page: lazy(() => import('@/pages/EditProductPage')),
  },
  upload: {
    titleKey: 'upload.title',
    icon: IoCloudUploadOutline,
    Page: lazy(() => import('@/pages/UploadPage')),
  },

  reports: { titleKey: 'reports.title', icon: IoBarChartOutline, Page: lazy(() => import('@/pages/ReportsPage')) },

  team: { titleKey: 'team.title', icon: IoPeopleOutline },
  inviteMember: { titleKey: 'inviteMember.title', icon: IoPersonAddOutline },
  staff: { titleKey: 'staffHub.title', icon: IoPeopleOutline },
  addStaff: { titleKey: 'addStaff.title', icon: IoPersonAddOutline },
  staffDetail: { titleKey: 'staffDetail.title', icon: IoPersonOutline },
  editStaff: { titleKey: 'editStaff.title', icon: IoPersonOutline },
  payrollRun: { titleKey: 'payrollRun.title', icon: IoCashOutline },
  attendance: { titleKey: 'attendance.title', icon: IoFingerPrintOutline },

  expenses: { titleKey: 'expenses.title', icon: IoWalletOutline },
  addExpense: { titleKey: 'expenses.addTitle', icon: IoWalletOutline },
  expenseCategories: { titleKey: 'costTypes.title', icon: IoWalletOutline },

  supply: { titleKey: 'supply.catalogTitle', icon: IoCubeOutline },
  supplyCart: { titleKey: 'supply.cartTitle', icon: IoCartOutline },
  addSupplyItem: { titleKey: 'supply.addItem', icon: IoCubeOutline },
  editSupplyItem: { titleKey: 'supply.editItem', icon: IoCubeOutline },
  supplyOrders: { titleKey: 'supply.ordersTitle', icon: IoReceiptOutline },
  supplyOrderDetail: { titleKey: 'supply.ordersTitle', icon: IoReceiptOutline },
  desk: { titleKey: 'supply.deskTitle', icon: IoFileTrayFullOutline },
  deliveries: { titleKey: 'supply.deliveriesTitle', icon: IoBicycleOutline },
  payments: { titleKey: 'payments.title', icon: IoCardOutline },
  paymentAccounts: { titleKey: 'paymentAccounts.title', icon: IoQrCodeOutline },
  vendors: { titleKey: 'vendors.title', icon: IoStorefrontOutline },
  addVendor: { titleKey: 'vendors.add', icon: IoStorefrontOutline },
  editVendor: { titleKey: 'vendors.edit', icon: IoStorefrontOutline },

  counter: { titleKey: 'counter.title', icon: IoCalculatorOutline },
  receiptPrinter: { titleKey: 'printer.title', icon: IoPrintOutline },
};
