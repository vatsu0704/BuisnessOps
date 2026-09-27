import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import MetricGrid from '@/components/reports/MetricGrid';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { formatAmount } from '@/utils/format';
import { monthKeyLabel } from '@/utils/date';
import type { BusinessMonthCell, Reconciliation } from '@/types/analytics';

/**
 * The business's net profit for the month in focus — requirement 13.
 *
 * ## Why the reconciliation line is here and not hidden
 *
 * Requirement 13's acceptance criterion is that net profit be *reproducible by
 * hand from the rows behind it*. The branch column below this card does not add
 * up to this number, and it should not: a shop paying its own warehouse for flour
 * is real money out of that shop and no money out of the business. So the branch
 * rows subtract it, this total does not, and the two differ by exactly that
 * amount.
 *
 * Someone will add the column up. When they do, the sentence at the bottom of
 * this card is what stops them concluding the app is wrong — so it states the
 * arithmetic in full rather than gesturing at it. It only appears when there is
 * actually a transfer to explain, because a business with no warehouse has
 * nothing to reconcile and the note would be noise.
 */
export default function NetProfitCard({
  cell,
  reconciliation,
  currency,
  mixedCurrency,
}: {
  cell: BusinessMonthCell;
  reconciliation: Reconciliation;
  currency: string;
  mixedCurrency: boolean;
}) {
  const { t } = useTranslation();

  const net = Number(cell.netProfit);
  const transfer = Number(cell.internalTransfer);

  return (
    <View style={styles.card}>
      <Text style={styles.caption}>{monthKeyLabel(cell.month, t)}</Text>

      <Text style={styles.label}>{t('reports.netProfit')}</Text>
      <Text style={[styles.hero, net < 0 && styles.heroLoss]}>{formatAmount(net, currency)}</Text>

      {cell.payrollProvisional ? (
        <View style={styles.flag}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.flagText}>{t('reports.provisionalPayroll')}</Text>
        </View>
      ) : null}

      {mixedCurrency ? (
        <View style={styles.flag}>
          <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.flagText}>{t('reports.mixedCurrency')}</Text>
        </View>
      ) : null}

      <MetricGrid
        metrics={[
          { label: t('reports.customerSales'), value: formatAmount(Number(cell.customerSales), currency) },
          { label: t('reports.expenses'), value: formatAmount(Number(cell.expenses), currency), tone: 'cost' },
          { label: t('reports.payroll'), value: formatAmount(Number(cell.payroll), currency), tone: 'cost' },
          {
            label: t('reports.internalTransfer'),
            value: formatAmount(transfer, currency),
            caption: t('reports.internalTransferCaption'),
          },
        ]}
      />

      {transfer !== 0 ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            {t('reports.reconciliationNote', {
              branchSum: formatAmount(Number(reconciliation.branchNetProfitSum), currency),
              transfer: formatAmount(Number(reconciliation.internalTransfer), currency),
              total: formatAmount(Number(reconciliation.netProfit), currency),
            })}
          </Text>
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
  caption: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  // 30px holds "-₹12,34,56,789" in about 240dp, inside the 313dp a card has on
  // a 393dp phone — so the figure never wraps, whatever the business earns.
  hero: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -1, marginTop: 2 },
  heroLoss: { color: colors.error },
  flag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  flagText: { flex: 1, fontSize: 11.5, color: colors.textSecondary },
  note: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm + 2,
  },
  noteText: { fontSize: 11.5, lineHeight: 17, color: colors.textTertiary },
});
