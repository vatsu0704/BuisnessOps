import { describe, expect, it } from 'vitest';
import {
  ALL_BRANCHES,
  dailyChoices,
  dailyTotal,
  daysFor,
  listedDays,
  resolveChoice,
} from '@shared/utils/dailyReport';
import type { DailyReport } from '@/types/analytics';

/**
 * Reports' Per day (requirement 34) — the shared arithmetic both apps read a
 * month with.
 */
const day = (key: string, sales: string, cost: string, profit: string) => ({
  day: key,
  sales,
  saleCount: 2,
  expenses: '0',
  expenseCount: 0,
  expenseVariable: '0',
  expenseDaily: '0',
  materialSpend: '10.00',
  vendorSpend: '0',
  variableExpenses: '10.00',
  fixedExpenses: '33.33',
  dailyExpenses: '0',
  totalCost: cost,
  netProfit: profit,
});

const report = {
  month: '2026-10',
  days: ['2026-10-01', '2026-10-02', '2026-10-03'],
  currency: 'INR',
  mixedCurrency: false,
  branches: [
    {
      branchId: 'sg',
      branchName: 'SG Highway',
      days: [
        day('2026-10-01', '100.00', '43.33', '56.67'),
        day('2026-10-02', '200.00', '43.33', '156.67'),
        day('2026-10-03', '0', '43.34', '-43.34'),
      ],
    },
  ],
  business: {
    payrollProvisional: false,
    days: [
      {
        day: '2026-10-01',
        customerSales: '100.00',
        saleCount: 2,
        expenseVariable: '0',
        vendorSpend: '4.00',
        internalTransfer: '6.00',
        variableExpenses: '4.00',
        fixedExpenses: '33.33',
        dailyExpenses: '0',
        totalCost: '37.33',
        netProfit: '62.67',
      },
    ],
  },
} as unknown as DailyReport;

describe('dailyReport', () => {
  it('offers the whole business first only when the server sent it', () => {
    expect(dailyChoices(report)).toEqual([ALL_BRANCHES, 'sg']);
    expect(dailyChoices({ ...report, business: null })).toEqual(['sg']);
    expect(resolveChoice({ ...report, business: null }, ALL_BRANCHES)).toBe('sg');
    expect(resolveChoice(report, 'gone')).toBe(ALL_BRANCHES);
  });

  it("reads the business's raw material as what went to vendors, a branch's as all of it", () => {
    expect(daysFor(report, ALL_BRANCHES)[0]).toMatchObject({ business: 100, rawMaterial: 4, profit: 62.67 });
    expect(daysFor(report, 'sg')[0]).toMatchObject({ business: 100, rawMaterial: 10, profit: 56.67 });
  });

  it('adds the month up from every day, those still to come included', () => {
    const total = dailyTotal(daysFor(report, 'sg'));
    expect(total.business).toBe(300);
    expect(total.saleCount).toBe(6);
    // The spread fixed costs add back to the month's real figure.
    expect(Number(total.fixedExpenses)).toBeCloseTo(99.99);
    expect(Number(total.totalCost)).toBeCloseTo(130);
  });

  it('lists newest first, and leaves out the days that have not happened yet', () => {
    const days = daysFor(report, 'sg');
    expect(listedDays(days, '2026-10-02').map((d) => d.day)).toEqual(['2026-10-02', '2026-10-01']);
    expect(listedDays(days, null).map((d) => d.day)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
  });
});
