import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteKey } from './paths';

/**
 * Every route's page. A `Record` over `RouteKey`, so adding a route fails `tsc`
 * until it has a page — the web has one for every screen of the app.
 *
 * Each page is its own chunk: someone who only ever opens Home never downloads
 * the counter.
 */
export const PAGES: Record<RouteKey, LazyExoticComponent<ComponentType>> = {
  home: lazy(() => import('@/pages/HomePage')),

  settings: lazy(() => import('@/pages/SettingsPage')),
  addBusiness: lazy(() => import('@/pages/AddBusinessPage')),
  deleteAccount: lazy(() => import('@/pages/DeleteAccountPage')),
  plan: lazy(() => import('@/pages/PlanPage')),
  notifications: lazy(() => import('@/pages/NotificationsPage')),

  addBranch: lazy(() => import('@/pages/AddBranchPage')),
  branchSettings: lazy(() => import('@/pages/BranchSettingsPage')),
  workCalendar: lazy(() => import('@/pages/WorkCalendarPage')),

  products: lazy(() => import('@/pages/ProductsPage')),
  addProduct: lazy(() => import('@/pages/AddProductPage')),
  editProduct: lazy(() => import('@/pages/EditProductPage')),
  upload: lazy(() => import('@/pages/UploadPage')),

  reports: lazy(() => import('@/pages/ReportsPage')),

  team: lazy(() => import('@/pages/TeamPage')),
  inviteMember: lazy(() => import('@/pages/InviteMemberPage')),
  staff: lazy(() => import('@/pages/StaffPage')),
  addStaff: lazy(() => import('@/pages/AddStaffPage')),
  staffDetail: lazy(() => import('@/pages/StaffDetailPage')),
  editStaff: lazy(() => import('@/pages/EditStaffPage')),
  payrollRun: lazy(() => import('@/pages/PayrollRunPage')),
  attendance: lazy(() => import('@/pages/AttendancePage')),

  expenses: lazy(() => import('@/pages/ExpensesPage')),
  addExpense: lazy(() => import('@/pages/AddExpensePage')),
  expenseCategories: lazy(() => import('@/pages/ExpenseCategoriesPage')),

  supply: lazy(() => import('@/pages/SupplyCatalogPage')),
  supplyCart: lazy(() => import('@/pages/SupplyCartPage')),
  addSupplyItem: lazy(() => import('@/pages/SupplyItemFormPage')),
  editSupplyItem: lazy(() => import('@/pages/SupplyItemFormPage')),
  supplyOrders: lazy(() => import('@/pages/SupplyOrdersPage')),
  supplyOrderDetail: lazy(() => import('@/pages/SupplyOrderDetailPage')),
  desk: lazy(() => import('@/pages/DeskPage')),
  deliveries: lazy(() => import('@/pages/DeliveriesPage')),
  payments: lazy(() => import('@/pages/SupplyPaymentsPage')),
  paymentAccounts: lazy(() => import('@/pages/PaymentAccountsPage')),
  vendors: lazy(() => import('@/pages/VendorsPage')),
  addVendor: lazy(() => import('@/pages/VendorFormPage')),
  editVendor: lazy(() => import('@/pages/VendorFormPage')),

  counter: lazy(() => import('@/pages/CounterPage')),
  receiptPrinter: lazy(() => import('@/pages/ReceiptPrinterPage')),
};
