import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import StatTile from '@/components/StatTile';
import { useToday } from '@/hooks/useToday';
import { formatAmount } from '@/utils/format';
import { colors, spacing } from '@/theme';

/**
 * Today's sales, bills and spending — the three numbers at the top of Home
 * (requirement 33), across the branches this person reaches, each on its own
 * day. Spending only for somebody who may read expenses; the server leaves it
 * out otherwise, and the tile goes with it.
 */
export default function TodaySection() {
  const { t } = useTranslation();
  const { today } = useToday();
  const totals = today?.totals;
  const currency = today?.currency ?? 'INR';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <StatTile
          label={t('home.todaySales')}
          value={Number(totals?.sales ?? 0)}
          accent={colors.success}
          formatValue={(v) => formatAmount(v, currency)}
        />
        <StatTile label={t('home.todayBills')} value={totals?.saleCount ?? 0} />
        {totals?.expenses !== null && totals?.expenses !== undefined ? (
          <StatTile
            label={t('home.todayExpenses')}
            value={Number(totals.expenses)}
            accent={colors.error}
            formatValue={(v) => formatAmount(v, currency)}
          />
        ) : null}
      </View>
      {today?.mixedCurrency ? <Text style={styles.note}>{t('home.todayMixedCurrency')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  note: { fontSize: 12, color: colors.textTertiary, lineHeight: 16 },
});
