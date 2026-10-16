import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import { colors, radius, shadow, spacing } from '@/theme';
import { formatAmountPrecise } from '@/utils/format';
import { cartItemCount, cartTotal, lineTotal } from '@/utils/counterQueue';
import type { CartLine } from '@/types/counter';

type Props = {
  lines: CartLine[];
  currency: string;
  /** Why a bill cannot be taken right now — the day is closed, the plan has ended — or null. */
  blockedReason: string | null;
  onChangeQuantity: (index: number, quantity: number) => void;
  onClear: () => void;
  onCharge: () => void;
};

/**
 * The bill being rung up, under the cashier's thumb (requirement 29).
 *
 * The total and the Charge button are stacked rather than side by side: both
 * grow — the figure with the bill, the label in every Indic translation — and a
 * row of two growing things is the row that breaks in Gujarati. The lines
 * scroll inside a ceiling so a twenty-item bill never pushes the menu off the
 * screen.
 */
const LINES_MAX_HEIGHT = 168;

export default function CartTray({
  lines,
  currency,
  blockedReason,
  onChangeQuantity,
  onClear,
  onCharge,
}: Props) {
  const { t } = useTranslation();
  const total = cartTotal(lines);
  const items = cartItemCount(lines);

  return (
    // Inside the screen's SafeAreaView, whose edges (useScreenEdges) already keep
    // it clear of the navigation bar when the counter is pushed rather than a tab.
    <View style={styles.tray}>
      {blockedReason ? (
        <View style={styles.blocked}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.warning} />
          <Text style={styles.blockedText}>{blockedReason}</Text>
        </View>
      ) : null}

      {lines.length === 0 ? (
        <Text style={styles.empty}>{t('counter.cartEmpty')}</Text>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.headText}>{t('counter.itemCount', { count: items })}</Text>
            <PressableScale testID="counter-cart-clear" scaleTo={0.96} onPress={onClear} hitSlop={8}>
              <Text style={styles.clear}>{t('counter.clearCart')}</Text>
            </PressableScale>
          </View>
          <ScrollView
            style={styles.lines}
            contentContainerStyle={styles.linesContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {lines.map((line, index) => (
              <View key={`${line.productId ?? line.name}-${line.unitPrice}`} style={styles.lineRow}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {line.name}
                </Text>
                <PressableScale
                  testID={`counter-less-${index}`}
                  style={styles.stepper}
                  onPress={() => onChangeQuantity(index, line.quantity - 1)}
                >
                  <Ionicons name={line.quantity === 1 ? 'trash-outline' : 'remove'} size={15} color={colors.text} />
                </PressableScale>
                <Text style={styles.lineQty}>{line.quantity}</Text>
                <PressableScale
                  testID={`counter-more-${index}`}
                  style={styles.stepper}
                  onPress={() => onChangeQuantity(index, line.quantity + 1)}
                >
                  <Ionicons name="add" size={15} color={colors.text} />
                </PressableScale>
                <Text style={styles.lineTotal}>{formatAmountPrecise(lineTotal(line), currency)}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('counter.billTotal')}</Text>
            <Text style={styles.totalValue}>{formatAmountPrecise(total, currency)}</Text>
          </View>
          <PrimaryButton
            testID="counter-charge"
            title={t('counter.charge', { amount: formatAmountPrecise(total, currency) })}
            icon="cash-outline"
            disabled={!!blockedReason}
            onPress={onCharge}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    ...shadow.md,
  },
  blocked: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: '#FDF3E3',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  blockedText: { flex: 1, fontSize: 12.5, color: colors.warning, lineHeight: 17 },
  empty: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  clear: { fontSize: 12.5, fontWeight: '700', color: colors.error },
  lines: { maxHeight: LINES_MAX_HEIGHT },
  linesContent: { gap: spacing.xs },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineName: { flex: 1, minWidth: 0, fontSize: 13.5, color: colors.text },
  stepper: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineQty: { minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.text },
  lineTotal: { minWidth: 64, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: colors.text },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  totalValue: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
});
