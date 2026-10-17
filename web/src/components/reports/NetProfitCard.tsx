import { useTranslation } from 'react-i18next';
import { IoAlertCircleOutline, IoInformationCircleOutline } from 'react-icons/io5';
import type { BusinessMonthCell } from '@/types/analytics';
import { cx } from '@/utils/cx';
import { monthKeyLabel } from '@/utils/date';
import { formatAmount } from '@/utils/format';
import MetricGrid, { type Metric } from './MetricGrid';
import { costMetrics } from '@shared/utils/costMetrics';
import styles from './ReportCard.module.css';

/**
 * The business's net profit for the month in focus — requirement 13.
 *
 * The branch cards below do not add up to this figure, and should not: money a
 * shop pays its own warehouse is real money out of that shop and none out of the
 * business. So the sentence at the foot states the arithmetic in full, for the
 * person who adds the column up — this month's own, as the server sends it on the
 * cell (requirement 34), and only when there is a transfer to explain and the
 * figures balance. Raw material from a vendor did leave the business, so it is
 * inside Variable.
 */
export default function NetProfitCard({
  cell,
  currency,
  mixedCurrency,
}: {
  cell: BusinessMonthCell;
  currency: string;
  mixedCurrency: boolean;
}) {
  const { t } = useTranslation();
  const net = Number(cell.netProfit);
  const transfer = Number(cell.internalTransfer);
  const vendorSpend = Number(cell.vendorSpend);
  const reconciliation = cell.reconciliation;

  // Requirement 34: what came in, then the three kinds of cost and their total.
  const metrics: Metric[] = [
    { label: t('reports.totalBusiness'), value: formatAmount(Number(cell.customerSales), currency) },
    ...costMetrics(cell, {
      t,
      currency,
      rawMaterial: vendorSpend,
      rawMaterialKey: 'reports.variableIncludesVendors',
      wages: Number(cell.payroll),
      wagesProvisional: cell.payrollProvisional,
    }),
    ...(transfer !== 0
      ? [
          {
            label: t('reports.internalTransfer'),
            value: formatAmount(transfer, currency),
            caption: t('reports.internalTransferCaption'),
          },
        ]
      : []),
  ];

  return (
    <section className={styles.card} aria-labelledby="net-profit-label">
      <p className={styles.caption}>{monthKeyLabel(cell.month, t)}</p>
      <h2 id="net-profit-label" className={cx(styles.sectionTitle, styles.titleGap)}>
        {t('reports.totalProfit')}
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

      {transfer !== 0 && reconciliation.balances && !mixedCurrency ? (
        <p className={styles.note}>
          {t('reports.reconciliationNote', {
            branchSum: formatAmount(Number(reconciliation.branchNetProfitSum), currency),
            transfer: formatAmount(Number(reconciliation.internalTransfer), currency),
            total: formatAmount(Number(reconciliation.netProfit), currency),
          })}
        </p>
      ) : null}
    </section>
  );
}
