import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import TrendPill from '@/components/reports/TrendPill';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { formatAmount } from '@/utils/format';
import type { BranchMonthlyRow } from '@/types/analytics';

/**
 * "Where more effort is needed" — requirement 15, stated as literally as the
 * requirement does.
 *
 * The grid below already contains this information; a person reading twenty
 * branches × twelve months does not. So the branches that fell are lifted out and
 * put first, worst first, and the ones that did not are summarised in a single
 * line rather than listed — the answer to "is anything wrong?" should be readable
 * without scrolling.
 *
 * Only `DOWN` qualifies. A branch the server marked `FLAT` moved less than its
 * noise threshold, and a section that flags everything teaches its reader to skip
 * it.
 */
export default function AttentionSection({ rows }: { rows: BranchMonthlyRow[] }) {
  const { t } = useTranslation();

  const declining = rows
    .filter((row) => row.trend.direction === 'DOWN')
    // Worst first. A branch with no percentage (the month before was zero) sorts
    // last among the decliners rather than being treated as a 0% fall, which
    // would put the newest and least informative rows at the top.
    .sort((a, b) => {
      const left = a.trend.changePercent === null ? 1 : Number(a.trend.changePercent);
      const right = b.trend.changePercent === null ? 1 : Number(b.trend.changePercent);
      return left - right;
    });

  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('reports.needsAttention')}</Text>

      {declining.length === 0 ? (
        <View style={styles.steady}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <Text style={styles.steadyText}>{t('reports.allSteady')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>{t('reports.needsAttentionHint', { count: declining.length })}</Text>
          {declining.map((row, index) => (
            <View key={row.branchId} style={[styles.row, index > 0 && styles.rowDivided]}>
              <View style={styles.nameBlock}>
                <Text style={styles.name} numberOfLines={2}>
                  {row.branchName}
                </Text>
                <Text style={styles.amount}>
                  {formatAmount(Number(row.total.netProfit), row.currency)}
                </Text>
              </View>
              <TrendPill trend={row.trend} />
            </View>
          ))}
        </>
      )}
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
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 2, marginBottom: spacing.xs },
  steady: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  steadyText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  nameBlock: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  // The window's total, not the focus month's: "this branch is slipping" is a
  // statement about the period, and a single month is the noise it hides in.
  amount: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
