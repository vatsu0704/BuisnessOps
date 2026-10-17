import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoAdd,
  IoAlertCircleOutline,
  IoCashOutline,
  IoCheckmark,
  IoCheckmarkCircle,
  IoCheckmarkDoneOutline,
  IoInformationCircleOutline,
  IoPrintOutline,
  IoQrCodeOutline,
} from 'react-icons/io5';
import { Link } from 'react-router';
import { money } from '@shared/utils/counterQueue';
import { isUpiCurrency } from '@shared/utils/upiUri';
import UpiPayCard from '@/components/payments/UpiPayCard';
import ChipGroup from '@/components/ui/ChipGroup';
import Dialog from '@/components/ui/Dialog';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { pathTo } from '@/routes/paths';
import type { CounterPayee, CounterPaymentMethod } from '@/types/counter';
import { cx } from '@/utils/cx';
import { formatAmountPrecise } from '@/utils/format';
import styles from './ChargeDialog.module.css';

/**
 * What happened to the token's printout, for the done step. `dialog` is the
 * web's own: the slip went to the browser's print dialog, whose outcome a page
 * cannot know.
 */
export type PrintState = 'printing' | 'printed' | 'failed' | 'off' | 'noPrinter' | 'dialog';

export type ChargeDone = {
  tokenNumber: number;
  print: PrintState;
  printError: string | null;
};

/** Notes a customer might hand over; the ones above the bill are offered. */
const NOTES = [10, 20, 50, 100, 200, 500, 2000];

/**
 * Taking the money, then the token — requirement 29, the app's ChargeSheet.
 *
 * First the payment: UPI shows the QR for the exact amount, which the customer
 * scans with their own phone; cash works out the change. Either ends in
 * **Payment done**, which saves the bill in this browser and gives it its token.
 * Then the token, large, with what happened to its printout and the way to print
 * it again, and **Next bill**, which takes the focus so Enter starts the next.
 *
 * Nothing on it asks for confirmation: a bill taken by mistake is voided from the
 * day's list, and a question in front of every sale is one nobody reads by lunch.
 */
export default function ChargeDialog({
  open,
  amount,
  currency,
  payee,
  noteLabel,
  busy,
  done,
  onPaid,
  onPrint,
  onClose,
}: {
  open: boolean;
  amount: number;
  currency: string;
  payee: CounterPayee | null;
  /** In the UPI note, so the shop can match a payment in its bank app to a bill. */
  noteLabel: string;
  busy: boolean;
  done: ChargeDone | null;
  onPaid: (method: CounterPaymentMethod) => void;
  onPrint: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const upiPossible = !!payee && isUpiCurrency(currency);
  const [method, setMethod] = useState<CounterPaymentMethod>(upiPossible ? 'UPI' : 'CASH');
  const [given, setGiven] = useState<number | null>(null);
  const nextBill = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && !done) {
      setMethod(upiPossible ? 'UPI' : 'CASH');
      setGiven(null);
    }
  }, [open, done, upiPossible]);

  // The token is shown: Next bill takes the focus, so Enter goes straight on.
  useEffect(() => {
    if (done) nextBill.current?.focus();
  }, [done]);

  const offers = useMemo(() => NOTES.filter((note) => note > amount).slice(0, 4), [amount]);
  const change = given !== null ? money(given - amount) : null;
  const amountLabel = formatAmountPrecise(amount, currency);

  return (
    <Dialog
      open={open}
      title={done ? t('counter.tokenLabel') : t('counter.chargeTitle')}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="md"
    >
      {done ? (
        <div className={styles.done}>
          <IoCheckmarkCircle size={44} className={styles.doneIcon} aria-hidden="true" />
          <p className={styles.doneToken} aria-live="assertive">
            {done.tokenNumber}
          </p>
          <p className={styles.doneBody}>{t('web.counter.doneBody')}</p>
          <PrintStatus done={done} onPrint={onPrint} />
          <PrimaryButton ref={nextBill} type="button" block title={t('counter.nextBill')} icon={IoAdd} onClick={onClose} />
        </div>
      ) : (
        <div className={styles.pay}>
          <p className={styles.amount}>{amountLabel}</p>

          {upiPossible ? (
            <ChipGroup<CounterPaymentMethod>
              name="counter-pay-method"
              label={t('counter.chargeTitle')}
              hideLabel
              options={[
                { value: 'UPI', label: t('paymentMethod.UPI'), icon: IoQrCodeOutline },
                { value: 'CASH', label: t('paymentMethod.CASH'), icon: IoCashOutline },
              ]}
              value={method}
              onChange={setMethod}
              disabled={busy}
            />
          ) : (
            <p className={styles.note}>
              <IoInformationCircleOutline size={16} aria-hidden="true" />
              <span>{isUpiCurrency(currency) ? t('counter.upiNotSet') : t('upiPay.notRupees')}</span>
            </p>
          )}

          {method === 'UPI' && payee && upiPossible ? (
            <UpiPayCard
              payee={{ kind: 'COUNTER', name: payee.name, upiId: payee.upiId }}
              amount={amount}
              currency={currency}
              note={noteLabel}
              onDone={() => onPaid('UPI')}
              doneLabel={t('counter.paymentDone')}
              doneBusy={busy}
            />
          ) : (
            <div className={styles.cash}>
              <ChipGroup<string>
                name="counter-cash-given"
                label={t('counter.cashGiven')}
                options={[
                  { value: String(amount), label: t('counter.cashExact') },
                  ...offers.map((note) => ({ value: String(note), label: formatAmountPrecise(note, currency) })),
                ]}
                value={given === null ? null : String(given)}
                onChange={(value) => setGiven(Number(value))}
                disabled={busy}
              />
              {change !== null && change > 0 ? (
                <div className={styles.change}>
                  <span className={styles.changeLabel}>{t('counter.cashChange')}</span>
                  <span className={styles.changeValue}>{formatAmountPrecise(change, currency)}</span>
                </div>
              ) : null}
              <PrimaryButton
                type="button"
                block
                title={t('counter.paymentDone')}
                icon={IoCheckmark}
                loading={busy}
                onClick={() => onPaid('CASH')}
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function PrintStatus({ done, onPrint }: { done: ChargeDone; onPrint: () => void }) {
  const { t } = useTranslation();

  if (done.print === 'printing') {
    return (
      <p className={styles.printRow}>
        <IoPrintOutline size={16} aria-hidden="true" />
        {t('counter.printing')}
      </p>
    );
  }
  if (done.print === 'noPrinter') {
    return (
      <div className={styles.printBlock}>
        <p className={styles.printRow}>{t('web.counter.noPrinter')}</p>
        <Link to={pathTo('receiptPrinter')} className={styles.link}>
          {t('counter.setUpPrinter')}
        </Link>
      </div>
    );
  }
  const printed = done.print === 'printed' || done.print === 'dialog';
  return (
    <div className={styles.printBlock}>
      {printed ? (
        <p className={cx(styles.printRow, styles.success)}>
          <IoCheckmarkDoneOutline size={16} aria-hidden="true" />
          {done.print === 'dialog' ? t('web.counter.printDialog') : t('counter.printed')}
        </p>
      ) : null}
      {done.print === 'failed' && done.printError ? (
        <p className={cx(styles.printRow, styles.error)} role="alert">
          <IoAlertCircleOutline size={16} aria-hidden="true" />
          {done.printError}
        </p>
      ) : null}
      <button type="button" className={styles.link} onClick={onPrint}>
        <IoPrintOutline size={16} aria-hidden="true" />
        {done.print === 'off' ? t('counter.printToken') : t('counter.printAgain')}
      </button>
    </div>
  );
}
