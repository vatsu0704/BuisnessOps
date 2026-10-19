import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import { extractErrorMessage } from '@/api/client';
import { listPaymentHistory } from '@/api/supply';
import type { PaymentHistory as History, PaymentHistoryOrder } from '@/types/supply';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import SegmentedOption from '@/components/SegmentedOption';
import StatTile from '@/components/StatTile';
import { SupplyPaymentPill } from '@/components/supply/SupplyPills';
import { colors, radius, spacing, typography } from '@/theme';
import { formatDate, formatTime } from '@/utils/date';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import { payeeOf } from '@/utils/upi';
import { historyTotals } from '@/utils/supplyPayments';

type Model = 'ALL' | 'FOCO' | 'FM';

/**
 * What was paid, month by month — requirement 35.
 *
 * Once a FOCO order is paid by accounts, or an FM branch's payment is confirmed,
 * it leaves the Payments lists; this is where it is found again. Each order says
 * who it was for, how much, how it stands now, and its payments in order — who
 * paid or confirmed, when, and the reference typed with it.
 *
 * Its own data, read by this one tab, so it stays local and is refetched on
 * focus rather than living in a store.
 */
export default function PaymentHistory({ header }: { header?: React.ReactElement | null }) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const businessId = useBusinessId();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const [model, setModel] = useState<Model>('ALL');
  const [history, setHistory] = useState<History | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setHistory(await listPaymentHistory(businessId, { month: monthKey, model: model === 'ALL' ? undefined : model }));
    } catch (err) {
      // The last month read stays on screen beside the error.
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, monthKey, model]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const shown = history && history.month === monthKey ? history : null;
  const currency = shown?.orders[0]?.currency ?? 'INR';
  const totals = useMemo(() => historyTotals(shown?.totals ?? []), [shown]);

  const listHeader = (
    <View style={styles.headerBlock}>
      {header}
      <View style={styles.monthNav}>
        <PressableScale testID="payments-history-prev" onPress={goPrev} style={styles.monthButton}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </PressableScale>
        <Text style={styles.monthLabel}>{label}</Text>
        <PressableScale
          testID="payments-history-next"
          onPress={goNext}
          disabled={!canGoNext}
          style={[styles.monthButton, !canGoNext && styles.disabled]}
        >
          <Ionicons name="chevron-forward" size={18} color={canGoNext ? colors.text : colors.textTertiary} />
        </PressableScale>
      </View>

      {/* Three choices — SegmentedOption's limit, and what it is for. */}
      <View style={styles.filters}>
        <SegmentedOption
          testID="payments-history-all"
          title={t('payments.historyAll')}
          selected={model === 'ALL'}
          onPress={() => setModel('ALL')}
        />
        <SegmentedOption
          testID="payments-history-foco"
          title="FOCO"
          caption={t('payments.historyFocoCaption')}
          selected={model === 'FOCO'}
          onPress={() => setModel('FOCO')}
        />
        <SegmentedOption
          testID="payments-history-fm"
          title="FM"
          caption={t('payments.historyFmCaption')}
          selected={model === 'FM'}
          onPress={() => setModel('FM')}
        />
      </View>

      <View style={styles.tiles}>
        {model !== 'FM' ? (
          <StatTile
            label={t('payments.historyPaidByAccounts')}
            value={totals.foco.amount}
            caption={t('payments.historyOrders', { count: totals.foco.count })}
            formatValue={(v) => formatAmount(v, currency)}
          />
        ) : null}
        {model !== 'FOCO' ? (
          <StatTile
            label={t('payments.historyPaidByBranches')}
            value={totals.fm.amount}
            caption={t('payments.historyOrders', { count: totals.fm.count })}
            formatValue={(v) => formatAmount(v, currency)}
          />
        ) : null}
      </View>
      {totals.waiting.count > 0 ? (
        <Text style={styles.waiting}>
          {t('payments.historyWaiting', { count: totals.waiting.count, amount: formatAmount(totals.waiting.amount, currency) })}
        </Text>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      testID="payments-history"
      data={shown?.orders ?? []}
      keyExtractor={(order) => order.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={listHeader}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void load()} tintColor={colors.primary} />}
      ListEmptyComponent={
        isLoading ? null : (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={22} color={colors.textTertiary} />
            <Text style={styles.emptyText}>{t('payments.historyEmpty', { month: label })}</Text>
          </View>
        )
      }
      ListFooterComponent={
        shown?.truncated ? <Text style={styles.truncated}>{t('payments.historyTruncated')}</Text> : null
      }
      renderItem={({ item }) => (
        <HistoryRow order={item} onOpen={() => navigation.navigate('SupplyOrderDetail', { supplyOrderId: item.id })} />
      )}
    />
  );
}

function HistoryRow({ order, onOpen }: { order: PaymentHistoryOrder; onOpen: () => void }) {
  const { t } = useTranslation();
  const payee = payeeOf(order);
  return (
    <PressableScale testID={`payments-history-${order.id}`} scaleTo={0.99} style={styles.row} onPress={onOpen}>
      <View style={styles.rowHead}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            {t('supply.orderTitle', { number: order.orderNumber ?? '' })} · {order.branch?.name ?? ''}
          </Text>
          <Text style={styles.rowMeta}>{t('upiPay.payTo', { name: payee.name })}</Text>
        </View>
        <Text style={styles.rowAmount}>{formatAmountPrecise(Number(order.totalAmount), order.currency)}</Text>
      </View>
      <View style={styles.pills}>
        <Pill label={order.operatingModel} tone="muted" />
        <SupplyPaymentPill status={order.paymentStatus} mode={order.paymentMode} />
      </View>
      <View style={styles.events}>
        {order.events.map((event) => (
          <View key={event.id} style={styles.event}>
            <View style={styles.dot} />
            <Text style={styles.eventText}>
              {t(`supplyEvent.${event.reasonCode}` as never)}
              {' · '}
              {event.actorMembership?.user?.name ?? t('paymentAccounts.someone')}
              {' · '}
              {formatDate(event.createdAt, t)} {formatTime(event.createdAt, t)}
              {event.note ? `\n${t('payments.reference', { reference: event.note })}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  monthLabel: { ...typography.label, fontSize: 15, color: colors.text },
  filters: { flexDirection: 'row', gap: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  waiting: { fontSize: 12.5, color: colors.warning, lineHeight: 17 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  truncated: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12.5, color: colors.textSecondary },
  rowAmount: { fontSize: 15, fontWeight: '800', color: colors.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  events: { gap: spacing.xs },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 6 },
  eventText: { flex: 1, fontSize: 12.5, color: colors.text, lineHeight: 18 },
});
