import type { TFunction } from 'i18next';
import { formatAmount } from '@/utils/format';
import type { Metric } from './MetricGrid';

/**
 * Requirement 34's three kinds of cost and their total, as every report card
 * shows them — the web's twin of the app's `components/reports/costMetrics.ts`,
 * reading the same server fields and the same translation keys.
 */
export function costMetrics(
  cell: { variableExpenses: string; fixedExpenses: string; dailyExpenses: string; totalCost: string },
  {
    t,
    currency,
    rawMaterial,
    rawMaterialKey,
    wages,
    wagesProvisional = false,
  }: {
    t: TFunction;
    currency: string;
    rawMaterial: number;
    rawMaterialKey: 'reports.variableIncludesMaterial' | 'reports.variableIncludesVendors';
    wages: number;
    wagesProvisional?: boolean;
  }
): Metric[] {
  const fixedCaption = wagesProvisional
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
    { label: t('reports.fixedExpenses'), value: formatAmount(Number(cell.fixedExpenses), currency), tone: 'cost', caption: fixedCaption },
    { label: t('reports.dailyExpenses'), value: formatAmount(Number(cell.dailyExpenses), currency), tone: 'cost' },
    { label: t('reports.totalCost'), value: formatAmount(Number(cell.totalCost), currency), tone: 'cost' },
  ];
}
