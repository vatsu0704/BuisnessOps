import type { BranchMonthlyRow, BranchTrend } from '@/types/analytics';

/** One branch's net profit in one month, as a number; zero for a month it has no cell for. */
export function netIn(row: BranchMonthlyRow, month: string): number {
  return Number(row.months.find((cell) => cell.month === month)?.netProfit ?? 0);
}

/**
 * Requirement 15's ranking: best net profit first in the month being read, cost
 * centres last. A warehouse can only ever be negative, so ranking it among the
 * shops would put every warehouse at the bottom and read as a list of failures.
 */
export function rankBranches(rows: BranchMonthlyRow[], month: string): BranchMonthlyRow[] {
  return [...rows].sort((a, b) => {
    if (a.isCostCentre !== b.isCostCentre) return a.isCostCentre ? 1 : -1;
    return netIn(b, month) - netIn(a, month);
  });
}

/**
 * "Where more effort is needed": the branches that fell, worst first. Only `DOWN`
 * — a `FLAT` branch moved less than the server's noise threshold, and a section
 * that flags everything teaches its reader to skip it. A fall with no percentage
 * (the month before was zero) sorts after the measured ones rather than counting
 * as a 0% fall.
 */
export function decliningBranches(rows: BranchMonthlyRow[]): BranchMonthlyRow[] {
  const changeOf = (row: BranchMonthlyRow) =>
    row.trend.changePercent === null ? Number.POSITIVE_INFINITY : Number(row.trend.changePercent);
  return rows.filter((row) => row.trend.direction === 'DOWN').sort((a, b) => changeOf(a) - changeOf(b));
}

/**
 * The figure on a trend pill: a signed, rounded percentage when there is a
 * proportion to state, otherwise null and the pill says the direction in words.
 * "+Infinity%" after a month of zero is worse than "Up".
 */
export function trendPercent(trend: BranchTrend): string | null {
  if (!trend.comparable || trend.changePercent === null) return null;
  const value = Math.round(Number(trend.changePercent));
  return `${value > 0 ? '+' : ''}${value}%`;
}
