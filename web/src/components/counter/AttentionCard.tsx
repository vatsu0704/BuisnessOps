import { useTranslation } from 'react-i18next';
import { IoAlertCircle, IoLockOpenOutline, IoRefresh, IoTrashOutline } from 'react-icons/io5';
import { translateSaleRejection } from '@/api/errorMessages';
import type { LocalSale } from '@/types/counter';
import { cx } from '@/utils/cx';
import { formatAmountPrecise } from '@/utils/format';
import styles from './AttentionCard.module.css';

/**
 * Bills the server refused (requirement 30), kept in this browser for a person —
 * never dropped on the browser's own initiative. Each says why, in the reader's
 * language, and offers what can be done: send it again, open the closed day it
 * belongs to (for whoever may close days), or remove it, which asks first.
 */
export default function AttentionCard({
  sales,
  canReopenDay,
  busyRef,
  onRetry,
  onReopenDay,
  onRemove,
}: {
  sales: LocalSale[];
  canReopenDay: boolean;
  busyRef: string | null;
  onRetry: (sale: LocalSale) => void;
  onReopenDay: (sale: LocalSale) => void;
  onRemove: (sale: LocalSale) => void;
}) {
  const { t } = useTranslation();
  if (sales.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="counter-attention-title">
      <div className={styles.head}>
        <IoAlertCircle size={18} aria-hidden="true" />
        <h2 id="counter-attention-title" className={styles.title}>
          {t('counter.attentionTitle', { count: sales.length })}
        </h2>
      </div>
      <p className={styles.body}>{t('web.counter.attentionBody')}</p>

      <ul className={styles.list}>
        {sales.map((sale) => {
          const busy = busyRef === sale.clientRef;
          const dayClosed = sale.rejection?.code === 'COUNTER_ORDER_DAY_CLOSED';
          return (
            <li key={sale.clientRef} className={styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.token}>{sale.tokenNumber}</span>
                <div className={styles.rowText}>
                  <p className={styles.amount}>{formatAmountPrecise(sale.total, sale.currency)}</p>
                  <p className={styles.meta}>{sale.dayKey}</p>
                </div>
              </div>
              {sale.rejection ? (
                <p className={styles.reason}>{translateSaleRejection(sale.rejection.code, sale.rejection.params)}</p>
              ) : null}
              <div className={styles.actions}>
                {dayClosed && canReopenDay ? (
                  <button type="button" className={styles.action} disabled={busy} onClick={() => onReopenDay(sale)}>
                    <IoLockOpenOutline size={15} aria-hidden="true" />
                    {t('counter.reopenDay')}
                  </button>
                ) : null}
                <button type="button" className={styles.action} disabled={busy} onClick={() => onRetry(sale)}>
                  <IoRefresh size={15} aria-hidden="true" />
                  {t('counter.sendAgain')}
                </button>
                <button
                  type="button"
                  className={cx(styles.action, styles.danger)}
                  disabled={busy}
                  onClick={() => onRemove(sale)}
                >
                  <IoTrashOutline size={15} aria-hidden="true" />
                  {t('web.counter.removeFromBrowser')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
