import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { SupplyPaymentPill, SupplyStatusPill } from '@/components/supply/SupplyPills';
import { formatAmount } from '@/utils/format';
import { colors, radius, spacing } from '@/theme';
import type { SupplyOrder } from '@/types/supply';

/**
 * One order in a list.
 *
 * The same card serves the cashier's tracking list, the warehouse desk and the
 * delivery queue. They differ in which orders they contain, not in how an order
 * looks — three near-identical row components would drift apart within a task
 * or two, and the desk's copy would be the one that forgot to show the delay.
 *
 * `showBranch` is the only variation: the desk and the delivery queue span
 * branches, so they say which one; a cashier looking at their own branch does
 * not need telling.
 */
export default function SupplyOrderCard({
  order,
  showBranch = false,
  onPress,
  testID,
}: {
  order: SupplyOrder;
  showBranch?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();

  // The most recent delay, which is what someone waiting actually wants to see.
  // Earlier ones are still on the order's timeline.
  const lastDelay = [...order.events].reverse().find((event) => event.type === 'DELAY');

  return (
    <PressableScale testID={testID} scaleTo={0.99} style={styles.card} onPress={onPress}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>
            {order.orderNumber === null
              ? t('supply.draftTitle')
              : t('supply.orderTitle', { number: order.orderNumber })}
          </Text>
          <Text style={styles.meta}>
            {showBranch && order.branch ? `${order.branch.name} · ` : ''}
            {t('supply.reviewCount', { count: order.items.length })}
          </Text>
        </View>
        <Text style={styles.amount}>{formatAmount(Number(order.totalAmount), order.currency)}</Text>
      </View>

      <View style={styles.pills}>
        <SupplyStatusPill status={order.status} />
        {order.paymentMode ? (
          <SupplyPaymentPill status={order.paymentStatus} mode={order.paymentMode} />
        ) : null}
      </View>

      {/* Who is carrying it, so the desk's queue answers "where has 214 got
          to?" without opening every row. */}
      {order.deliveryAgentMembership ? (
        <Text style={styles.agent} numberOfLines={1}>
          {t('supply.assignedTo', {
            name: order.deliveryAgentMembership.user?.name ?? t('supply.assignUnnamed'),
          })}
        </Text>
      ) : null}

      {lastDelay ? (
        <View style={styles.delay}>
          <Ionicons name="time-outline" size={14} color={colors.warning} />
          <Text style={styles.delayText} numberOfLines={1}>
            {t('supply.delayBadge', { minutes: lastDelay.delayMinutes ?? 0 })}
            {lastDelay.reasonCode ? ` · ${t(`supplyDelay.${lastDelay.reasonCode}` as never)}` : ''}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textTertiary },
  agent: { fontSize: 12, color: colors.textSecondary },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  // Wraps rather than sitting in a fixed row: two pills fit side by side in
  // English and not always in Gujarati, where the labels run longer.
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  delay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FDF3E3',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 1,
  },
  delayText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.warning },
});
