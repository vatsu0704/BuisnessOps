import { describe, expect, it } from 'vitest';
import type { BranchMonthlyRow, BusinessMonthCell, TrendDirection } from '@/types/analytics';
import { decliningBranches, monthReconciliation, rankBranches, trendPercent } from './ranking';

function row(
  branchId: string,
  net: Record<string, number>,
  { costCentre = false, direction = 'FLAT' as TrendDirection, change = null as string | null } = {}
): BranchMonthlyRow {
  return {
    branchId,
    isCostCentre: costCentre,
    months: Object.entries(net).map(([month, value]) => ({ month, netProfit: String(value) })),
    trend: { direction, changePercent: change, comparable: change !== null },
  } as unknown as BranchMonthlyRow;
}

describe('rankBranches', () => {
  it('ranks by the month being read, with cost centres last', () => {
    const rows = [
      row('wh', { '2026-09': -9000, '2026-10': -8000 }, { costCentre: true }),
      row('sg', { '2026-09': 50000, '2026-10': 10000 }),
      row('pr', { '2026-09': 20000, '2026-10': 30000 }),
    ];
    expect(rankBranches(rows, '2026-10').map((r) => r.branchId)).toEqual(['pr', 'sg', 'wh']);
    expect(rankBranches(rows, '2026-09').map((r) => r.branchId)).toEqual(['sg', 'pr', 'wh']);
  });
});

describe('decliningBranches', () => {
  it('lists only the branches that fell, worst first, unmeasured falls last', () => {
    const rows = [
      row('a', {}, { direction: 'DOWN', change: '-12.5' }),
      row('b', {}, { direction: 'FLAT', change: '-1' }),
      row('c', {}, { direction: 'DOWN', change: null }),
      row('d', {}, { direction: 'DOWN', change: '-40' }),
      row('e', {}, { direction: 'UP', change: '25' }),
    ];
    expect(decliningBranches(rows).map((r) => r.branchId)).toEqual(['d', 'a', 'c']);
  });
});

describe('monthReconciliation', () => {
  const rows = [
    row('sg', { '2026-09': 1000.1, '2026-10': 2000.2 }),
    row('wh', { '2026-09': -500, '2026-10': -800.1 }, { costCentre: true }),
  ];
  const cell = (month: string, transfer: string, net: string) =>
    ({ month, internalTransfer: transfer, netProfit: net }) as BusinessMonthCell;

  it("states the month's own arithmetic: the branches, plus their own warehouse, is the business", () => {
    expect(monthReconciliation(rows, cell('2026-10', '300.30', '1500.40'))).toEqual({
      branchNetProfitSum: 1200.1,
      internalTransfer: 300.3,
      netProfit: 1500.4,
    });
  });

  it('says nothing when there is no transfer, or when the rows do not add up', () => {
    expect(monthReconciliation(rows, cell('2026-10', '0.00', '1200.10'))).toBeNull();
    expect(monthReconciliation(rows, cell('2026-09', '100.00', '9999.00'))).toBeNull();
  });
});

describe('trendPercent', () => {
  it('states a signed, rounded percentage only when there is one', () => {
    expect(trendPercent({ direction: 'UP', changePercent: '12.6', comparable: true })).toBe('+13%');
    expect(trendPercent({ direction: 'DOWN', changePercent: '-40', comparable: true })).toBe('-40%');
    expect(trendPercent({ direction: 'UP', changePercent: null, comparable: false })).toBeNull();
  });
});
