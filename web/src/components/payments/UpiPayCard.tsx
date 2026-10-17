import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  IoAlertCircleOutline,
  IoCheckmark,
  IoCheckmarkCircle,
  IoCubeOutline,
  IoOpenOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { buildUpiUri, isUpiCurrency, type UpiPayee } from '@shared/utils/upiUri';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { formatAmountPrecise } from '@/utils/format';
import QrCode from './QrCode';
import styles from './UpiPayCard.module.css';

/** Each kind of payee drawn its own way — a `Record`, so a new kind fails `tsc` until it has one. */
const PAYEE_ICONS: Record<UpiPayee['kind'], IconType> = {
  WAREHOUSE: IoCubeOutline,
  VENDOR: IoStorefrontOutline,
  COUNTER: IoStorefrontOutline,
};

/** A phone or tablet, where a `upi://` link can open the UPI app on the same device. */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

/**
 * A UPI payment for an exact amount — the app's `UpiPayCard`: who it goes to,
 * the amount, and the QR to scan (requirements 26 and 32). The amount and the
 * note are in the code, so nobody types either.
 *
 * At the counter the customer pays from their own phone by scanning this one, so
 * there is no "pay with the UPI app on this device". Elsewhere the payer is the
 * person looking at the page: on a laptop they scan it with their phone, and on a
 * phone or tablet they can also open their UPI app straight from the link.
 */
export default function UpiPayCard({
  payee,
  amount,
  currency,
  note,
  onDone,
  doneLabel,
  doneBusy,
  done,
  onUndo,
}: {
  payee: UpiPayee;
  /** The exact amount, paise included — the QR asks for precisely this. */
  amount: number;
  currency: string;
  /** What the receiver reads in their UPI app: the branch code and the token or order numbers. */
  note: string;
  /** "Payment done". Left out where somebody else will record the payment. */
  onDone?: () => void;
  doneLabel?: string;
  doneBusy?: boolean;
  /** A tick in place of the button, and a way to take it back — the supply cart's per-supplier step. */
  done?: boolean;
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const payable = !!payee.upiId && isUpiCurrency(currency) && amount > 0;
  const uri = useMemo(
    () => (payable && payee.upiId ? buildUpiUri({ upiId: payee.upiId, name: payee.name, amount, note }) : null),
    [payable, payee.upiId, payee.name, amount, note]
  );
  const amountLabel = formatAmountPrecise(amount, currency);
  const Icon = PAYEE_ICONS[payee.kind];

  return (
    <section className={styles.card} aria-label={t('upiPay.payTo', { name: payee.name })}>
      <div className={styles.header}>
        <span className={styles.iconTile} aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className={styles.headerText}>
          <p className={styles.title}>{t('upiPay.payTo', { name: payee.name })}</p>
          {payee.upiId ? <p className={styles.upiId}>{payee.upiId}</p> : null}
        </div>
      </div>

      <p className={styles.amount}>{amountLabel}</p>

      {uri ? (
        <>
          <div className={styles.qrFrame}>
            <QrCode value={uri} label={t('upiPay.qrLabel', { amount: amountLabel, name: payee.name })} />
          </div>
          {payee.kind === 'COUNTER' ? (
            <p className={styles.hint}>{t('upiPay.scanHintCounter')}</p>
          ) : (
            <>
              <p className={styles.hint}>{t('upiPay.scanHint')}</p>
              {isTouchDevice() ? (
                <a className={styles.openApp} href={uri}>
                  <IoOpenOutline size={16} aria-hidden="true" />
                  <span>{t('upiPay.openApp')}</span>
                </a>
              ) : null}
            </>
          )}
        </>
      ) : (
        <p className={styles.notSet}>
          <IoAlertCircleOutline size={16} aria-hidden="true" />
          <span>{isUpiCurrency(currency) ? t('upiPay.notSet', { name: payee.name }) : t('upiPay.notRupees')}</span>
        </p>
      )}

      {onDone && uri ? (
        done ? (
          <div className={styles.doneRow}>
            <span className={styles.doneMark}>
              <IoCheckmarkCircle size={18} aria-hidden="true" />
              {t('upiPay.doneMarked')}
            </span>
            {onUndo ? (
              <button type="button" className={styles.undo} onClick={onUndo}>
                {t('upiPay.undo')}
              </button>
            ) : null}
          </div>
        ) : (
          <PrimaryButton
            type="button"
            block
            title={doneLabel ?? t('upiPay.done')}
            icon={IoCheckmark}
            loading={doneBusy}
            onClick={onDone}
          />
        )
      ) : null}
    </section>
  );
}
