import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { deleteExpense, getExpenseDay, getExpenseMonth } from '@/api/expenses';
import { extractErrorMessage } from '@/api/client';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import { hasCapability } from '@/utils/permissions';
import { confirm } from '@/utils/confirm';
import { formatAmount } from '@/utils/format';
import { categoryLabel } from '@/utils/expenseCategory';
import { dateKeyFromApi, formatDate, formatTime } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import StatTile from '@/components/StatTile';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import type { Expense, ExpenseBreakdownRow, ExpenseDaySummary, ExpenseMonthSummary } from '@/types/expense';

type Props = NativeStackScreenProps<AppStackParamList, 'Expenses'>;

/**
 * A branch's spending — requirement 10.
 *
 * "How much did I spend today? And how much did I sell today?" is one question,
 * so the day card answers both and shows the gap between them. The month below
 * it is the other half of the requirement — "the month's total amounts" — with
 * the category breakdown that makes "₹2,000 of milk" a thing you can look up.
 *
 * Read by more people than write to it: `expense:view` opens this screen, and
 * the logging button only appears for `expense:log`. That is why the warehouse
 * desk can follow a branch it is chasing into its actual figures without ever
 * being offered a way to spend that branch's money.
 */
export default function ExpensesScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  // `branches`, not `tradingBranches`: a warehouse has costs even though it has
  // no till, and leaving it out of the picker would leave them unrecordable.
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();

  const canLog = hasCapability(membership, 'expense:log');

  const [branchId, setBranchId] = useState<string | null>(route.params?.branchId ?? null);
  const [day, setDay] = useState<ExpenseDaySummary | null>(null);
  const [monthSummary, setMonthSummary] = useState<ExpenseMonthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const activeBranchId = branchId ?? branches[0]?.id ?? null;

  const load = useCallback(async () => {
    if (!businessId || !activeBranchId) return;
    setError(null);
    try {
      const [dayData, monthData] = await Promise.all([
        getExpenseDay(businessId, activeBranchId),
        getExpenseMonth(businessId, activeBranchId, month, year),
      ]);
      setDay(dayData);
      setMonthSummary(monthData);
    } catch (err) {
      // A failed refresh keeps whatever was on screen and shows the error
      // beside it, rather than emptying a screen that was reading fine.
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, activeBranchId, month, year]);

  // A tab screen never unmounts, so this is the only thing that re-runs after
  // an expense is logged in the modal above it.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    void load();
  }, [load]);

  const currency = day?.currency ?? monthSummary?.currency ?? 'INR';
  const money = useMemo(() => (value: string | number) => formatAmount(Number(value), currency), [currency]);

  async function handleRemove(expense: Expense) {
    if (!businessId) return;
    const ok = await confirm({
      title: t('expenses.deleteTitle'),
      body: t('expenses.deleteBody', {
        amount: money(expense.amount),
        category: categoryLabel(expense.category, t),
      }),
      confirmLabel: t('expenses.delete'),
      cancelLabel: t('expenses.cancel'),
    });
    if (!ok) return;

    haptics.tap();
    setRemovingId(expense.id);
    try {
      await deleteExpense(businessId, expense.id);
      haptics.success();
      await load();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  function renderBreakdown(rows: ExpenseBreakdownRow[]) {
    return (
      <View style={styles.breakdown}>
        {rows.map((row) => (
          <View key={row.categoryId} style={styles.breakdownChip}>
            <Text style={styles.breakdownName}>{categoryLabel(row, t)}</Text>
            <Text style={styles.breakdownAmount}>{money(row.amount)}</Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('expenses.title')}</Text>
            <Text style={styles.subtitle}>{t('expenses.subtitle')}</Text>
          </View>
          <PressableScale testID="expenses-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {branches.length > 1 ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.chipRow}>
                {branches.map((branch) => (
                  <View key={branch.id} style={styles.chipItem}>
                    <SegmentedOption
                      testID={`expenses-branch-${branch.code}`}
                      title={branch.name}
                      selected={activeBranchId === branch.id}
                      onPress={() => setBranchId(branch.id)}
                    />
                  </View>
                ))}
              </View>
            </AnimatedEntrance>
          ) : null}

          {isLoading && !day ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <>
              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('expenses.todaySection')}</Text>

                  {/* Two tiles, not three. Three equal shares of a 393dp
                      phone leave each figure about 75dp of usable width, which
                      holds ₹2,000 and not ₹1,50,000 — and a day's takings are
                      the second kind. The difference is the conclusion drawn
                      from the two above it rather than a third peer, so it
                      reads as a full-width line and gets room for its sign. */}
                  <View style={styles.statRow}>
                    <StatTile
                      label={t('expenses.spent')}
                      value={Number(day?.totalSpent ?? 0)}
                      accent={colors.warning}
                      formatValue={money}
                    />
                    <StatTile
                      label={t('expenses.sold')}
                      value={Number(day?.totalSold ?? 0)}
                      accent={colors.success}
                      formatValue={money}
                    />
                  </View>

                  <View style={styles.differenceRow}>
                    <Text style={styles.differenceLabel}>{t('expenses.difference')}</Text>
                    <Text
                      style={[
                        styles.differenceValue,
                        Number(day?.difference ?? 0) < 0 && styles.differenceNegative,
                      ]}
                    >
                      {money(day?.difference ?? 0)}
                    </Text>
                  </View>

                  {day?.breakdown.length ? renderBreakdown(day.breakdown) : null}

                  {canLog ? (
                    <PrimaryButton
                      testID="expenses-add"
                      title={t('expenses.logExpense')}
                      icon="add-circle-outline"
                      onPress={() =>
                        navigation.navigate('AddExpense', {
                          branchId: activeBranchId ?? undefined,
                        })
                      }
                      style={styles.addButton}
                    />
                  ) : null}
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('expenses.entrySection')}</Text>

                  {!day?.expenses.length ? (
                    <View style={styles.empty}>
                      <Ionicons name="receipt-outline" size={22} color={colors.textTertiary} />
                      <Text style={styles.emptyTitle}>{t('expenses.noneToday')}</Text>
                      {canLog ? <Text style={styles.emptyBody}>{t('expenses.noneTodayHint')}</Text> : null}
                    </View>
                  ) : (
                    day.expenses.map((expense, index) => (
                      <View
                        key={expense.id}
                        style={[styles.entryRow, index > 0 && styles.entryRowDivided]}
                      >
                        <View style={styles.entryText}>
                          <Text style={styles.entryCategory}>{categoryLabel(expense.category, t)}</Text>
                          {expense.note ? <Text style={styles.entryNote}>{expense.note}</Text> : null}
                          <Text style={styles.entryMeta}>
                            {formatTime(expense.createdAt, t)}
                            {expense.recordedByMembership?.user?.name
                              ? ` · ${t('expenses.by', { name: expense.recordedByMembership.user.name })}`
                              : ''}
                          </Text>
                        </View>

                        <Text style={styles.entryAmount}>{money(expense.amount)}</Text>

                        {canLog ? (
                          <PressableScale
                            testID={`expenses-remove-${expense.id}`}
                            scaleTo={0.9}
                            style={styles.entryRemove}
                            disabled={removingId === expense.id}
                            accessibilityLabel={t('expenses.delete')}
                            onPress={() => void handleRemove(expense)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color={removingId === expense.id ? colors.textTertiary : colors.error}
                            />
                          </PressableScale>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('expenses.monthSection')}</Text>

                  <View style={styles.monthNav}>
                    <PressableScale testID="expenses-prev-month" onPress={goPrev} style={styles.monthNavButton}>
                      <Ionicons name="chevron-back" size={18} color={colors.text} />
                    </PressableScale>
                    <Text style={styles.monthLabel}>{label}</Text>
                    <PressableScale
                      testID="expenses-next-month"
                      onPress={goNext}
                      disabled={!canGoNext}
                      style={[styles.monthNavButton, !canGoNext && styles.disabled]}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={canGoNext ? colors.text : colors.textTertiary}
                      />
                    </PressableScale>
                  </View>

                  {!monthSummary?.expenseCount ? (
                    <Text style={styles.emptyText}>{t('expenses.monthEmpty')}</Text>
                  ) : (
                    <>
                      <Text style={styles.monthTotal}>
                        {t('expenses.monthTotal', {
                          count: monthSummary.expenseCount,
                          amount: money(monthSummary.totalSpent),
                        })}
                      </Text>
                      {renderBreakdown(monthSummary.breakdown)}

                      <Text style={styles.subSectionTitle}>{t('expenses.breakdownSection')}</Text>
                      {monthSummary.days.map((entry) => (
                        <View key={entry.date} style={styles.dayRow}>
                          <Text style={styles.dayDate}>{formatDate(dateKeyFromApi(entry.date), t)}</Text>
                          <Text style={styles.dayAmount}>{money(entry.amount)}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              </AnimatedEntrance>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  subSectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Three branch chips or five: a wrap with a minimum width degrades into rows
  // rather than dividing the line into slivers.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipItem: { minWidth: '30%', flexGrow: 1 },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  differenceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  // The label may wrap in Gujarati; the figure never should, so only the label
  // is allowed to grow.
  differenceLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  differenceValue: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  differenceNegative: { color: colors.error },
  addButton: { marginTop: spacing.lg },
  // Each chip is the width of its own label, so a long category name in
  // Gujarati wraps the row rather than breaking the word.
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  breakdownChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  breakdownName: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
  breakdownAmount: { fontSize: 13, color: colors.text, fontWeight: '800' },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
  entryRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  entryText: { flex: 1 },
  entryCategory: { fontSize: 14, fontWeight: '700', color: colors.text },
  entryNote: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  entryMeta: { fontSize: 11.5, color: colors.textTertiary, marginTop: 2 },
  entryAmount: { fontSize: 15, fontWeight: '800', color: colors.text },
  entryRemove: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorBg,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  monthLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  monthTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs + 2 },
  dayDate: { fontSize: 13, color: colors.textSecondary },
  dayAmount: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  loader: { paddingVertical: spacing.xxl },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
});
