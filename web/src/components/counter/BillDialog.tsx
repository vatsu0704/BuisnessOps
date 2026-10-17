import { useTranslation } from 'react-i18next';
import { IoAlertCircleOutline, IoCloseCircleOutline, IoCloudUploadOutline, IoPrintOutline } from 'react-icons/io5';
import type { DisplayBill } from '@shared/utils/counterQueue';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import ErrorBanner from '@/components/ui/ErrorBanner';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { cx } from '@/utils/cx';
import { formatTime } from '@/utils/date';
import { formatAmountPrecise } from '@/utils/format';
import styles from './BillDialog.module.css';

/**
 * One bill from the day's list — the app's BillSheet: what was on it, whether
 * the server has it, and the two things done to a bill already taken: print it
 * again, or void it. Never edit it: the slip in the customer's hand has to keep
 * matching the record (requirement 29), so a wrong bill is voided and rung up again.
 */
export default function BillDialog({
  bill,
  currency,
  canVoid,
  canPrint,
  busy,
  error,
  onPrint,
  onVoid,
  onClose,
}: {
  bill: DisplayBill | null;
  currency: string;
  canVoid: boolean;
  canPrint: boolean;
  busy: boolean;
  error: string | null;
  onPrint: (bill: DisplayBill) => void;
  onVoid: (bill: DisplayBill) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isVoid = bill?.status === 'VOID';

  return (
    <Dialog open={!!bill} title={bill ? t('counter.billTitle', { token: bill.tokenNumber }) : ''} onClose={onClose}>
      {bill ? (
        <div className={styles.body}>
          <p className={styles.time}>{formatTime(bill.at, t)}</p>
          <div className={styles.pills}>
            {bill.paymentMethod === 'UPI' || bill.paymentMethod === 'CASH' ? (
              <Pill label={t(`paymentMethod.${bill.paymentMethod}`)} tone="brand" />
            ) : null}
            {isVoid ? <Pill label={t('counterStatus.VOID')} tone="muted" /> : null}
            {bill.rejected ? (
              <Pill label={t('counter.needsAttention')} tone="danger" icon={IoAlertCircleOutline} />
            ) : !bill.synced ? (
              <Pill label={t('counter.notSent')} tone="warning" icon={IoCloudUploadOutline} />
            ) : null}
            {bill.printedNumber !== null ? (
              <Pill label={t('counter.printedAs', { token: bill.printedNumber })} tone="muted" />
            ) : null}
          </div>

          <ul className={styles.lines}>
            {bill.lines.map((line, index) => (
              <li key={`${line.name}-${index}`} className={styles.line}>
                <span className={styles.lineName}>
                  {line.quantity} × {line.name}
                </span>
                <span className={styles.lineTotal}>{formatAmountPrecise(line.lineTotal, currency)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>{t('counter.billTotal')}</span>
            <span className={cx(styles.totalValue, isVoid && styles.voided)}>
              {formatAmountPrecise(bill.total, currency)}
            </span>
          </div>

          {error ? <ErrorBanner message={error} /> : null}

          {(canPrint || canVoid) && !isVoid ? (
            <div className={styles.actions}>
              {canPrint ? (
                <PrimaryButton
                  type="button"
                  block
                  title={t('counter.printAgain')}
                  icon={IoPrintOutline}
                  loading={busy}
                  onClick={() => onPrint(bill)}
                />
              ) : null}
              {canVoid ? (
                <Button
                  type="button"
                  variant="danger"
                  block
                  title={t('counter.voidBill')}
                  icon={IoCloseCircleOutline}
                  disabled={busy}
                  onClick={() => onVoid(bill)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
