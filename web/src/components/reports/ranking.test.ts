import { describe, expect, it } from 'vitest';
import type { BranchMonthlyRow, TrendDirection } from '@/types/analytics';
import { decliningBranches, rankBranches, trendPercent } from './ranking';

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

describe('trendPercent', () => {
  it('states a signed, rounded percentage only when there is one', () => {
    expect(trendPercent({ direction: 'UP', changePercent: '12.6', comparable: true })).toBe('+13%');
    expect(trendPercent({ direction: 'DOWN', changePercent: '-40', comparable: true })).toBe('-40%');
    expect(trendPercent({ direction: 'UP', changePercent: null, comparable: false })).toBeNull();
  });
});
