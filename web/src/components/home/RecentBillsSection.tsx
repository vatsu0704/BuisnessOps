import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoCloudUploadOutline } from 'react-icons/io5';
import { pendingSales } from '@shared/utils/counterQueue';
import Pill from '@/components/ui/Pill';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useToday } from '@/hooks/useToday';
import { useCounterStore } from '@/store/counterStore';
import { pathTo } from '@/routes/paths';
import { formatTime } from '@/utils/date';
import { cx } from '@/utils/cx';
import { formatAmountPrecise } from '@/utils/format';
import styles from './RecentBillsSection.module.css';

/**
 * The day's latest bills (requirement 33), like the list a till app opens on —
 * and, when this browser has bills it has not sent yet, how many, so a number on
 * Home never quietly disagrees with the counter. Gated on `counterOrder:create`
 * by Home; the server sends the list only to somebody who bills.
 */
export default function RecentBillsSection() {
  const { t } = useTranslation();
  const { today } = useToday();
  const businessId = useBusinessId();
  const unsent = useCounterStore((s) => (s.loadedFor === businessId ? pendingSales(s.queue).length : 0));

  const bills = today?.recentBills ?? [];
  if (bills.length === 0 && unsent === 0) return null;
  const severalBranches = new Set(bills.map((bill) => bill.branchId)).size > 1;

  return (
    <section className={styles.card} aria-labelledby="home-recent-bills-title">
      <div className={styles.head}>
        <h2 id="home-recent-bills-title" className={styles.title}>
          {t('home.recentBills')}
        </h2>
        <Link to={pathTo('counter')} className={styles.link}>
          {t('home.seeAll')}
        </Link>
      </div>

      {unsent > 0 ? (
        <p className={styles.unsent}>
          <IoCloudUploadOutline size={15} aria-hidden="true" />
          {t('counter.sync.pending', { count: unsent })}
        </p>
      ) : null}

      <ul className={styles.list}>
        {bills.map((bill) => {
          const isVoid = bill.status === 'VOID';
          return (
            <li key={bill.id} className={styles.row}>
              <span className={styles.text}>
                <span className={cx(styles.bill, isVoid && styles.void)}>
                  {t('counter.billTitle', { token: bill.tokenNumber })}
                </span>
                <span className={styles.meta}>
                  {t('counter.itemCount', { count: bill.itemCount })} · {formatTime(bill.at, t)}
                  {severalBranches ? ` · ${bill.branchName}` : ''}
                </span>
              </span>
              <span className={styles.right}>
                <span className={cx(styles.amount, isVoid && styles.void)}>
                  {formatAmountPrecise(Number(bill.totalAmount), bill.currency)}
                </span>
                {isVoid ? (
                  <Pill label={t('counterStatus.VOID')} tone="muted" />
                ) : bill.paymentMethod === 'UPI' || bill.paymentMethod === 'CASH' ? (
                  <Pill label={t(`paymentMethod.${bill.paymentMethod}`)} tone="brand" />
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
