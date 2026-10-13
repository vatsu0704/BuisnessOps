import { useTranslation } from 'react-i18next';
import { IoInformationCircleOutline } from 'react-icons/io5';
import ErrorBanner from '@/components/ui/ErrorBanner';
import Spinner from '@/components/ui/Spinner';
import type { CrossBusinessReport } from '@/types/analytics';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import MetricGrid from './MetricGrid';
import styles from './ReportCard.module.css';
import layout from './CrossBusinessSection.module.css';

/**
 * Every business this account holds, side by side — requirements 13 and 16.
 * Totals only: somebody comparing four businesses is asking which one needs
 * attention, and its branches are one switch away.
 *
 * Currencies are never added together. When they differ, each business still
 * shows its own total and the combined figure is withheld with a line saying why.
 */
export default function CrossBusinessSection({
  cross,
  isLoading,
  error,
}: {
  cross: CrossBusinessReport | null;
  isLoading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();

  if (isLoading && !cross) {
    return (
      <div className={layout.loading}>
        <Spinner size={24} />
      </div>
    );
  }
  if (error && !cross) return <ErrorBanner message={error} />;
  if (!cross || cross.businesses.length === 0) {
    return <p className={cx(styles.card, layout.empty)}>{t('reports.noBusinesses')}</p>;
  }

  return (
    <div className={layout.wrap}>
      {error ? <ErrorBanner message={error} /> : null}

      {cross.combined ? (
        <section className={styles.card} aria-labelledby="combined-title">
          <h2 id="combined-title" className={styles.sectionTitle}>
            {t('reports.combinedTotal')}
          </h2>
          <p className={cx(styles.hero, Number(cross.combined.netProfit) < 0 && styles.loss)}>
            {formatAmount(Number(cross.combined.netProfit), cross.currency ?? 'INR')}
          </p>
          <p className={styles.figureLabel}>{t('reports.acrossBusinesses', { count: cross.businessCount })}</p>
        </section>
      ) : (
        <p className={cx(styles.card, styles.flag)}>
          <IoInformationCircleOutline size={16} aria-hidden="true" />
          <span>{t('reports.notComparableCurrency')}</span>
        </p>
      )}

      <div className={layout.grid}>
        {cross.businesses.map((business) => {
          const net = Number(business.total.netProfit);
          const vendorSpend = Number(business.total.vendorSpend);
          return (
            <article key={business.businessId} className={styles.card} aria-label={business.businessName}>
              <h3 className={styles.name}>{business.businessName}</h3>
              <p className={styles.code}>
                {t('reports.branchBreakdown', { trading: business.tradingBranchCount, total: business.branchCount })}
              </p>
              <p className={cx(styles.figure, net < 0 && styles.loss)}>{formatAmount(net, business.currency)}</p>
              <p className={styles.figureLabel}>{t('reports.netProfit')}</p>
              <MetricGrid
                metrics={[
                  {
                    label: t('reports.customerSales'),
                    value: formatAmount(Number(business.total.customerSales), business.currency),
                  },
                  {
                    label: t('reports.expenses'),
                    value: formatAmount(Number(business.total.expenses), business.currency),
                    tone: 'cost',
                  },
                  {
                    label: t('reports.payroll'),
                    value: formatAmount(Number(business.total.payroll), business.currency),
                    tone: 'cost',
                    caption: business.total.payrollProvisional ? t('reports.provisional') : undefined,
                  },
                  // Requirement 25: money that left the business for a vendor, only when there was some.
                  ...(vendorSpend !== 0
                    ? [
                        {
                          label: t('reports.vendorSpend'),
                          value: formatAmount(vendorSpend, business.currency),
                          tone: 'cost' as const,
                        },
                      ]
                    : []),
                  {
                    label: t('reports.internalTransfer'),
                    value: formatAmount(Number(business.total.internalTransfer), business.currency),
                    caption: t('reports.internalTransferCaption'),
                  },
                ]}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
