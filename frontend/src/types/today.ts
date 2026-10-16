import type { BranchKind } from './branch';
import type { CounterOrderStatus, PaymentMethod } from './counter';

/**
 * Today at a glance — `GET /businesses/:id/today` (requirement 33).
 *
 * Money arrives as strings (Prisma decimals), like every other figure. "Today"
 * is each branch's own day, which `dayKey` names.
 */
export interface TodayBranch {
  branchId: string;
  name: string;
  code: string;
  kind: BranchKind;
  dayKey: string;
  currency: string;
  /** Null for a warehouse, which has no till. */
  sales: string | null;
  saleCount: number | null;
  /** Null for somebody who may not read expenses. */
  expenses: string | null;
  expenseCount: number | null;
}

export interface TodayBill {
  id: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  tokenNumber: number;
  tokenDate: string;
  status: CounterOrderStatus;
  paymentMethod: PaymentMethod;
  totalAmount: string;
  currency: string;
  itemCount: number;
  at: string;
}

export interface TodaySummary {
  currency: string;
  /** Branches in more than one currency: the totals are not a sum anybody should trust. */
  mixedCurrency: boolean;
  branches: TodayBranch[];
  totals: {
    sales: string;
    saleCount: number;
    expenses: string | null;
    expenseCount: number | null;
  };
  /** The day's latest bills — null for somebody who does not bill. */
  recentBills: TodayBill[] | null;
}
