import { useTranslation } from 'react-i18next';
import StatTile from '@/components/ui/StatTile';
import { useBranches } from '@/hooks/useBranches';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import { formatAmount } from '@/utils/format';
import styles from './SalesTilesSection.module.css';

/** The three headline numbers. Gated on `analytics:viewBranch` by Home. */
export default function SalesTilesSection() {
  const { t } = useTranslation();
  const { stats } = useBranches();
  const sales = useSalesSummary();

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <StatTile
          label={t('home.statSales')}
          value={sales.totalSales}
          accent="var(--color-success)"
          formatValue={(v) => formatAmount(v, sales.currency)}
        />
        <StatTile label={t('home.statTransactions')} value={sales.transactionCount} />
        <StatTile label={t('home.statBranches')} value={stats.trading} />
      </div>
    </div>
  );
}
