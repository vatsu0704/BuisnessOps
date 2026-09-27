import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export type Metric = {
  label: string;
  value: string;
  /** A second line under the figure — "3 orders", "provisional". */
  caption?: string;
  tone?: 'default' | 'cost' | 'good';
};

/**
 * The figures behind a net-profit number, two to a row.
 *
 * ## Why it wraps rather than dividing a row evenly
 *
 * Four metrics in one row is the defect `SegmentedOption` shipped twice. On a
 * 393dp phone, minus the screen's 24dp gutters and the card's 16dp padding, the
 * space inside a card is 313dp — so four equal columns get 76dp each, which does
 * not hold "Material" above "₹1,23,456" at any readable size, and holds the
 * Gujarati label at none.
 *
 * Two to a row gives each metric about 150dp, which fits a label of a dozen
 * characters and an amount up to a crore. And because it *wraps* rather than
 * dividing, a fifth metric added later starts a third row instead of squeezing
 * the four that were already there.
 *
 * The percentage width sits on a plain `View` that this component styles
 * directly, not on a child some other component wraps — `PressableScale` used to
 * swallow exactly that and collapse its children to nothing.
 */
export default function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <View style={styles.grid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.cell}>
          <Text style={styles.label} numberOfLines={2}>
            {metric.label}
          </Text>
          <Text
            style={[
              styles.value,
              metric.tone === 'cost' && styles.valueCost,
              metric.tone === 'good' && styles.valueGood,
            ]}
          >
            {metric.value}
          </Text>
          {metric.caption ? <Text style={styles.caption}>{metric.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  // 48% rather than 50% leaves room for the gap, so two land per row and a fifth
  // metric wraps instead of overflowing.
  cell: {
    width: '48%',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  value: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2, letterSpacing: -0.3 },
  valueCost: { color: colors.error },
  valueGood: { color: colors.success },
  caption: { fontSize: 10.5, color: colors.textTertiary, marginTop: 1 },
});
