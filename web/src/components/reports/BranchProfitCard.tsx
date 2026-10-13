import { useTranslation } from 'react-i18next';
import { IoCubeOutline, IoLockClosedOutline } from 'react-icons/io5';
import Pill from '@/components/ui/Pill';
import type { BranchMonthlyRow } from '@/types/analytics';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import MetricGrid, { type Metric } from './MetricGrid';
import MonthBars from './MonthBars';
import TrendPill from './TrendPill';
import styles from './ReportCard.module.css';

/**
 * One branch across the window — requirements 13 and 15, the app's card. Its
 * months as a shape, one month's figures in full; changing the month in focus
 * moves every card at once.
 *
 * A warehouse is a cost centre: it shows what it spends and nothing it cannot
 * earn, because "sales ₹0" would be a fact about the model, not the business.
 * The server says which rows are cost centres; a shop with a dead month also sells
 * nothing.
 */
export default function BranchProfitCard({
  row,
  month,
  onSelectMonth,
}: {
  row: BranchMonthlyRow;
  month: string;
  onSelectMonth: (month: string) => void;
}) {
  const { t } = useTranslation();
  const cell = row.months.find((candidate) => candidate.month === month) ?? row.months[0];
  if (!cell) return null;

  const net = Number(cell.netProfit);
  const currency = row.currency;
  const payroll: Metric = {
    label: t('reports.payroll'),
    value: formatAmount(Number(cell.payroll), currency),
    tone: 'cost',
    caption: cell.payrollProvisional ? t('reports.provisional') : undefined,
  };
  const expenses: Metric = {
    label: t('reports.expenses'),
    value: formatAmount(Number(cell.expenses), currency),
    tone: 'cost',
  };
  const metrics: Metric[] = row.isCostCentre
    ? [expenses, payroll]
    : [
        {
          label: t('reports.sales'),
          value: formatAmount(Number(cell.sales), currency),
          caption: t('reports.saleCount', { count: cell.saleCount }),
        },
        expenses,
        {
          label: t('reports.materialSpend'),
          value: formatAmount(Number(cell.materialSpend), currency),
          tone: 'cost',
          caption: t('reports.materialOrderCount', { count: cell.materialOrderCount }),
        },
        payroll,
      ];

  return (
    <article className={styles.card} aria-label={row.branchName}>
      <div className={styles.header}>
        <div className={styles.nameBlock}>
          <h3 className={styles.name}>{row.branchName}</h3>
          <p className={styles.code}>{row.branchCode}</p>
        </div>
        <TrendPill trend={row.trend} />
      </div>
      {row.isCostCentre ? (
        <div className={styles.pillRow}>
          <Pill label={t('reports.costCentre')} icon={IoCubeOutline} tone="muted" />
        </div>
      ) : null}

      <p className={cx(styles.figure, net < 0 && styles.loss)}>{formatAmount(net, currency)}</p>
      <p className={styles.figureLabel}>{t('reports.netProfitForMonth')}</p>

      <MetricGrid metrics={metrics} />
      <MonthBars
        bars={row.months.map((candidate) => ({ month: candidate.month, value: Number(candidate.netProfit) }))}
        currency={currency}
        selectedMonth={month}
        onSelectMonth={onSelectMonth}
      />

      {/* A closed branch keeps its history; dropping it would restate every month before it closed. */}
      {row.status !== 'ACTIVE' ? (
        <p className={styles.muted}>
          <IoLockClosedOutline size={12} aria-hidden="true" />
          <span>{t('reports.branchNotActive')}</span>
        </p>
      ) : null}
    </article>
  );
}
