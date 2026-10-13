import type { BranchMonthlyRow, BranchTrend, BusinessMonthCell } from '@/types/analytics';

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

/** Rupees as whole paise, so summing a column of two-decimal figures stays exact. */
const paise = (value: string | number) => Math.round(Number(value) * 100);

/**
 * Requirement 13's reconciliation for the month being read: what the branches
 * made, what they paid their own warehouse, and the business's total.
 *
 * The server's `reconciliation` covers the whole window, so printed under one
 * month's net profit it names a total that is not the figure above it. This is the
 * same identity for the month in focus — the branch column of the table, added up,
 * plus that month's transfer. Null when there is no transfer to explain, or when
 * the rows do not add up (a reader who cannot see every branch), because the
 * sentence would then be false.
 */
export function monthReconciliation(
  rows: BranchMonthlyRow[],
  cell: BusinessMonthCell
): { branchNetProfitSum: number; internalTransfer: number; netProfit: number } | null {
  const branchSum = rows.reduce((sum, row) => sum + paise(netIn(row, cell.month)), 0);
  const transfer = paise(cell.internalTransfer);
  const net = paise(cell.netProfit);
  if (transfer === 0 || branchSum + transfer !== net) return null;
  return { branchNetProfitSum: branchSum / 100, internalTransfer: transfer / 100, netProfit: net / 100 };
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
