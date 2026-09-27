import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme';
import { haptics } from '@/utils/haptics';
import { monthKeyShortLabel } from '@/utils/date';
import { formatAmount } from '@/utils/format';

export type MonthBar = { month: string; value: number };

/**
 * A branch's net profit across the window, as a row of bars.
 *
 * This is requirement 15's actual ask — *"branches that are declining are visible
 * without reading every number"*. Twelve figures in a table are twelve numbers to
 * read; twelve bars are one shape.
 *
 * ## Built from Views, not a charting library
 *
 * React Native draws a rectangle of a given height perfectly well, and a chart
 * package for twelve rectangles would be a dependency, a native build concern and
 * a second set of styling conventions for no capability gained.
 *
 * ## The geometry
 *
 * Net profit goes negative, so the bars grow **both ways from a zero line** in
 * the middle rather than up from the bottom — a loss drawn as a short upward bar
 * would read as a small profit. Each half is `HALF_HEIGHT`, and the tallest
 * absolute value in the window fills it, so the shape is comparable across the
 * months shown and deliberately not across branches: one branch's ₹50,000 and
 * another's ₹5,00,000 each fill their own row, and the figures beside them carry
 * the magnitude.
 *
 * Bars are laid out with `flex: 1` inside a row, so twelve of them share whatever
 * width there is rather than assuming a screen size. At 12 months in a card on a
 * 393dp phone that is about 22dp each — narrow for a touch target, which is why
 * `hitSlop` widens it and why the month strip above the list, not this, is the
 * primary way to change month.
 */

const HALF_HEIGHT = 26;
/** So a month with nothing recorded is still visibly a bar at zero, not a gap. */
const MIN_BAR = 2;

type Props = {
  bars: MonthBar[];
  currency: string;
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
};

export default function MonthBars({ bars, currency, selectedMonth, onSelectMonth }: Props) {
  const { t } = useTranslation();

  const scale = Math.max(...bars.map((bar) => Math.abs(bar.value)), 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {bars.map((bar) => {
          const height = Math.max((Math.abs(bar.value) / scale) * HALF_HEIGHT, MIN_BAR);
          const isLoss = bar.value < 0;
          const selected = bar.month === selectedMonth;

          return (
            <Pressable
              key={bar.month}
              style={styles.column}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityLabel={`${monthKeyShortLabel(bar.month, t)} — ${formatAmount(bar.value, currency)}`}
              onPress={() => {
                haptics.select();
                onSelectMonth(bar.month);
              }}
            >
              {/* Two fixed halves, so every bar's zero line is at the same
                  height however tall its bar is. */}
              <View style={styles.half}>
                {!isLoss ? (
                  <View
                    style={[styles.bar, styles.profit, selected && styles.barSelected, { height }]}
                  />
                ) : null}
              </View>
              <View style={styles.zeroLine} />
              <View style={[styles.half, styles.halfLower]}>
                {isLoss ? (
                  <View style={[styles.bar, styles.loss, selected && styles.barSelected, { height }]} />
                ) : null}
              </View>
              <Text style={[styles.tick, selected && styles.tickSelected]} numberOfLines={1}>
                {bar.month.slice(5)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  // flex: 1 on the column, so the number of months decides the bar width
  // instead of a hardcoded one that only works at one screen size.
  column: { flex: 1, alignItems: 'center' },
  half: { height: HALF_HEIGHT, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  halfLower: { justifyContent: 'flex-start' },
  bar: { width: '76%', minWidth: 4, borderRadius: 2 },
  profit: { backgroundColor: colors.success, opacity: 0.55 },
  loss: { backgroundColor: colors.error, opacity: 0.55 },
  // The selected month is full strength; the rest are faded. Opacity rather
  // than a different hue, so profit stays green and loss stays red throughout.
  barSelected: { opacity: 1 },
  zeroLine: { height: 1, width: '100%', backgroundColor: colors.border },
  tick: { fontSize: 9, color: colors.textTertiary, marginTop: 3 },
  tickSelected: { color: colors.primary, fontWeight: '800' },
});
