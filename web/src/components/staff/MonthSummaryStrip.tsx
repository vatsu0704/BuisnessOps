import { useTranslation } from 'react-i18next';
import StatTile from '@/components/ui/StatTile';
import type { MonthSummary } from '@/types/staffing';
import { formatDays } from '@/utils/format';
import styles from './MonthSummaryStrip.module.css';

/**
 * The month as payroll sees it — the app's `MonthSummaryStrip`. The same numbers
 * the payslip is built from: the server serves both from one calculation, so
 * what is on screen and what is on the payslip cannot drift apart.
 */
export default function MonthSummaryStrip({ summary }: { summary: MonthSummary }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className={styles.frame}>
        <div className={styles.grid}>
          <StatTile label={t('monthSummary.workingDays')} value={summary.workingDays} />
          <StatTile label={t('monthSummary.present')} value={summary.daysPresent} accent="var(--color-success)" />
          <StatTile label={t('monthSummary.absent')} value={summary.daysAbsent} accent="var(--color-error)" />
          <StatTile label={t('monthSummary.halfDays')} value={summary.daysHalfDay} accent="var(--color-warning)" />
          <StatTile label={t('monthSummary.leave')} value={summary.daysLeave} />
          {/* Only meaningful mid-month; "0 remaining" on a closed month is noise. */}
          {summary.daysPending > 0 ? (
            <StatTile label={t('monthSummary.pending')} value={summary.daysPending} />
          ) : (
            <StatTile label={t('monthSummary.weekOffs')} value={summary.daysWeeklyOff} />
          )}
        </div>
      </div>
      <p className={styles.note}>
        {t('monthSummary.weekOffs')}: {formatDays(summary.daysWeeklyOff)} · {t('monthSummary.holidays')}:{' '}
        {formatDays(summary.daysHoliday)}
      </p>
      <p className={styles.hint}>{t('monthSummary.paidNote')}</p>
      {summary.holidays.length > 0 ? (
        <p className={styles.hint}>{summary.holidays.map((h) => h.name).join(' · ')}</p>
      ) : null}
    </div>
  );
}
