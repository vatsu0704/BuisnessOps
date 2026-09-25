import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useNavigationState } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useBranchProducts } from '@/hooks/useBranchProducts';
import { refreshSalesSummary } from '@/store/salesStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import { extractErrorMessage } from '@/api/client';
import {
  addCounterItem,
  closeCounterOrder,
  getCounterDaySummary,
  listCounterOrders,
  openCounterOrder,
  updateCounterItem,
  voidCounterOrder,
} from '@/api/counter';
import type { CounterDaySummary, CounterOrder } from '@/types/counter';
import { formatAmount } from '@/utils/format';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import StatTile from '@/components/StatTile';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { haptics } from '@/utils/haptics';

/**
 * The counter — requirement 1.
 *
 * Laid out the way the job is done, not the way the data is shaped: the open
 * order and its running total are pinned at the bottom under your thumb, the
 * product grid fills the screen above it, and the day's other tokens sit below.
 * Ringing up is tapping a product; that is the whole interaction.
 *
 * Deliberately NOT a cart-and-checkout flow. There is no payment step to walk
 * through — the token is issued when the order opens, the total counts as items
 * go on, and "close" simply hands it over.
 */

/**
 * Grid geometry, derived from the screen rather than fixed.
 *
 * A percentage column width (`width: '31%'`) says "always three across" — which
 * is a guess about the device, and wrong on a small phone in Gujarati and
 * wasteful on a tablet. Deriving the column count from a minimum readable tile
 * width means a narrow screen drops to two columns instead of truncating a
 * product name, and a wide one uses the room it has.
 */
const GRID_GAP = spacing.sm;
/**
 * 96dp leaves ~22 characters over the name's two lines once padding is taken
 * off, which holds the long end of a real menu ("Paneer Butter Masala") without
 * ellipsis. It is also below the 98.7dp that a 360dp phone — the common budget
 * Android, and most of this product's counters — needs to get three columns
 * rather than dropping to two while a 384dp phone beside it shows three.
 */
const MIN_TILE_WIDTH = 96;
const MAX_COLUMNS = 6;

/**
 * How much of the screen the open order may take before it scrolls.
 *
 * An order of twenty items would otherwise push the product grid off the top —
 * the tray would grow until there was nothing left to ring up with.
 */
const TRAY_MAX_HEIGHT = 196;

