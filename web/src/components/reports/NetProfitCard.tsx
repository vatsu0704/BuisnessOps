import { useTranslation } from 'react-i18next';
import { IoAlertCircleOutline, IoInformationCircleOutline } from 'react-icons/io5';
import type { BusinessMonthCell } from '@/types/analytics';
import { cx } from '@/utils/cx';
import { monthKeyLabel } from '@/utils/date';
import { formatAmount } from '@/utils/format';
import MetricGrid, { type Metric } from './MetricGrid';
import styles from './ReportCard.module.css';

/**
 * The business's net profit for the month in focus — requirement 13.
 *
 * The branch cards below do not add up to this figure, and should not: money a
 * shop pays its own warehouse is real money out of that shop and none out of the
 * business. So the sentence at the foot states the arithmetic in full, for the
 * person who adds the column up — for this month (`monthReconciliation`), and only
 * when there is a transfer to explain. Raw material from a vendor did leave the
 * business, so it has its own line.
 */
export default function NetProfitCard({
  cell,
  reconciliation,
  currency,
  mixedCurrency,
}: {
  cell: BusinessMonthCell;
  /** This month's, or null when there is nothing to explain. */
  reconciliation: { branchNetProfitSum: number; internalTransfer: number; netProfit: number } | null;
  currency: string;
  mixedCurrency: boolean;
}) {
  const { t } = useTranslation();
  const net = Number(cell.netProfit);
  const transfer = Number(cell.internalTransfer);
  const vendorSpend = Number(cell.vendorSpend);

  const metrics: Metric[] = [
    { label: t('reports.customerSales'), value: formatAmount(Number(cell.customerSales), currency) },
    { label: t('reports.expenses'), value: formatAmount(Number(cell.expenses), currency), tone: 'cost' },
    { label: t('reports.payroll'), value: formatAmount(Number(cell.payroll), currency), tone: 'cost' },
    ...(vendorSpend !== 0
      ? [
          {
            label: t('reports.vendorSpend'),
            value: formatAmount(vendorSpend, currency),
            tone: 'cost' as const,
            caption: t('reports.vendorSpendCaption'),
          },
        ]
      : []),
    {
      label: t('reports.internalTransfer'),
      value: formatAmount(transfer, currency),
      caption: t('reports.internalTransferCaption'),
    },
  ];

  return (
    <section className={styles.card} aria-labelledby="net-profit-label">
      <p className={styles.caption}>{monthKeyLabel(cell.month, t)}</p>
      <h2 id="net-profit-label" className={cx(styles.sectionTitle, styles.titleGap)}>
        {t('reports.netProfit')}
      </h2>
      <p className={cx(styles.hero, net < 0 && styles.loss)}>{formatAmount(net, currency)}</p>

      {cell.payrollProvisional ? (
        <p className={styles.flag}>
          <IoAlertCircleOutline size={15} aria-hidden="true" />
          <span>{t('reports.provisionalPayroll')}</span>
        </p>
      ) : null}
      {mixedCurrency ? (
        <p className={styles.flag}>
          <IoInformationCircleOutline size={15} aria-hidden="true" />
          <span>{t('reports.mixedCurrency')}</span>
        </p>
      ) : null}

      <MetricGrid metrics={metrics} />

      {reconciliation && !mixedCurrency ? (
        <p className={styles.note}>
          {t('reports.reconciliationNote', {
            branchSum: formatAmount(reconciliation.branchNetProfitSum, currency),
            transfer: formatAmount(reconciliation.internalTransfer, currency),
            total: formatAmount(reconciliation.netProfit, currency),
          })}
        </p>
      ) : null}
    </section>
  );
}
