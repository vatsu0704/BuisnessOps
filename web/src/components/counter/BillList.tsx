import { useTranslation } from 'react-i18next';
import { IoAlertCircleOutline, IoCloudUploadOutline } from 'react-icons/io5';
import type { DisplayBill } from '@shared/utils/counterQueue';
import Pill from '@/components/ui/Pill';
import { cx } from '@/utils/cx';
import { formatTime } from '@/utils/date';
import { formatAmountPrecise } from '@/utils/format';
import styles from './BillList.module.css';

/**
 * Today's bills at this branch, newest first — the server's and the ones this
 * browser has not sent yet, together (`mergeBills`). A bill not yet sent, or
 * refused, says so; a click opens it to print again or void.
 */
export default function BillList({
  bills,
  currency,
  onOpen,
}: {
  bills: DisplayBill[];
  currency: string;
  onOpen: (bill: DisplayBill) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className={styles.list}>
      {bills.map((bill) => {
        const isVoid = bill.status === 'VOID';
        return (
          <li key={bill.key}>
            <button type="button" className={cx(styles.row, isVoid && styles.void)} onClick={() => onOpen(bill)}>
              <span className={cx(styles.token, bill.rejected && styles.tokenError)}>{bill.tokenNumber}</span>
              <span className={styles.text}>
                <span className={styles.total}>{formatAmountPrecise(bill.total, currency)}</span>
                <span className={styles.meta}>
                  {t('counter.itemCount', { count: bill.itemCount })} · {formatTime(bill.at, t)}
                </span>
              </span>
              {!bill.synced ? (
                bill.rejected ? (
                  <IoAlertCircleOutline size={17} className={styles.rejected} aria-label={t('counter.needsAttention')} />
                ) : (
                  <IoCloudUploadOutline size={17} className={styles.unsent} aria-label={t('counter.notSent')} />
                )
              ) : null}
              {isVoid ? (
                <Pill label={t('counterStatus.VOID')} tone="muted" />
              ) : bill.paymentMethod === 'UPI' || bill.paymentMethod === 'CASH' ? (
                <Pill label={t(`paymentMethod.${bill.paymentMethod}`)} tone="brand" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
