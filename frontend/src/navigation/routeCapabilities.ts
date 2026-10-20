import type { Capability } from '../permissions';

/**
 * Which capability a route needs before it is registered at all — pure data, so
 * the web app (`web/`, through `@shared`) opens a page on exactly the rule the app
 * opens its screen on. It may import nothing but relative paths; `routeAccess.ts`
 * is where it meets the navigator.
 *
 * The strings here are the **same** ones the backend guards the matching
 * endpoints with, which is the whole point: a route this table lets a person
 * reach is a route whose requests will succeed. Two separate lists of role
 * names would agree on the day they were written and drift silently after.
 *
 * A route absent from this map is open to everyone — Home, Settings and the
 * tab host itself, plus the self-service screens (Attendance) that every role
 * uses for their own record.
 */
export const ROUTE_CAPABILITY = {
  AddBranch: 'branch:create',
  // Every branch, searchable. Home previews five and said "+N more" without
  // offering anywhere to go, so a business with two hundred branches could
  // reach the settings of exactly five of them.
  Branches: 'branch:update',
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
  Counter: 'counterOrder:create',
  // The receipt printer is the counter's. Its settings live on this phone, but
  // only somebody who bills has a printer to set up.
  ReceiptPrinter: 'counterOrder:create',
  // Supply orders. The capability each one needs is the capability the
  // backend guards its endpoints with, so a route that opens is a route
  // whose requests succeed: SupplyOrderDetail asks only to VIEW, because the
  // actions it offers are gated separately inside it.
  SupplyCatalog: 'supplyItem:view',
  SupplyCart: 'supplyOrder:create',
  SupplyOrders: 'supplyOrder:view',
  SupplyOrderDetail: 'supplyOrder:view',
  SupplyItemForm: 'supplyItem:manage',
  SupplyDesk: 'supplyOrder:fulfil',
  SupplyDeliveries: 'supplyOrder:deliver',
  // The Payments screen has two lists. Opening it needs the one the desk holds
  // too — confirming payments — and the list accounts PAYS from is gated inside
  // it on `supplyPayment:settle`, which only accounts and the owner hold.
  SupplyPayments: 'supplyPayment:verify',
  PaymentAccounts: 'paymentAccount:manage',
  Vendors: 'supplyItem:manage',
  VendorForm: 'supplyItem:manage',
  // Reading a branch's spending and recording it are separate capabilities, so
  // the back-office desk opens this screen and is offered no way to log.
  Expenses: 'expense:view',
  AddExpense: 'expense:log',
  // Requirement 28. The plan, its dates and what each plan includes are the
  // owner's to see; every member still learns whether the business is
  // read-only from their own membership.
  Plan: 'billing:manage',
  // Requirement 33. A branch's own costs and profit — not the business-wide view,
  // which the Reports TAB still needs; the grid behind both is scoped to the
  // branches the person reaches. A cashier holds neither.
  Reports: 'analytics:viewBranch',
  // Requirement 34. Reading how costs are grouped is reading expenses; changing
  // a category's kind is `expense:classify`, checked inside the screen.
  ExpenseCategories: 'expense:view',
} as const satisfies Record<string, Capability>;

export type GatedRoute = keyof typeof ROUTE_CAPABILITY;
