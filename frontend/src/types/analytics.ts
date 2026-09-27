import type { BranchKind, BranchStatus } from '@/types/branch';
import type { MembershipRole } from '@/types/user';

/**
 * The branch × month grid — requirements 13 and 15.
 *
 * **Every money field is a string**, because Prisma serialises `Decimal` that
 * way and parsing it to a JS number on the wire would be the one place a rupee
 * could quietly go missing. `Number(...)` at the point of display is deliberate
 * and local; nothing here does arithmetic on a value it did not first convert.
 */

export type TrendDirection = 'UP' | 'DOWN' | 'FLAT';

export type BranchMonthCell = {
  /** 'YYYY-MM'. */
  month: string;
  sales: string;
  saleCount: number;
  expenses: string;
  expenseCount: number;
  /** What this branch paid its own warehouse for raw material. */
  materialSpend: string;
  materialOrderCount: number;
  payroll: string;
  payrollSlipCount: number;
  /**
   * The wage figure is not settled: some payslip is still a draft, or the branch
   * has staff and payroll was never run for this month. The screen says so
   * rather than presenting a profit that is too flattering to be true.
   */
  payrollProvisional: boolean;
  /** `sales − expenses − materialSpend − payroll`. */
  netProfit: string;
};

export type BranchMonthTotals = {
  sales: string;
  saleCount: number;
  expenses: string;
  expenseCount: number;
  materialSpend: string;
  materialOrderCount: number;
  payroll: string;
  netProfit: string;
};

export type BranchTrend = {
  direction: TrendDirection;
  /** Null when the earlier month was zero — a change from nothing has no proportion. */
  changePercent: string | null;
  comparable: boolean;
};

export type BranchMonthlyRow = {
  branchId: string;
  branchName: string;
  branchCode: string;
  kind: BranchKind;
  status: BranchStatus;
  timezone: string;
  currency: string;
  /**
   * A warehouse: real costs, no till. Flagged by the server rather than inferred
   * from `sales === 0`, which is also true of a shop that had a dead month.
   */
  isCostCentre: boolean;
  staffCount: number;
  months: BranchMonthCell[];
  total: BranchMonthTotals;
  trend: BranchTrend;
};

export type BusinessMonthCell = {
  month: string;
  customerSales: string;
  expenses: string;
  payroll: string;
  /** Money that moved between this business's own locations. */
  internalTransfer: string;
  netProfit: string;
  payrollProvisional: boolean;
};

export type BusinessTotals = Omit<BusinessMonthCell, 'month'>;

/**
 * Why the branch column and the business total differ.
 *
 * A shop paying its own warehouse is real money out of that shop and no money
 * out of the business. So the branch rows subtract it and the business total
 * does not, and the two differ by exactly that amount. Shown rather than hidden:
 * someone who adds the column up and gets a different number needs to be able to
 * see immediately why.
 */
export type Reconciliation = {
  branchNetProfitSum: string;
  internalTransfer: string;
  netProfit: string;
  balances: boolean;
};

export type BusinessRollUp = {
  months: BusinessMonthCell[];
  total: BusinessTotals | null;
  reconciliation: Reconciliation;
};

export type BranchMonthlyReport = {
  from: string;
  to: string;
  months: string[];
  currency: string;
  /** Branch currencies differ, so nothing may be added across them. */
  mixedCurrency: boolean;
  branches: BranchMonthlyRow[];
  /** Null for a caller without `analytics:viewBusiness` — a cashier, for instance. */
  business: BusinessRollUp | null;
};

// --- Across businesses -----------------------------------------------------

export type CrossBusinessRow = {
  businessId: string;
  businessName: string;
  role: MembershipRole;
  currency: string;
  mixedCurrency: boolean;
  branchCount: number;
  tradingBranchCount: number;
  from: string;
  to: string;
  months: BusinessMonthCell[];
  total: BusinessTotals;
  reconciliation: Reconciliation;
};

export type CrossBusinessReport = {
  from: string | null;
  to: string | null;
  businessCount: number;
  /** Null when the businesses do not share a currency. */
  currency: string | null;
  /** False when they do not, in which case `combined` is withheld. */
  comparable: boolean;
  combined: Omit<BusinessTotals, 'payrollProvisional'> | null;
  businesses: CrossBusinessRow[];
};
