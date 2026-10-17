import type { DailyReport } from '../types/analytics';

/**
 * Reports' Per day (requirement 34) — the arithmetic behind the view, shared
 * with the web so both read a month the same way.
 *
 * A day comes in one of two shapes: a branch's, or the business's roll-up. This
 * flattens either into one, totals the month from its days, and leaves out the
 * days that have not happened yet.
 */

/** The choice that means the whole business, beside each branch's id. */
export const ALL_BRANCHES = 'ALL';

/** One day, in whichever of the two shapes it came. */
export type ReportDay = {
  day: string;
  business: number;
  saleCount: number;
  variableExpenses: string;
  fixedExpenses: string;
  dailyExpenses: string;
  totalCost: string;
  profit: number;
  /** The part of variable that is raw material — vendors for the business, everything for a branch. */
  rawMaterial: number;
};

/**
 * What can be chosen: the whole business when the server sent its roll-up (a
 * caller with `analytics:viewBusiness`), then each branch.
 */
export function dailyChoices(report: DailyReport | null): string[] {
  const branches = report?.branches ?? [];
  const ids = branches.map((row) => row.branchId);
  return report?.business ? [ALL_BRANCHES, ...ids] : ids;
}

/** The choice to show: the one asked for while it is still offered, else the first. */
export function resolveChoice(report: DailyReport | null, selected: string): string {
  const choices = dailyChoices(report);
  return choices.includes(selected) ? selected : (choices[0] ?? ALL_BRANCHES);
}

export function daysFor(report: DailyReport | null, choice: string): ReportDay[] {
  if (!report) return [];
  if (choice === ALL_BRANCHES && report.business) {
    return report.business.days.map((cell) => ({
      day: cell.day,
      business: Number(cell.customerSales),
      saleCount: cell.saleCount,
      variableExpenses: cell.variableExpenses,
      fixedExpenses: cell.fixedExpenses,
      dailyExpenses: cell.dailyExpenses,
      totalCost: cell.totalCost,
      profit: Number(cell.netProfit),
      rawMaterial: Number(cell.vendorSpend),
    }));
  }
  const row = report.branches.find((candidate) => candidate.branchId === choice);
  return (row?.days ?? []).map((cell) => ({
    day: cell.day,
    business: Number(cell.sales),
    saleCount: cell.saleCount,
    variableExpenses: cell.variableExpenses,
    fixedExpenses: cell.fixedExpenses,
    dailyExpenses: cell.dailyExpenses,
    totalCost: cell.totalCost,
    profit: Number(cell.netProfit),
    rawMaterial: Number(cell.materialSpend),
  }));
}

/**
 * The month, as the sum of its days — every day, including those still to come,
 * so the fixed costs spread over them add back to the month's real figure.
 */
export function dailyTotal(days: ReportDay[]) {
  const add = (field: 'business' | 'variableExpenses' | 'fixedExpenses' | 'dailyExpenses' | 'totalCost' | 'profit' | 'rawMaterial') =>
    days.reduce((sum, day) => sum + Number(day[field]), 0);
  return {
    business: add('business'),
    saleCount: days.reduce((sum, day) => sum + day.saleCount, 0),
    variableExpenses: String(add('variableExpenses')),
    fixedExpenses: String(add('fixedExpenses')),
    dailyExpenses: String(add('dailyExpenses')),
    totalCost: String(add('totalCost')),
    profit: add('profit'),
    rawMaterial: add('rawMaterial'),
  };
}

/**
 * The days to list, newest first. In the month still running, a day that has
 * not happened yet has nothing to show but its share of rent, so it is left out:
 * `todayKey` is today's 'YYYY-MM-DD', or null for a month that is over.
 */
export function listedDays(days: ReportDay[], todayKey: string | null): ReportDay[] {
  const happened = todayKey ? days.filter((day) => day.day <= todayKey) : days;
  return [...happened].reverse();
}
