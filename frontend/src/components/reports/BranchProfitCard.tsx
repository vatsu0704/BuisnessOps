import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import MetricGrid, { type Metric } from '@/components/reports/MetricGrid';
import MonthBars from '@/components/reports/MonthBars';
import TrendPill from '@/components/reports/TrendPill';
import Pill from '@/components/Pill';
import { colors, radius, shadow, spacing } from '@/theme';
import { formatAmount } from '@/utils/format';
import type { BranchMonthlyRow } from '@/types/analytics';

/**
 * One branch's row in the grid — requirements 13 and 15.
 *
 * ## Why this is a card and not a table row
 *
 * Requirement 15 asks for a branch × month grid. A literal matrix on a 393dp
 * phone gives each of twelve month columns about 26dp, which holds no rupee
 * figure at all, so the honest phone form of a matrix is one card per branch with
 * the months as a shape (`MonthBars`) and one month's figures in full. Changing
 * the month in focus moves every card at once, which is the column of the matrix
 * you were going to read anyway.
 *
 * ## A warehouse shows fewer figures, not zeroes
 *
 * A warehouse has no till, so "customer sales ₹0" is not information — it is a
 * fact about the model being reported as if it were a fact about the business.
 * A cost centre therefore shows what it actually spends and nothing it cannot
 * earn. `isCostCentre` comes from the server rather than being inferred from
 * `sales === 0`, which is also true of a shop that had a dead month.
 *
 * The name gets `flex: 1` and may wrap to two lines; the net-profit figure sits
 * on its own line beneath. Putting them side by side is the shape that breaks in
 * Gujarati, where both halves are longer than their English equivalents.
 */
export default function BranchProfitCard({
  row,
  month,
  onSelectMonth,
}: {
  row: BranchMonthlyRow;
  month: string;
  onSelectMonth: (month: string) => void;
}) {
  const { t } = useTranslation();

  const cell = row.months.find((candidate) => candidate.month === month) ?? row.months[0];
  if (!cell) return null;

  const net = Number(cell.netProfit);
  const currency = row.currency;

  const metrics: Metric[] = row.isCostCentre
    ? [
        { label: t('reports.expenses'), value: formatAmount(Number(cell.expenses), currency), tone: 'cost' },
        {
          label: t('reports.payroll'),
          value: formatAmount(Number(cell.payroll), currency),
          tone: 'cost',
          caption: cell.payrollProvisional ? t('reports.provisional') : undefined,
        },
      ]
    : [
        {
          label: t('reports.sales'),
          value: formatAmount(Number(cell.sales), currency),
          caption: t('reports.saleCount', { count: cell.saleCount }),
        },
        { label: t('reports.expenses'), value: formatAmount(Number(cell.expenses), currency), tone: 'cost' },
        {
          label: t('reports.materialSpend'),
          value: formatAmount(Number(cell.materialSpend), currency),
          tone: 'cost',
          caption: t('reports.materialOrderCount', { count: cell.materialOrderCount }),
        },
        {
          label: t('reports.payroll'),
          value: formatAmount(Number(cell.payroll), currency),
          tone: 'cost',
          caption: cell.payrollProvisional ? t('reports.provisional') : undefined,
        },
      ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {row.branchName}
          </Text>
          <Text style={styles.code}>{row.branchCode}</Text>
        </View>
        <TrendPill trend={row.trend} />
      </View>

      {row.isCostCentre ? (
        <View style={styles.badges}>
          <Pill label={t('reports.costCentre')} icon="cube-outline" tone="muted" />
        </View>
      ) : null}

      <Text style={[styles.net, net < 0 && styles.netLoss]}>{formatAmount(net, currency)}</Text>
      <Text style={styles.netLabel}>{t('reports.netProfitForMonth')}</Text>

      <MetricGrid metrics={metrics} />

      <MonthBars
        bars={row.months.map((candidate) => ({
          month: candidate.month,
          value: Number(candidate.netProfit),
        }))}
        currency={currency}
        selectedMonth={month}
        onSelectMonth={onSelectMonth}
      />

      {row.status !== 'ACTIVE' ? (
        <View style={styles.closed}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.textTertiary} />
          {/* A closed branch keeps its history: dropping it would silently
              restate every month before it closed. */}
          <Text style={styles.closedText}>{t('reports.branchNotActive')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // flex: 1 so a long branch name wraps rather than squeezing the trend pill
  // beside it off the row.
  nameBlock: { flex: 1 },
  name: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  code: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  net: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.7, marginTop: spacing.sm },
  netLoss: { color: colors.error },
  netLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  closedText: { fontSize: 11, color: colors.textTertiary },
});
