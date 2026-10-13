import { useTranslation } from 'react-i18next';
import { monthKeyShortLabel } from '@/utils/date';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import styles from './MonthBars.module.css';

export type MonthBar = { month: string; value: number };

/** Each half of the chart, in px; the tallest month in the window fills one. */
const HALF_HEIGHT = 26;
/** A month with nothing recorded is still a bar at zero, not a gap. */
const MIN_BAR = 2;

/**
 * A branch's net profit across the window as one shape — requirement 15's
 * "declining branches are visible without reading every number". Bars grow both
 * ways from a zero line, because a loss drawn as a short upward bar reads as a
 * small profit. The scale is the branch's own, so the shape compares months, not
 * branches; the figures beside it carry the size.
 *
 * Each bar is a button that puts its month in focus, as in the app; the month
 * strip above the cards is the main way to do it.
 */
export default function MonthBars({
  bars,
  currency,
  selectedMonth,
  onSelectMonth,
}: {
  bars: MonthBar[];
  currency: string;
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}) {
  const { t } = useTranslation();
  const scale = Math.max(...bars.map((bar) => Math.abs(bar.value)), 1);

  return (
    <div className={styles.row}>
      {bars.map((bar) => {
        const height = Math.max((Math.abs(bar.value) / scale) * HALF_HEIGHT, MIN_BAR);
        const isLoss = bar.value < 0;
        const selected = bar.month === selectedMonth;
        const shape = (
          <span
            className={cx(styles.bar, isLoss ? styles.loss : styles.profit, selected && styles.barSelected)}
            style={{ height }}
          />
        );
        return (
          <button
            key={bar.month}
            type="button"
            className={styles.column}
            aria-pressed={selected}
            aria-label={`${monthKeyShortLabel(bar.month, t)} — ${formatAmount(bar.value, currency)}`}
            title={`${monthKeyShortLabel(bar.month, t)} — ${formatAmount(bar.value, currency)}`}
            onClick={() => onSelectMonth(bar.month)}
          >
            {/* Two fixed halves, so every bar's zero line sits at the same height. */}
            <span className={styles.half}>{isLoss ? null : shape}</span>
            <span className={styles.zero} />
            <span className={cx(styles.half, styles.lower)}>{isLoss ? shape : null}</span>
            <span className={cx(styles.tick, selected && styles.tickSelected)}>{bar.month.slice(5)}</span>
          </button>
        );
      })}
    </div>
  );
}
