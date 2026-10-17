import { useTranslation } from 'react-i18next';
import StatTile from '@/components/ui/StatTile';
import { useToday } from '@/hooks/useToday';
import { formatAmount } from '@/utils/format';
import styles from './TodaySection.module.css';

/**
 * Today's sales, bills and spending — the numbers at the top of Home
 * (requirement 33), across the branches this person reaches, each on its own
 * day. Spending only for somebody who may read expenses: the server leaves it
 * out otherwise, and the tile goes with it. Gated on `analytics:viewToday` by Home.
 */
export default function TodaySection() {
  const { t } = useTranslation();
  const { today } = useToday();
  const totals = today?.totals;
  const currency = today?.currency ?? 'INR';
  const showsExpenses = totals?.expenses !== null && totals?.expenses !== undefined;

  return (
    <section className={styles.wrap} aria-label={t('home.todaySales')}>
      <div className={styles.row}>
        <StatTile
          label={t('home.todaySales')}
          value={Number(totals?.sales ?? 0)}
          accent="var(--color-success)"
          formatValue={(v) => formatAmount(v, currency)}
        />
        <StatTile label={t('home.todayBills')} value={totals?.saleCount ?? 0} />
        {showsExpenses ? (
          <StatTile
            label={t('home.todayExpenses')}
            value={Number(totals?.expenses ?? 0)}
            accent="var(--color-error)"
            formatValue={(v) => formatAmount(v, currency)}
          />
        ) : null}
      </div>
      {today?.mixedCurrency ? <p className={styles.note}>{t('home.todayMixedCurrency')}</p> : null}
    </section>
  );
}
