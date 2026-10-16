import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { colors, radius, spacing } from '@/theme';
import { formatAmountPrecise } from '@/utils/format';
import { translateSaleRejection } from '@/api/errorMessages';
import type { LocalSale } from '@/types/counter';

type Props = {
  sales: LocalSale[];
  /** May reopen a closed day — the fix for a bill refused because its day was closed. */
  canReopenDay: boolean;
  busyRef: string | null;
  onRetry: (sale: LocalSale) => void;
  onReopenDay: (sale: LocalSale) => void;
  onRemove: (sale: LocalSale) => void;
};

/**
 * Bills the server refused (requirement 30). They are the shop's money, so they
 * are never dropped on the phone's own initiative: each one says why it was
 * refused and offers what a person can do — send it again once the cause is
 * fixed, reopen the day it belongs to, or, after confirming, remove it.
 *
 * Every action stacks under its bill rather than sharing a row, because their
 * labels are long in every Indic language.
 */
export default function AttentionCard({ sales, canReopenDay, busyRef, onRetry, onReopenDay, onRemove }: Props) {
  const { t } = useTranslation();
  if (sales.length === 0) return null;

  return (
    <View testID="counter-attention" style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="alert-circle" size={18} color={colors.error} />
        <Text style={styles.title}>{t('counter.attentionTitle', { count: sales.length })}</Text>
      </View>
      <Text style={styles.body}>{t('counter.attentionBody')}</Text>

      {sales.map((sale) => {
        const busy = busyRef === sale.clientRef;
        const dayClosed = sale.rejection?.code === 'COUNTER_ORDER_DAY_CLOSED';
        return (
          <View key={sale.clientRef} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={styles.token}>
                <Text style={styles.tokenText}>{sale.tokenNumber}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.amount}>{formatAmountPrecise(sale.total, sale.currency)}</Text>
                <Text style={styles.meta}>{sale.dayKey}</Text>
              </View>
            </View>
            <Text style={styles.reason}>
              {sale.rejection ? translateSaleRejection(sale.rejection.code, sale.rejection.params) : ''}
            </Text>
            <View style={styles.actions}>
              {dayClosed && canReopenDay ? (
                <Action
                  testID={`counter-attention-reopen-${sale.clientRef}`}
                  icon="lock-open-outline"
                  label={t('counter.reopenDay')}
                  disabled={busy}
                  onPress={() => onReopenDay(sale)}
                />
              ) : null}
              <Action
                testID={`counter-attention-retry-${sale.clientRef}`}
                icon="refresh"
                label={t('counter.sendAgain')}
                disabled={busy}
                onPress={() => onRetry(sale)}
              />
              <Action
                testID={`counter-attention-remove-${sale.clientRef}`}
                icon="trash-outline"
                label={t('counter.removeFromPhone')}
                tone="danger"
                disabled={busy}
                onPress={() => onRemove(sale)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
  tone = 'brand',
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'brand' | 'danger';
  testID?: string;
}) {
  const tint = tone === 'danger' ? colors.error : colors.primary;
  return (
    <PressableScale
      testID={testID}
      scaleTo={0.97}
      disabled={disabled}
      style={[styles.action, disabled && styles.actionDisabled]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={[styles.actionText, { color: tint }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.error,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.error },
  body: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  token: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenText: { fontSize: 13, fontWeight: '800', color: colors.error },
  rowText: { flex: 1, gap: 1 },
  amount: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textTertiary },
  reason: { fontSize: 12.5, color: colors.text, lineHeight: 17 },
  actions: { gap: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  actionDisabled: { opacity: 0.5 },
  actionText: { fontSize: 13.5, fontWeight: '700' },
});
