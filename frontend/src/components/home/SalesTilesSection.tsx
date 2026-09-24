import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useBranches } from '@/hooks/useBranches';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import { formatAmount } from '@/utils/format';
import StatTile from '@/components/StatTile';
import { colors, spacing } from '@/theme';

/**
 * The three headline numbers, lifted out of HomeScreen unchanged.
 *
 * Gated on `analytics:viewBranch`, so a delivery agent's Home does not lead
 * with the business's takings.
 */
export default function SalesTilesSection() {
  const { t } = useTranslation();
  const { stats } = useBranches();
  const sales = useSalesSummary();

  return (
    <View style={styles.row}>
      <StatTile
        label={t('home.statSales')}
        value={sales.totalSales}
        accent={colors.success}
        formatValue={(v) => formatAmount(v, sales.currency)}
      />
      <StatTile label={t('home.statTransactions')} value={sales.transactionCount} />
      <StatTile label={t('home.statBranches')} value={stats.total} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
});
