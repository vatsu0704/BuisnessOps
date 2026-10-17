import type { TFunction } from 'i18next';
import type { ReportMetric } from '../types/analytics';
import { formatAmount } from './format';

/**
 * Requirement 34's three kinds of cost and their total, as the metric tiles
 * every report card shows — one place, shared with the web, so the month card, a
 * branch card and a day all say it the same way in both apps.
 *
 * Each caption says what is inside the line that is not an expense category, so
 * a reader adding the expense log up is not surprised: variable includes raw
 * material (at the business level, only what went to vendors — the warehouse
 * transfer never left the business), and fixed includes wages.
 */
export function costMetrics(
  cell: {
    variableExpenses: string;
    fixedExpenses: string;
    dailyExpenses: string;
    totalCost: string;
  },
  {
    t,
    currency,
    rawMaterial,
    rawMaterialKey,
    wages,
    wagesProvisional = false,
    fixedShared = false,
  }: {
    t: TFunction;
    currency: string;
    /** What part of variable is raw material; omitted from the caption when zero. */
    rawMaterial: number;
    rawMaterialKey: 'reports.variableIncludesMaterial' | 'reports.variableIncludesVendors';
    /** What part of fixed is wages. */
    wages: number;
    wagesProvisional?: boolean;
    /** The per-day view: fixed is the month's fixed costs spread over its days. */
    fixedShared?: boolean;
  }
): ReportMetric[] {
  const fixedCaption = fixedShared
    ? t('reports.fixedShared')
    : wagesProvisional
      ? t('reports.fixedIncludesWagesProvisional', { amount: formatAmount(wages, currency) })
      : wages !== 0
        ? t('reports.fixedIncludesWages', { amount: formatAmount(wages, currency) })
        : undefined;

  return [
    {
      label: t('reports.variableExpenses'),
      value: formatAmount(Number(cell.variableExpenses), currency),
      tone: 'cost',
      caption: rawMaterial !== 0 ? t(rawMaterialKey, { amount: formatAmount(rawMaterial, currency) }) : undefined,
    },
    {
      label: t('reports.fixedExpenses'),
      value: formatAmount(Number(cell.fixedExpenses), currency),
      tone: 'cost',
      caption: fixedCaption,
    },
    { label: t('reports.dailyExpenses'), value: formatAmount(Number(cell.dailyExpenses), currency), tone: 'cost' },
    { label: t('reports.totalCost'), value: formatAmount(Number(cell.totalCost), currency), tone: 'cost' },
  ];
}
