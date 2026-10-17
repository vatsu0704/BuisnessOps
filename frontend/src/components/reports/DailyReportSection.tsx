import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MetricGrid from '@/components/reports/MetricGrid';
import { costMetrics } from '@/utils/costMetrics';
import PressableScale from '@/components/PressableScale';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import { extractErrorMessage } from '@/api/client';
import { getBranchDaily } from '@/api/analytics';
import type { DailyReport } from '@/types/analytics';
import { ALL_BRANCHES, dailyChoices, dailyTotal, daysFor, listedDays, resolveChoice } from '@/utils/dailyReport';
import { formatAmount } from '@/utils/format';
import { formatDate, todayISO } from '@/utils/date';
import { colors, radius, shadow, spacing, typography } from '@/theme';

/**
 * Reports, day by day — requirement 34's "Per day".
 *
 * One month at a time, each day with what came in, what it cost and what was
 * left. Variable and daily costs fall on the day they happened; rent and wages
 * are spread evenly over the month's days (Vatsal's choice), so a day's profit is
 * a fair one rather than a disaster on the 1st and a triumph after. The month's
 * own figures sit at the top, and they are the sum of the days below.
 *
 * Its own data, read by this one view, so it stays local and is refetched on
 * focus rather than living in a store.
 */
export default function DailyReportSection() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { month, year, label, goPrev, goNext, canGoNext, isCurrentMonth } = useMonthCursor();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const [report, setReport] = useState<DailyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(ALL_BRANCHES);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setReport(await getBranchDaily(businessId, { month: monthKey }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, monthKey]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const shown = report && report.month === monthKey ? report : null;
  // The whole business when the server sent its roll-up; otherwise a branch.
  const choices = useMemo(() => dailyChoices(shown), [shown]);
  const choice = resolveChoice(shown, selected);
  const days = useMemo(() => daysFor(shown, choice), [shown, choice]);
  const listed = listedDays(days, isCurrentMonth ? todayISO() : null);

  const currency = shown?.currency ?? 'INR';
  const total = useMemo(() => dailyTotal(days), [days]);

  const nameOf = (id: string) =>
    id === ALL_BRANCHES ? t('reports.allBranches') : (shown?.branches.find((row) => row.branchId === id)?.branchName ?? '');
  const rawMaterialKey = choice === ALL_BRANCHES ? 'reports.variableIncludesVendors' : 'reports.variableIncludesMaterial';

  return (
    <View style={styles.wrap}>
      <View style={styles.monthNav}>
        <PressableScale testID="reports-day-prev" onPress={goPrev} style={styles.monthButton}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </PressableScale>
        <Text style={styles.monthLabel}>{label}</Text>
        <PressableScale
          testID="reports-day-next"
          onPress={goNext}
          disabled={!canGoNext}
          style={[styles.monthButton, !canGoNext && styles.disabled]}
        >
          <Ionicons name="chevron-forward" size={18} color={canGoNext ? colors.text : colors.textTertiary} />
        </PressableScale>
      </View>

      {choices.length > 1 ? (
        // A wrapping row of chips: there may be any number of branches, and a
        // name in Gujarati runs long — so nothing here divides a fixed width.
        <View style={styles.chips}>
          {choices.map((id) => (
            <PressableScale
              key={id}
              testID={`reports-day-branch-${id}`}
              scaleTo={0.96}
              style={[styles.chip, choice === id && styles.chipSelected]}
              onPress={() => setSelected(id)}
            >
              <Text style={[styles.chipText, choice === id && styles.chipTextSelected]}>{nameOf(id)}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {isLoading && !shown ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}

      {shown ? (
        <View style={styles.card}>
          <Text style={styles.caption}>{label}</Text>
          <Text style={styles.label}>{t('reports.totalProfit')}</Text>
          <Text style={[styles.hero, total.profit < 0 && styles.loss]}>{formatAmount(total.profit, currency)}</Text>
          <MetricGrid
            metrics={[
              {
                label: t('reports.totalBusiness'),
                value: formatAmount(total.business, currency),
                caption: t('reports.saleCount', { count: total.saleCount }),
              },
              ...costMetrics(total, {
                t,
                currency,
                rawMaterial: total.rawMaterial,
                rawMaterialKey,
                wages: 0,
              }),
            ]}
          />
          <Text style={styles.note}>{t('reports.fixedSpreadNote')}</Text>
        </View>
      ) : null}

      {listed.map((day) => {
        const open = openDay === day.day;
        return (
          <PressableScale
            key={day.day}
            testID={`reports-day-${day.day}`}
            scaleTo={0.99}
            style={[styles.dayRow, open && styles.dayRowOpen]}
            onPress={() => setOpenDay(open ? null : day.day)}
            accessibilityState={{ expanded: open }}
          >
            <View style={styles.dayHead}>
              <Text style={styles.dayLabel}>{formatDate(day.day, t)}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
            </View>
            {/* Three figures that each grow: they wrap onto a second line on a
                small phone in Gujarati rather than squeezing. */}
            <View style={styles.dayFigures}>
              <Figure label={t('reports.dayBusiness')} value={formatAmount(day.business, currency)} />
              <Figure label={t('reports.dayCost')} value={formatAmount(Number(day.totalCost), currency)} tone="cost" />
              <Figure
                label={t('reports.dayProfit')}
                value={formatAmount(day.profit, currency)}
                tone={day.profit < 0 ? 'loss' : 'good'}
              />
            </View>
            {open ? (
              <MetricGrid
                metrics={costMetrics(day, { t, currency, rawMaterial: day.rawMaterial, rawMaterialKey, wages: 0, fixedShared: true })}
              />
            ) : null}
          </PressableScale>
        );
      })}

      {shown && listed.length === 0 ? <Text style={styles.empty}>{t('reports.dayNothingYet')}</Text> : null}
    </View>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'cost' | 'good' | 'loss' }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text
        style={[
          styles.figureValue,
          tone === 'cost' && styles.cost,
          tone === 'good' && styles.good,
          tone === 'loss' && styles.loss,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  monthLabel: { ...typography.label, fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  chipTextSelected: { color: colors.primaryDark },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  loader: { marginVertical: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  caption: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  hero: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -1, marginTop: 2 },
  note: { fontSize: 11.5, lineHeight: 17, color: colors.textTertiary, marginTop: spacing.sm },
  dayRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dayRowOpen: { borderColor: colors.primary },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dayLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  dayFigures: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  figure: { minWidth: 88, flexGrow: 1, gap: 1 },
  figureLabel: { fontSize: 11.5, color: colors.textTertiary },
  figureValue: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  cost: { color: colors.textSecondary },
  good: { color: colors.success },
  loss: { color: colors.error },
  empty: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
});
