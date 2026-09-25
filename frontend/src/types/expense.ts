import type { PaymentMethod } from '@/types/counter';

/**
 * Branch expenses — requirement 10.
 *
 * Money arrives as a string, not a number: Prisma serializes `Decimal` that way
 * so a value a float cannot hold exactly does not quietly become one in
 * transit. Keep it a string until the moment it is formatted or summed.
 */

/**
 * A category is either one of the eight every business starts with, or one
 * somebody typed.
 *
 * `code` is the discriminator and the whole reason this is not just a name:
 * the seeded set is shown to someone who may be reading the app in Gujarati,
 * and the backend cannot translate. So a coded category renders as
 * `t('expenseCategory.<code>')` and `name` is only the English fallback — the
 * same contract the error catalog uses. A custom category has `code: null` and
 * is shown exactly as it was typed, because somebody's own words are not ours
 * to translate.
 */
export interface ExpenseCategory {
  id: string;
  code: ExpenseCategoryCode | null;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

/**
 * The seeded set. A union rather than `string` so `t('expenseCategory.GAS')`
 * type-checks against `en.json` and a code the app cannot render is a compile
 * error rather than a raw key on screen.
 *
 * There is deliberately no raw-material code: a supply order is already a cost
 * recorded against the order itself, and logging it again by hand would
 * subtract it twice from net profit.
 */
export type ExpenseCategoryCode =
  | 'MILK'
  | 'GAS'
  | 'ELECTRICITY'
  | 'RENT'
  | 'REPAIRS'
  | 'TRANSPORT'
  | 'PETTY'
  | 'OTHER';

export interface Expense {
  id: string;
  branchId: string;
  categoryId: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  /** The branch's own calendar day, as an ISO instant at UTC midnight. */
  expenseDate: string;
  note: string | null;
  paymentMethod: PaymentMethod;
  recordedByMembership: { user: { name: string | null } | null } | null;
  createdAt: string;
}

/** One row of "where did the money go", biggest first. */
export interface ExpenseBreakdownRow {
  categoryId: string;
  code: ExpenseCategoryCode | null;
  name: string | null;
  amount: string;
  count: number;
}

/**
 * Requirement 10's core question, answered as one thing: what went out today,
 * what came in today, and the gap.
 */
export interface ExpenseDaySummary {
  branchId: string;
  date: string;
  currency: string;
  expenseCount: number;
  totalSpent: string;
  totalSold: string;
  saleCount: number;
  /**
   * `totalSold - totalSpent`. Deliberately not called profit: this is one day's
   * cash movement and knows nothing about payroll or supply spend, which is
   * requirement 13's job.
   */
  difference: string;
  breakdown: ExpenseBreakdownRow[];
  expenses: Expense[];
}

export interface ExpenseMonthSummary {
  branchId: string;
  month: number;
  year: number;
  currency: string;
  expenseCount: number;
  totalSpent: string;
  breakdown: ExpenseBreakdownRow[];
  days: { date: string; amount: string }[];
}

/** Who the back office has to ring. */
export interface ExpenseComplianceRow {
  branchId: string;
  branchName: string;
  branchCode: string;
  branchKind: 'BRANCH' | 'WAREHOUSE';
  timezone: string;
  /** The branch's own local date when none was asked for. */
  date: string;
  hasLogged: boolean;
  expenseCount: number;
  totalSpent: string;
}

export interface ExpenseCompliance {
  date: string | null;
  branchCount: number;
  missingCount: number;
  branches: ExpenseComplianceRow[];
}
