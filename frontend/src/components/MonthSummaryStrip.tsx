import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import StatTile from '@/components/StatTile';
import { colors, spacing } from '@/theme';
import { formatDays } from '@/utils/format';
import type { MonthSummary } from '@/types/staffing';

interface Props {
  summary: MonthSummary;
  /** Hide the explanatory note where space is tight (e.g. inside a list row). */
  compact?: boolean;
}

/**
 * The month as payroll sees it.
 *
 * Deliberately shows the same numbers the payslip is computed from — the
 * backend serves both from one `summariseMonth`, so what's on screen and
 * what's on the payslip cannot drift apart.
 */
export default function MonthSummaryStrip({ summary, compact }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <View style={styles.row}>
        <StatTile label={t('monthSummary.workingDays')} value={summary.workingDays} />
        <StatTile label={t('monthSummary.present')} value={summary.daysPresent} accent={colors.success} />
        <StatTile label={t('monthSummary.absent')} value={summary.daysAbsent} accent={colors.error} />
      </View>

      <View style={styles.row}>
        <StatTile label={t('monthSummary.halfDays')} value={summary.daysHalfDay} accent={colors.warning} />
        <StatTile label={t('monthSummary.leave')} value={summary.daysLeave} />
        {/* Only meaningful mid-month; showing "0 remaining" on a closed month is noise. */}
        {summary.daysPending > 0 ? (
          <StatTile label={t('monthSummary.pending')} value={summary.daysPending} />
        ) : (
          <StatTile label={t('monthSummary.weekOffs')} value={summary.daysWeeklyOff} />
        )}
      </View>

      {!compact ? (
        <>
          <Text style={styles.note}>
            {t('monthSummary.weekOffs')}: {formatDays(summary.daysWeeklyOff)} ·{' '}
            {t('monthSummary.holidays')}: {formatDays(summary.daysHoliday)}
          </Text>
          <Text style={styles.hint}>{t('monthSummary.paidNote')}</Text>
          {summary.holidays.length > 0 ? (
            <Text style={styles.hint}>{summary.holidays.map((h) => h.name).join(' · ')}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  note: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  hint: { fontSize: 11, color: colors.textTertiary, marginTop: spacing.xs, lineHeight: 15 },
});