export default function CounterScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  /**
   * The counter is a tab for a cashier and a pushed screen for everyone senior
   * enough that it was demoted off their tab bar. Only the pushed copy needs a
   * way out, so ask the navigator this screen actually belongs to.
   *
   * Not `canGoBack()`: a bottom-tab navigator keeps its own history, so that
   * returns true on the cashier's tab as soon as they have visited Home, and
   * the close button would render where there is nothing to close.
   */
  const isPushed = useNavigationState((state) => state.type === 'stack');
  const businessId = useBusinessId();
  const business = useAuthStore((s) => s.business);
  const { tradingBranches: branches } = useBranches();

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const branchId = selectedBranchId ?? branches[0]?.id ?? null;

  const { products, refresh: refreshProducts } = useBranchProducts(branchId);
  const [orders, setOrders] = useState<CounterOrder[]>([]);
  const [summary, setSummary] = useState<CounterDaySummary | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency = summary?.currency ?? business?.defaultCurrency ?? 'INR';
  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeOrderId) ?? null,
    [orders, activeOrderId]
  );

  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = useMemo(() => {
    const available = windowWidth - spacing.xl * 2;
    const fitted = Math.floor((available + GRID_GAP) / (MIN_TILE_WIDTH + GRID_GAP));
    const columns = Math.max(2, Math.min(MAX_COLUMNS, fitted));
    return (available - GRID_GAP * (columns - 1)) / columns;
  }, [windowWidth]);

  /**
   * How many of each product are already on the open token, so tapping the same
   * tile four times shows four rather than looking like nothing happened.
   */
  const quantityOnOrder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of activeOrder?.items ?? []) {
      if (!item.productId) continue;
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + Number(item.quantity));
    }
    return counts;
  }, [activeOrder]);

  const load = useCallback(async () => {
    if (!businessId || !branchId) {
      setOrders([]);
      setSummary(null);
      return;
    }
    setError(null);
    try {
      const [dayOrders, daySummary] = await Promise.all([
        listCounterOrders(businessId, branchId),
        getCounterDaySummary(businessId, branchId),
      ]);
      setOrders(dayOrders);
      setSummary(daySummary);
      // Keep working on the same token across a refresh; otherwise fall to the
      // most recent one still open, which is almost always the right guess.
      setActiveOrderId((current) => {
        if (current && dayOrders.some((o) => o.id === current && o.status === 'OPEN')) return current;
        return dayOrders.find((o) => o.status === 'OPEN')?.id ?? null;
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, branchId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // The Counter tab never unmounts, so without this a product added or
      // priced on another screen would not reach the grid until the app was
      // restarted.
      void refreshProducts();
    }, [load, refreshProducts])
  );

  /** Every mutation returns the whole order, so the list is patched not refetched. */
  function applyOrder(updated: CounterOrder) {
    setOrders((prev) => {
      const without = prev.filter((order) => order.id !== updated.id);
      return [updated, ...without].sort((a, b) => b.tokenNumber - a.tokenNumber);
    });
  }

  async function run<T>(action: () => Promise<T>, after?: (result: T) => void) {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await action();
      haptics.success();
      after?.(result);
      // The day totals move on every mutation, and only the server knows them.
      if (businessId && branchId) setSummary(await getCounterDaySummary(businessId, branchId));
      // A counter order projects into the sales fact table, so the figure on
      // Home moved too. Refreshing the shared store is what makes it move on
      // screen rather than at the next restart.
      void refreshSalesSummary();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  const startOrder = () =>
    run(
      () => openCounterOrder(businessId!, branchId!),
      (order) => {
        applyOrder(order);
        setActiveOrderId(order.id);
      }
    );

  const ringUp = (productId: string) => {
    if (!activeOrder) {
      // Tapping a product with nothing open should start a token rather than
      // scolding — that is what the cashier meant.
      void run(
        async () => {
          const order = await openCounterOrder(businessId!, branchId!);
          return addCounterItem(businessId!, order.id, { productId, quantity: 1 });
        },
        (order) => {
          applyOrder(order);
          setActiveOrderId(order.id);
        }
      );
      return;
    }
    void run(() => addCounterItem(businessId!, activeOrder.id, { productId, quantity: 1 }), applyOrder);
  };

  const changeQuantity = (itemId: string, quantity: number) => {
    if (!activeOrder) return;
    void run(() => updateCounterItem(businessId!, activeOrder.id, itemId, quantity), applyOrder);
  };

  const handOver = () => {
    if (!activeOrder) return;
    void run(() => closeCounterOrder(businessId!, activeOrder.id), (order) => {
      applyOrder(order);
      setActiveOrderId(null);
    });
  };

  const confirmVoid = async (order: CounterOrder) => {
    const ok = await confirm({
      title: t('counter.voidTitle', { token: order.tokenNumber }),
      body: t('counter.voidBody'),
      confirmLabel: t('counter.void'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    void run(
      () => voidCounterOrder(businessId!, order.id),
      (updated) => {
        applyOrder(updated);
        if (activeOrderId === updated.id) setActiveOrderId(null);
      }
    );
  };

  const sellable = products.filter((product) => product.effectiveSellPrice !== null);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('counter.title')}</Text>
          <View style={styles.headerActions}>
            {summary?.isClosed ? <Pill label={t('counter.dayClosed')} tone="muted" /> : null}
            {isPushed ? (
              <PressableScale
                testID="counter-close"
                style={styles.close}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </PressableScale>
            ) : null}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.primary} />}
        >
          {branches.length > 1 ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.branchGrid}>
                {branches.map((branch) => (
                  <View key={branch.id} style={styles.branchItem}>
                    <SegmentedOption
                      testID={`counter-branch-${branch.code}`}
                      title={branch.name}
                      caption={branch.code}
                      icon="storefront-outline"
                      selected={branch.id === branchId}
                      onPress={() => {
                        setSelectedBranchId(branch.id);
                        setActiveOrderId(null);
                      }}
                    />
                  </View>
                ))}
              </View>
            </AnimatedEntrance>
          ) : null}

          {error ? (
            <AnimatedEntrance key={error} delay={0} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {/* "The money keeps counting" — requirement 1, literally. */}
          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.statRow}>
              <StatTile
                label={t('counter.dayTotal')}
                value={Number(summary?.totalAmount ?? 0)}
                accent={colors.success}
                formatValue={(v) => formatAmount(v, currency)}
              />
              <StatTile label={t('counter.dayOrders')} value={summary?.orderCount ?? 0} />
              <StatTile label={t('counter.dayOpen')} value={summary?.openCount ?? 0} />
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(2)} style={styles.block}>
            <Text style={styles.sectionTitle}>{t('counter.tapToAdd')}</Text>
            {sellable.length === 0 ? (
              <Text style={styles.empty}>{t('counter.noProducts')}</Text>
            ) : (
              <View style={styles.productGrid}>
                {sellable.map((product) => {
                  const onOrder = quantityOnOrder.get(product.id) ?? 0;
                  return (
                    <PressableScale
                      key={product.id}
                      testID={`counter-product-${product.id}`}
                      style={[styles.tile, { width: tileWidth }, onOrder > 0 && styles.tileOnOrder]}
                      onPress={() => ringUp(product.id)}
                    >
                      <Text style={styles.tileName} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <View style={styles.tileFoot}>
                        <Text style={styles.tilePrice} numberOfLines={1}>
                          {formatAmount(Number(product.effectiveSellPrice), currency)}
                        </Text>
                        {onOrder > 0 ? (
                          <View style={styles.tileCount}>
                            <Text style={styles.tileCountText}>{onOrder}</Text>
                          </View>
                        ) : (
                          <Ionicons name="add" size={15} color={colors.textTertiary} />
                        )}
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          </AnimatedEntrance>

          {/* The day's other tokens, so a cashier can correct one that has
              already been handed over — requirement 1's "they can edit it". */}
          {orders.length > 0 ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <Text style={styles.sectionTitle}>{t('counter.todayTokens')}</Text>
              <View style={styles.list}>
                {orders.map((order) => (
                  <PressableScale
                    key={order.id}
                    testID={`counter-order-${order.id}`}
                    scaleTo={0.99}
                    style={[
                      styles.orderRow,
                      order.id === activeOrderId && styles.orderRowActive,
                      order.status === 'VOID' && styles.orderRowVoid,
                    ]}
                    onPress={() => setActiveOrderId(order.status === 'VOID' ? null : order.id)}
                    onLongPress={() => { if (order.status !== 'VOID') void confirmVoid(order); }}
                  >
                    <View style={styles.tokenBadge}>
                      <Text style={styles.tokenText}>{order.tokenNumber}</Text>
                    </View>
                    <View style={styles.orderText}>
                      <Text
                        style={[styles.orderTotal, order.status === 'VOID' && styles.orderTotalVoid]}
                      >
                        {formatAmount(Number(order.totalAmount), order.currency)}
                      </Text>
                      <Text style={styles.orderMeta}>
                        {t('counter.itemCount', { count: order.items.length })}
                      </Text>
                    </View>
                    <Pill
                      label={t(`counterStatus.${order.status}`)}
                      tone={order.status === 'OPEN' ? 'brand' : 'muted'}
                    />
                  </PressableScale>
                ))}
              </View>
              <Text style={styles.hint}>{t('counter.longPressHint')}</Text>
            </AnimatedEntrance>
          ) : null}
        </ScrollView>

        {/* The open order lives under the thumb, not buried in the scroll. */}
        <View style={styles.tray}>
          {activeOrder ? (
            <>
              <View style={styles.trayHead}>
                <View style={styles.tokenBadgeLarge}>
                  <Text style={styles.tokenTextLarge}>{activeOrder.tokenNumber}</Text>
                </View>
                <Text style={styles.trayTotal}>
                  {formatAmount(Number(activeOrder.totalAmount), activeOrder.currency)}
                </Text>
                <PressableScale
                  testID="counter-hand-over"
                  style={[styles.handOver, activeOrder.items.length === 0 && styles.handOverDisabled]}
                  onPress={handOver}
                >
                  <Text style={styles.handOverText}>{t('counter.handOver')}</Text>
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                </PressableScale>
              </View>

              {activeOrder.items.length === 0 ? (
                <Text style={styles.trayEmpty}>{t('counter.trayEmpty')}</Text>
              ) : (
                <ScrollView
                  style={styles.trayLines}
                  contentContainerStyle={styles.trayLinesContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {activeOrder.items.map((item) => (
                    <View key={item.id} style={styles.lineRow}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {item.productNameSnapshot}
                      </Text>
                      <PressableScale
                        testID={`counter-less-${item.id}`}
                        style={styles.stepper}
                        onPress={() => changeQuantity(item.id, Number(item.quantity) - 1)}
                      >
                        <Ionicons name="remove" size={15} color={colors.text} />
                      </PressableScale>
                      <Text style={styles.lineQty}>{Number(item.quantity)}</Text>
                      <PressableScale
                        testID={`counter-more-${item.id}`}
                        style={styles.stepper}
                        onPress={() => changeQuantity(item.id, Number(item.quantity) + 1)}
                      >
                        <Ionicons name="add" size={15} color={colors.text} />
                      </PressableScale>
                      <Text style={styles.lineTotal}>
                        {formatAmount(Number(item.lineTotal), currency)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          ) : (
            <PressableScale
              testID="counter-new-order"
              style={[styles.newOrder, summary?.isClosed && styles.newOrderDisabled]}
              disabled={summary?.isClosed}
              onPress={startOrder}
            >
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Text style={styles.newOrderText}>{t('counter.newOrder')}</Text>
            </PressableScale>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flexShrink: 1, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  block: { marginTop: spacing.md },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  branchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // Grow rather than sit at a fixed half-width, so an odd third branch fills its
  // own row instead of leaving a ragged gap beside it.
  branchItem: { flexGrow: 1, flexBasis: '46%' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: {
    // Width is measured, not guessed — see the grid geometry note above.
    minHeight: 84,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  tileOnOrder: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  tileName: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: colors.text },
  tileFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  tilePrice: { flexShrink: 1, fontSize: 13.5, fontWeight: '800', color: colors.primary },
  tileCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCountText: { fontSize: 11, fontWeight: '800', color: colors.white },
  empty: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  list: { gap: spacing.sm },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  orderRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  // A void is still information — kept in the list, but visibly spent.
  orderRowVoid: { opacity: 0.6, backgroundColor: colors.background },
  orderTotalVoid: { textDecorationLine: 'line-through', color: colors.textSecondary },
  tokenBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  orderText: { flex: 1 },
  orderTotal: { fontSize: 14, fontWeight: '700', color: colors.text },
  orderMeta: { fontSize: 12, color: colors.textTertiary },
  hint: { fontSize: 11.5, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
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
  trayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tokenBadgeLarge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenTextLarge: { fontSize: 15, fontWeight: '800', color: colors.white },
  trayTotal: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  handOver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  handOverDisabled: { opacity: 0.4 },
  handOverText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  trayLines: { maxHeight: TRAY_MAX_HEIGHT },
  trayLinesContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineName: { flex: 1, fontSize: 13.5, color: colors.text },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineQty: { minWidth: 22, textAlign: 'center', fontSize: 13.5, fontWeight: '700', color: colors.text },
  lineTotal: { minWidth: 64, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: colors.text },
  trayEmpty: { fontSize: 12.5, color: colors.textTertiary, textAlign: 'center' },
  newOrder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  newOrderDisabled: { opacity: 0.4 },
  newOrderText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
