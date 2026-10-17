import { useTranslation } from 'react-i18next';
import { IoChevronBack, IoChevronForward } from 'react-icons/io5';
import styles from './MonthCursor.module.css';

/**
 * Which month is being read, a step at a time — the app's month header, over the
 * shared `useMonthCursor`. The forward arrow stops at the current month: nothing
 * after it can have happened.
 */
export default function MonthCursor({
  label,
  onPrev,
  onNext,
  canGoNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.cursor}>
      <button type="button" className={styles.step} onClick={onPrev} aria-label={t('web.month.previous')}>
        <IoChevronBack size={18} aria-hidden="true" />
      </button>
      <p className={styles.label} aria-live="polite">
        {label}
      </p>
      <button
        type="button"
        className={styles.step}
        onClick={onNext}
        disabled={!canGoNext}
        aria-label={t('web.month.next')}
      >
        <IoChevronForward size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
