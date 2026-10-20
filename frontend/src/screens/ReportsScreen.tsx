import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import ExportActions from '@/components/ExportActions';
import AttentionSection from '@/components/reports/AttentionSection';
import BranchProfitCard from '@/components/reports/BranchProfitCard';
import CrossBusinessSection from '@/components/reports/CrossBusinessSection';
import MonthStrip from '@/components/reports/MonthStrip';
import NetProfitCard from '@/components/reports/NetProfitCard';
import DailyReportSection from '@/components/reports/DailyReportSection';
import {
  RANGE_OPTIONS,
  useBranchAnalytics,
  useCrossBusinessAnalytics,
  type RangeMonths,
} from '@/hooks/useBranchAnalytics';
import { useExportPreview } from '@/hooks/useExportPreview';
import {
  shareMonthEndDocument,
  shareMonthEndWorkbook,
} from '@/api/exports';
import { monthKeyLabel } from '@/utils/date';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useAuthStore } from '@/store/authStore';
import { hasCapability } from '@/utils/permissions';
import { colors, spacing } from '@/theme';
import { step } from '@/theme/motion';
import type { BranchMonthlyRow } from '@/types/analytics';

/**
 * Requirements 13 and 15 — the screen that stops being a placeholder.
 *
 * ## Why this is cards and a month strip rather than a table
 *
 * Requirement 15 asks for "a branch × month grid". A literal matrix does not
 * survive a phone: twelve month columns inside the 313dp a card has on a 393dp
 * screen leaves 26dp each, which holds no rupee figure at all. So the matrix is
 * turned ninety degrees — **one card per branch**, each carrying its whole window
 * as a shape (`MonthBars`) and one month's figures in full, with the month strip
 * at the top moving every card at once. That is the column of the matrix a person
 * was going to read anyway, and it scales to any number of branches or months
 * instead of degrading as either grows.
 *
 * ## Two controls, not three
 *
 * The range (3, 6, 12 months) and, for an account holding more than one business,
 * the scope. Both are two or three options, which is what `SegmentedOption` is
 * for — past three it divides a row too finely and the labels break, which is why
 * there is no third row of chips here.
 *
 * There is deliberately no sort control either: the branch list is ranked by net
 * profit with cost centres last, which *is* requirement 15's ranking, and
 * `AttentionSection` above it lifts out the branches that fell. A control for
 * something the screen already answers is chrome in front of the answer.
 *
 * ## Who reaches this
 *
 * The tab is gated on `analytics:viewBusiness`, so an owner, admin or manager. The
 * screen and the endpoint behind it are gated on the narrower
 * `analytics:viewBranch` and scoped by branch access, so a cashier gets their own
 * branch and no business total — correct by construction, and deliberately not a
 * sixth tab, because five is the documented budget in `TabNavigator`. A cashier
 * reaches it from Home's Reports tile, which already asks for that capability.
 *
 * So for a one-branch reader this draws without a branch chooser, without the
 * business roll-up card and without the cross-business section, each of which is
 * already conditional on what the server actually sent.
 */
