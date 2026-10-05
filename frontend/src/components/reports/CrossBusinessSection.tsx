import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import MetricGrid from '@/components/reports/MetricGrid';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { formatAmount } from '@/utils/format';
import type { CrossBusinessReport } from '@/types/analytics';

/**
 * Every business this account holds, side by side — requirements 13 and 16.
 *
 * Deliberately **totals only**. Requirement 13 asks for "all branch data — amount
 * only", and a person comparing four businesses is asking which one needs
 * attention, not reading forty branches. The branches of whichever one it turns
 * out to be are one tap away, by switching business and reading the grid.
 *
 * ## Currencies are never added together
 *
 * A business in rupees and one in dirhams have no meaningful sum, so when they
 * differ every business still shows its own total and the combined figure is
 * withheld with a line saying why. Printing a number that adds ₹ to د.إ would be
 * worse than printing none.
 */
export default function CrossBusinessSection({
  cross,
  isLoading,
  error,
}: {
  cross: CrossBusinessReport | null;
  isLoading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();

  if (isLoading && !cross) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }

  if (error && !cross) {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!cross || cross.businesses.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>{t('reports.noBusinesses')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {cross.combined ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('reports.combinedTotal')}</Text>
          <Text
            style={[styles.hero, Number(cross.combined.netProfit) < 0 && styles.heroLoss]}
          >
            {formatAmount(Number(cross.combined.netProfit), cross.currency ?? 'INR')}
          </Text>
          <Text style={styles.heroCaption}>
            {t('reports.acrossBusinesses', { count: cross.businessCount })}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.flag}>
            <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
            <Text style={styles.flagText}>{t('reports.notComparableCurrency')}</Text>
          </View>
        </View>
      )}

      {cross.businesses.map((business) => {
        const net = Number(business.total.netProfit);
        return (
          <View key={business.businessId} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.name} numberOfLines={2}>
                {business.businessName}
              </Text>
            </View>
            <Text style={styles.branchCount}>
              {t('reports.branchBreakdown', {
                trading: business.tradingBranchCount,
                total: business.branchCount,
              })}
            </Text>

            <Text style={[styles.net, net < 0 && styles.netLoss]}>
              {formatAmount(net, business.currency)}
            </Text>
            <Text style={styles.netLabel}>{t('reports.netProfit')}</Text>

            <MetricGrid
              metrics={[
                {
                  label: t('reports.customerSales'),
                  value: formatAmount(Number(business.total.customerSales), business.currency),
                },
                {
                  label: t('reports.expenses'),
                  value: formatAmount(Number(business.total.expenses), business.currency),
                  tone: 'cost',
                },
                {
                  label: t('reports.payroll'),
                  value: formatAmount(Number(business.total.payroll), business.currency),
                  tone: 'cost',
                  caption: business.total.payrollProvisional ? t('reports.provisional') : undefined,
                },
                // Requirement 25: money that left the business for a vendor.
                // Only when there was some, so a business without vendors
                // reads exactly as it did.
                ...(Number(business.total.vendorSpend) !== 0
                  ? [
                      {
                        label: t('reports.vendorSpend'),
                        value: formatAmount(Number(business.total.vendorSpend), business.currency),
                        tone: 'cost' as const,
                      },
                    ]
                  : []),
                {
                  label: t('reports.internalTransfer'),
                  value: formatAmount(Number(business.total.internalTransfer), business.currency),
                  caption: t('reports.internalTransferCaption'),
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
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
  hero: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -1, marginTop: spacing.xs },
  heroLoss: { color: colors.error },
  heroCaption: { fontSize: 11.5, color: colors.textTertiary, marginTop: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.text },
  branchCount: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  net: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.7, marginTop: spacing.sm },
  netLoss: { color: colors.error },
  netLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flagText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  loader: { paddingVertical: spacing.xxl },
  error: { fontSize: 13, color: colors.error },
  empty: { fontSize: 13, color: colors.textSecondary },
});
