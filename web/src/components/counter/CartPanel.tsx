import { useTranslation } from 'react-i18next';
import { IoAdd, IoInformationCircleOutline, IoRemove, IoTrashOutline } from 'react-icons/io5';
import { cartItemCount, cartTotal, lineTotal } from '@shared/utils/counterQueue';
import PrimaryButton from '@/components/ui/PrimaryButton';
import type { CartLine } from '@/types/counter';
import { cx } from '@/utils/cx';
import { formatAmountPrecise } from '@/utils/format';
import styles from './CartPanel.module.css';

/**
 * The bill being rung up — the app's CartTray. Each line with a stepper (the
 * last step down removes it), Clear, the total on its own row, and **Charge**
 * across the full width under it: a total and a button side by side is the row
 * that breaks first in Gujarati.
 *
 * Beside the menu on a wide window, pinned to the foot of the page on a narrow
 * one (the page decides); either way the lines scroll inside it so the total and
 * Charge never leave the screen.
 */
export default function CartPanel({
  lines,
  currency,
  blockedReason,
  onChangeQuantity,
  onClear,
  onCharge,
}: {
  lines: CartLine[];
  currency: string;
  /** Why no bill can be taken now — the plan has ended, the day is closed — or null. */
  blockedReason: string | null;
  onChangeQuantity: (index: number, quantity: number) => void;
  onClear: () => void;
  onCharge: () => void;
}) {
  const { t } = useTranslation();
  const items = cartItemCount(lines);
  const total = cartTotal(lines);

  return (
    <section className={styles.panel} aria-labelledby="counter-cart-title">
      {blockedReason ? (
        <p className={styles.blocked}>
          <IoInformationCircleOutline size={16} aria-hidden="true" />
          <span>{blockedReason}</span>
        </p>
      ) : null}

      {lines.length === 0 ? (
        <p id="counter-cart-title" className={styles.empty}>
          {t('counter.cartEmpty')}
        </p>
      ) : (
        <>
          <div className={styles.head}>
            <h2 id="counter-cart-title" className={styles.headText}>
              {t('counter.itemCount', { count: items })}
            </h2>
            <button type="button" className={styles.clear} onClick={onClear}>
              {t('counter.clearCart')}
            </button>
          </div>

          <ul className={styles.lines}>
            {lines.map((line, index) => (
              <li key={`${line.productId ?? line.name}-${index}`} className={styles.line}>
                <span className={styles.lineName}>{line.name}</span>
                <span className={styles.stepper}>
                  <button
                    type="button"
                    className={cx(styles.step, line.quantity === 1 && styles.stepRemove)}
                    onClick={() => onChangeQuantity(index, line.quantity - 1)}
                    aria-label={t('web.counter.less', { name: line.name })}
                  >
                    {line.quantity === 1 ? (
                      <IoTrashOutline size={14} aria-hidden="true" />
                    ) : (
                      <IoRemove size={14} aria-hidden="true" />
                    )}
                  </button>
                  <span className={styles.quantity} aria-live="polite">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    className={styles.step}
                    onClick={() => onChangeQuantity(index, line.quantity + 1)}
                    aria-label={t('web.counter.more', { name: line.name })}
                  >
                    <IoAdd size={14} aria-hidden="true" />
                  </button>
                </span>
                <span className={styles.lineTotal}>{formatAmountPrecise(lineTotal(line), currency)}</span>
              </li>
            ))}
          </ul>

          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>{t('counter.billTotal')}</span>
            <span className={styles.totalValue}>{formatAmountPrecise(total, currency)}</span>
          </div>
          <PrimaryButton
            type="button"
            block
            title={t('counter.charge', { amount: formatAmountPrecise(total, currency) })}
            disabled={!!blockedReason}
            onClick={onCharge}
            aria-keyshortcuts="Control+Enter"
          />
        </>
      )}
    </section>
  );
}