export default function ReportsScreen() {
  const { t } = useTranslation();
  const edges = useScreenEdges();
  const navigation = useNavigation();
  // A tab for whoever reads every branch; pushed from Home's Reports tile for an
  // owner on a single-shop plan, who has no Reports tab. Only the pushed copy has
  // somewhere to go back to.
  const isPushed = useNavigationState((state) => state.type === 'stack');
  const membership = useMembership();

  const { report, isLoading, error, monthsBack, setMonthsBack, refresh, range } =
    useBranchAnalytics();

  // Which month every card is showing. Defaults to the most recent in the
  // window, which is the one somebody opening Reports came to see.
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const [scope, setScope] = useState<'business' | 'all'>('business');
  // Requirement 34: the same figures a day at a time, or a month at a time.
  const [view, setView] = useState<'day' | 'month'>('month');

  // How many businesses this account could read a roll-up for. The scope toggle
  // appears only when there is something to compare — one business has no
  // "across businesses" view, it has this one.
  const user = useAuthStore((s) => s.user);
  const readableBusinessCount = useMemo(
    () =>
      // Role AND plan (requirement 28), the same filter the server applies to
      // the roll-up, so the comparison is offered only when it will have rows.
      (user?.memberships ?? []).filter((membership) => hasCapability(membership, 'analytics:viewBusiness')).length,
    [user]
  );

  const cross = useCrossBusinessAnalytics(range, scope === 'all' && readableBusinessCount > 1);

  const months = report?.months ?? [];
  const month = focusMonth && months.includes(focusMonth) ? focusMonth : (months[months.length - 1] ?? '');

  // Ranked, best first, with cost centres last: a warehouse can only ever be
  // negative, so sorting it in with the shops would put every warehouse at the
  // bottom and look like a ranking of failures.
  const ranked = useMemo(() => {
    const rows: BranchMonthlyRow[] = [...(report?.branches ?? [])];
    return rows.sort((a, b) => {
      if (a.isCostCentre !== b.isCostCentre) return a.isCostCentre ? 1 : -1;
      const cellOf = (row: BranchMonthlyRow) =>
        Number(row.months.find((candidate) => candidate.month === month)?.netProfit ?? 0);
      return cellOf(b) - cellOf(a);
    });
  }, [report, month]);

  const businessCell = report?.business?.months.find((candidate) => candidate.month === month);

  // Requirement 17's month-end export, for the month in focus. Only fetched for
  // the per-business scope: "all businesses" spans tenants and an export belongs
  // to one, so there is nothing sensible to hand over there.
  const businessId = useBusinessId();
  const exportPreview = useExportPreview('MONTH', { month }, scope === 'business' && !!month);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={edges}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && !!report}
              onRefresh={() => {
                void refresh();
                if (scope === 'all') void cross.refresh();
              }}
              tintColor={colors.primary}
            />
          }
        >
          <AnimatedEntrance delay={step(0)} style={styles.headRow}>
            <View style={styles.headText}>
              <Text style={styles.title}>{t('reports.title')}</Text>
              <Text style={styles.subtitle}>{t('reports.subtitle')}</Text>
            </View>
            {isPushed ? (
              <PressableScale testID="reports-close" style={styles.close} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={20} color={colors.text} />
              </PressableScale>
            ) : null}
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.row}>
              <SegmentedOption
                testID="reports-view-day"
                title={t('reports.perDay')}
                icon="today-outline"
                selected={view === 'day'}
                onPress={() => setView('day')}
              />
              <SegmentedOption
                testID="reports-view-month"
                title={t('reports.perMonth')}
                icon="calendar-outline"
                selected={view === 'month'}
                onPress={() => setView('month')}
              />
            </View>
          </AnimatedEntrance>

          {/* Requirement 34: what "variable", "fixed" and "daily" are made of, one
              tap away from the figures that use them. */}
          {hasCapability(membership, 'expense:view') ? (
            <PressableScale
              testID="reports-cost-types"
              style={styles.link}
              onPress={() => (navigation.navigate as (route: string) => void)('ExpenseCategories')}
            >
              <Ionicons name="options-outline" size={15} color={colors.primary} />
              <Text style={styles.linkText}>{t('reports.howCostsAreGrouped')}</Text>
            </PressableScale>
          ) : null}

          {view === 'day' ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <DailyReportSection />
            </AnimatedEntrance>
          ) : (
          <>
          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.row}>
              {RANGE_OPTIONS.map((option) => (
                <SegmentedOption
                  key={option}
                  testID={`reports-range-${option}`}
                  title={t('reports.rangeMonths', { count: option })}
                  selected={monthsBack === option}
                  onPress={() => setMonthsBack(option as RangeMonths)}
                />
              ))}
            </View>
          </AnimatedEntrance>

          {readableBusinessCount > 1 ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <View style={styles.row}>
                <SegmentedOption
                  testID="reports-scope-business"
                  title={t('reports.scopeThisBusiness')}
                  selected={scope === 'business'}
                  onPress={() => setScope('business')}
                />
                <SegmentedOption
                  testID="reports-scope-all"
                  title={t('reports.scopeAllBusinesses')}
                  selected={scope === 'all'}
                  onPress={() => setScope('all')}
                />
              </View>
            </AnimatedEntrance>
          ) : null}

          {scope === 'all' ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <CrossBusinessSection cross={cross.cross} isLoading={cross.isLoading} error={cross.error} />
            </AnimatedEntrance>
          ) : (
            <>
              {months.length > 0 ? (
                <AnimatedEntrance delay={step(3)} style={styles.strip}>
                  <MonthStrip months={months} selected={month} onSelect={setFocusMonth} />
                </AnimatedEntrance>
              ) : null}

              {/* The error sits BESIDE the data rather than replacing it: a
                  failed refresh should not empty a screen that was reading
                  correctly a moment ago. */}
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="cloud-offline-outline" size={15} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {isLoading && !report ? (
                <ActivityIndicator color={colors.primary} style={styles.loader} />
              ) : null}

              {report && businessCell ? (
                <AnimatedEntrance delay={step(4)} style={styles.block}>
                  <NetProfitCard
                    cell={businessCell}
                    currency={report.currency}
                    mixedCurrency={report.mixedCurrency}
                  />
                </AnimatedEntrance>
              ) : null}

              {report && report.branches.length > 0 ? (
                <AnimatedEntrance delay={step(5)} style={styles.block}>
                  <AttentionSection rows={report.branches} />
                </AnimatedEntrance>
              ) : null}

              {report && report.branches.length === 0 && !isLoading ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>{t('reports.noBranches')}</Text>
                </View>
              ) : null}

              {/* The stagger is capped, as it is on every other list screen: an
                  uncapped one over forty branches is a 2.8-second wait for the
                  last card, which turns an entrance into a delay. */}
              {report && month ? (
                <AnimatedEntrance delay={step(5)} style={styles.block}>
                  <ExportActions
                    report={exportPreview.report}
                    periodLabel={monthKeyLabel(month, t)}
                    onExportWorkbook={() => shareMonthEndWorkbook(businessId!, { month })}
                    onExportDocument={() => shareMonthEndDocument(businessId!, { month })}
                  />
                </AnimatedEntrance>
              ) : null}

              {ranked.map((row, index) => (
                <AnimatedEntrance
                  key={row.branchId}
                  delay={step(Math.min(6 + index, 8))}
                  style={styles.block}
                >
                  <BranchProfitCard row={row} month={month} onSelectMonth={setFocusMonth} />
                </AnimatedEntrance>
              ))}
            </>
          )}
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
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: spacing.sm },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  headText: { flex: 1, minWidth: 0 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  block: { marginTop: spacing.md },
  strip: { marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  loader: { paddingVertical: spacing.xxl },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: spacing.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { flex: 1, fontSize: 12.5, color: colors.error },
  emptyBox: { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});
