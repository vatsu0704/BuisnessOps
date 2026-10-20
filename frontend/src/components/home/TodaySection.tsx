import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
 *
 * Three tiles across need roughly 130dp each before a rupee figure has to shrink
 * to stay readable, so below that today's sales takes the whole first row and
 * the other two share the second. It is the number Home is read for, and the one
 * that grows longest. The web has done this since it was ported; the phone, where
 * the screen is narrowest, had not.
 */
const THREE_ACROSS_MIN_WIDTH = 400;

export default function TodaySection() {
  const { t } = useTranslation();
  const { today } = useToday();
  const { width } = useWindowDimensions();
  const totals = today?.totals;
  const currency = today?.currency ?? 'INR';

  const sales = (
    <StatTile
      label={t('home.todaySales')}
      value={Number(totals?.sales ?? 0)}
      accent={colors.success}
      formatValue={(v) => formatAmount(v, currency)}
    />
  );
  const bills = <StatTile label={t('home.todayBills')} value={totals?.saleCount ?? 0} />;
  const expenses =
    totals?.expenses !== null && totals?.expenses !== undefined ? (
      <StatTile
        label={t('home.todayExpenses')}
        value={Number(totals.expenses)}
        accent={colors.error}
        formatValue={(v) => formatAmount(v, currency)}
      />
    ) : null;

  // Two tiles hold their figures at any width this app runs at; only three
  // across need the extra row.
  const splitRows = expenses !== null && width < THREE_ACROSS_MIN_WIDTH;

  return (
    <View style={styles.wrap}>
      <View style={styles.rows}>
        <View style={styles.row}>
          {sales}
          {splitRows ? null : bills}
          {splitRows ? null : expenses}
        </View>
        {splitRows ? (
          <View style={styles.row}>
            {bills}
            {expenses}
          </View>
        ) : null}
      </View>
      {today?.mixedCurrency ? <Text style={styles.note}>{t('home.todayMixedCurrency')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  rows: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  note: { fontSize: 12, color: colors.textTertiary, lineHeight: 16 },
});
