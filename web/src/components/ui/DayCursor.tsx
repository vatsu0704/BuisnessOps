import { useTranslation } from 'react-i18next';
import { IoChevronBack, IoChevronForward } from 'react-icons/io5';
import { clampDayKey, shiftDayKey } from '@shared/utils/counterQueue';
import DatePicker from './DatePicker';
import styles from './DayCursor.module.css';

type Props = {
  /** The day being shown, as YYYY-MM-DD. */
  value: string;
  /** The branch's own today — never the device's. Nothing later can be chosen. */
  today: string;
  onChange: (dayKey: string) => void;
  label: string;
};

/**
 * Which day the counter is showing — `MonthCursor`'s shape, a day at a time.
 *
 * Chevrons *and* a date field: yesterday is the overwhelmingly common ask and
 * wants one tap, while the 3rd of last month would be forty of them — that one
 * opens `DatePicker`'s calendar.
 *
 * `today` is the **branch's** day, computed from the offset the server reported,
 * not `new Date()`. A machine set to UTC is already on yesterday between 18:30
 * and midnight in India — exactly when a shop is busiest — so reading the limit
 * off the device would offer a day that has not happened.
 */
export default function DayCursor({ value, today, onChange, label }: Props) {
  const { t } = useTranslation();
  const canGoNext = value < today;

  return (
    <div className={styles.wrap}>
      <div className={styles.cursor}>
        <button
          type="button"
          className={styles.step}
          aria-label={t('web.counter.previousDay')}
          onClick={() => onChange(shiftDayKey(value, -1))}
        >
          <IoChevronBack size={16} aria-hidden="true" />
        </button>

        <DatePicker
          compact
          label={label}
          value={value}
          max={today}
          onChange={(iso) => onChange(clampDayKey(iso, today))}
        />

        <button
          type="button"
          className={styles.step}
          aria-label={t('web.counter.nextDay')}
          disabled={!canGoNext}
          onClick={() => onChange(clampDayKey(shiftDayKey(value, 1), today))}
        >
          <IoChevronForward size={16} aria-hidden="true" />
        </button>
      </div>

      {/* A second control rather than overloading the disabled chevron. */}
      {canGoNext ? (
        <button type="button" className={styles.today} onClick={() => onChange(today)}>
          {t('web.counter.backToToday')}
        </button>
      ) : null}
    </div>
  );
}
