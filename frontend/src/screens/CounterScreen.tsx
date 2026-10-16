import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useNavigationState } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useBranches } from '@/hooks/useBranches';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import { useAuthStore } from '@/store/authStore';
import { useCounterStore, type CounterBranch } from '@/store/counterStore';
import { usePrinterStore } from '@/store/printerStore';
import { extractErrorMessage } from '@/api/client';
import { reopenCounterDay } from '@/api/counter';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import StatTile from '@/components/StatTile';
import AttentionCard from '@/components/counter/AttentionCard';
import BillSheet from '@/components/counter/BillSheet';
import CartTray from '@/components/counter/CartTray';
import ChargeSheet, { type ChargeDone } from '@/components/counter/ChargeSheet';
import SyncPill from '@/components/counter/SyncPill';
import { colors, radius, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import { formatTime } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import { confirm } from '@/utils/confirm';
import { can, isReadOnly } from '@/utils/permissions';
import { kickCounterSync } from '@/utils/counterSync';
import { upiNote } from '@/utils/upiUri';
import { isPrintingSupported, printBytes, printerErrorKey } from '@/utils/printer';
import { buildReceipt } from '@/utils/receipt';
import { receiptForBill } from '@/utils/counterReceipt';
import {
  EMPTY_QUEUE,
  addToCart,
  billOfSale,
  branchDayKey,
  cartTotal,
  mergeBills,
  nextTokenNumber,
  pendingSales,
  rejectedSales,
  setCartQuantity,
  unsyncedFigures,
  type DisplayBill,
} from '@/utils/counterQueue';
import type {
  CartLine,
  CounterDaySummary,
  CounterOrder,
  CounterPaymentMethod,
  CounterReceiptHeader,
  LocalSale,
} from '@/types/counter';
import type { BranchProduct } from '@/types/product';

/**
 * The counter — requirements 1, 29, 30 and 31.
 *
 * Laid out the way the job is done: today's figures at the top, the menu filling
 * the screen, today's bills below it, and the bill being rung up pinned under
 * the cashier's thumb with its Charge button.
 *
 * Ringing up happens on the phone — a tap is instant, with or without a
 * connection. "Charge" takes the money (a UPI QR for the exact amount, or cash
 * with the change worked out), "Payment done" saves the bill to the phone's own
 * storage and gives it its token, the token prints, and only then is the bill
 * sent — straight away when there is a connection, later when there is not
 * (`utils/counterSync.ts`). Everything the counter reads it keeps a copy of
 * (`store/counterStore.ts`), so an offline counter still has its menu, its QR
 * and its numbers.
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

// Stable empties for a store that belongs to another business, so a selector
// returning one does not re-render on every store change.
const NO_CONTEXTS: Record<string, CounterDaySummary> = {};
const NO_ORDERS: Record<string, CounterOrder[]> = {};
const NO_PRODUCTS: Record<string, BranchProduct[]> = {};

export default function CounterScreen() {
  const edges = useScreenEdges();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
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
  const membership = useMembership();
  const business = useAuthStore((s) => s.business);
  const { tradingBranches } = useBranches();

  // Every read is checked against the business the store belongs to, so a
  // business switch never shows the previous tenant's bills for a frame — and a
  // bill can never be saved into the wrong business's queue (see `ready`).
  const loadedFor = useCounterStore((s) => s.loadedFor);
  const ready = !!businessId && loadedFor === businessId;
  const queue = useCounterStore((s) => (ready ? s.queue : EMPTY_QUEUE));
  const contexts = useCounterStore((s) => (ready ? s.contexts : NO_CONTEXTS));
  const orders = useCounterStore((s) => (ready ? s.orders : NO_ORDERS));
  const products = useCounterStore((s) => (ready ? s.products : NO_PRODUCTS));
  const cachedBranches = useCounterStore((s) => s.branches);
  const skewMs = useCounterStore((s) => s.skewMs);
  const syncState = useCounterStore((s) => s.syncState);
  const storeError = useCounterStore((s) => s.error);
  const refreshing = useCounterStore((s) => s.refreshing);
  const { load, refreshBranch, rememberBranches, completeSale, voidSale, voidServerOrder, retry, remove } =
    useCounterStore.getState();

  const printer = usePrinterStore((s) => s.printer);
  const paperWidth = usePrinterStore((s) => s.paperWidth);
  const autoPrint = usePrinterStore((s) => s.autoPrint);
  const loadPrinter = usePrinterStore((s) => s.load);

  // The branch list, from the server when it answers and from the counter's own
  // copy when it does not — an offline start has no other.
  const liveBranches = useMemo<CounterBranch[]>(
    () => tradingBranches.map(({ id, name, code }) => ({ id, name, code })),
    [tradingBranches]
  );
  const branches = liveBranches.length > 0 ? liveBranches : ready ? cachedBranches : [];
  useEffect(() => {
    if (ready && liveBranches.length > 0) rememberBranches(liveBranches);
  }, [ready, liveBranches, rememberBranches]);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const branch = branches.find((b) => b.id === selectedBranchId) ?? branches[0] ?? null;
  const branchId = branch?.id ?? null;

  const context = branchId ? contexts[branchId] : undefined;
  // Without a context — a branch never opened online — the phone's own zone is
  // the best guess, and it is right for a phone standing in the shop.
  const utcOffset = context?.utcOffsetMinutes ?? -new Date().getTimezoneOffset();
  const dayKey = branchDayKey(Date.now(), skewMs, utcOffset);
  const sameDay = context?.todayKey === dayKey;
  const currency = context?.currency ?? business?.defaultCurrency ?? 'INR';

  const todaysOrders = useMemo(
    () => (branchId ? (orders[branchId] ?? []).filter((order) => order.tokenDate.slice(0, 10) === dayKey) : []),
    [orders, branchId, dayKey]
  );
  const bills = useMemo(
    () => (branchId ? mergeBills(todaysOrders, queue, branchId, dayKey) : []),
    [todaysOrders, queue, branchId, dayKey]
  );
  const unsynced = useMemo(
    () => (branchId ? unsyncedFigures(todaysOrders, queue, branchId, dayKey) : { count: 0, total: 0 }),
    [todaysOrders, queue, branchId, dayKey]
  );
  const salesToday = (sameDay && context ? Number(context.totalAmount) : 0) + unsynced.total;
  const billsToday = (sameDay && context ? context.orderCount : 0) + unsynced.count;
  // The server sends expenses only to somebody who may read them.
  const expensesToday = sameDay && context?.expenses ? Number(context.expenses.totalAmount) : null;
  const pendingCount = pendingSales(queue).length;
  const attention = rejectedSales(queue);

  const menu = useMemo(
    () =>
      (branchId ? (products[branchId] ?? []) : []).filter(
        (product) => product.effectiveSellPrice !== null && product.effectiveIsActive
      ),
    [products, branchId]
  );

  const [cart, setCart] = useState<CartLine[]>([]);
  const onCart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of cart) {
      if (line.productId) counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.quantity);
    }
    return counts;
  }, [cart]);

  const blockedReason = isReadOnly(membership)
    ? t('counter.readOnly')
    : sameDay && context?.isClosed
      ? t('counter.dayClosedNoBills')
      : null;

  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = useMemo(() => {
    const available = windowWidth - spacing.xl * 2;
    const fitted = Math.floor((available + GRID_GAP) / (MIN_TILE_WIDTH + GRID_GAP));
    const columns = Math.max(2, Math.min(MAX_COLUMNS, fitted));
    return (available - GRID_GAP * (columns - 1)) / columns;
  }, [windowWidth]);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    await load(businessId);
    if (branchId) await refreshBranch(branchId);
    void kickCounterSync();
  }, [businessId, branchId, load, refreshBranch]);

  useFocusEffect(
    useCallback(() => {
      void loadPrinter();
      void refresh();
    }, [loadPrinter, refresh])
  );

  // --- Taking a bill ---------------------------------------------------------

  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [chargeDone, setChargeDone] = useState<ChargeDone | null>(null);
  const [lastSale, setLastSale] = useState<LocalSale | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const header: CounterReceiptHeader = context?.receiptHeader ?? {
    businessName: business?.name ?? '',
    branchName: branch?.name ?? '',
    branchCode: branch?.code ?? '',
    addressLine: null,
    phone: null,
  };

  async function printBill(bill: DisplayBill, copy: boolean): Promise<string | null> {
    try {
      const receipt = receiptForBill(bill, { header, utcOffsetMinutes: utcOffset, currency, paperWidth, copy });
      await printBytes(printer?.address, buildReceipt(receipt));
      return null;
    } catch (err) {
      return t(printerErrorKey(err));
    }
  }

  async function printLastSale(copy: boolean) {
    if (!lastSale) return;
    setChargeDone((done) => (done ? { ...done, print: 'printing', printError: null } : done));
    const failure = await printBill(billOfSale(lastSale), copy);
    if (failure) haptics.error();
    setChargeDone((done) =>
      done ? { ...done, print: failure ? 'failed' : 'printed', printError: failure } : done
    );
  }

  async function paymentDone(method: CounterPaymentMethod) {
    if (!ready || !branchId || cart.length === 0 || chargeBusy) return;
    setChargeBusy(true);
    setNotice(null);
    try {
      // Read the queue fresh: a sync may have renumbered something since render.
      const latest = useCounterStore.getState().queue;
      const day = branchDayKey(Date.now(), skewMs, utcOffset);
      const serverLast = context?.todayKey === day ? context.lastTokenNumber : 0;
      const sale = await completeSale({
        clientRef: Crypto.randomUUID(),
        branchId,
        occurredAt: new Date(Date.now() + skewMs).toISOString(),
        dayKey: day,
        tokenNumber: nextTokenNumber(latest, branchId, day, serverLast),
        paymentMethod: method,
        lines: cart,
        currency,
      });
      haptics.success();
      setCart([]);
      setLastSale(sale);

      const print: ChargeDone['print'] = !isPrintingSupported()
        ? 'unsupported'
        : !printer
          ? 'noPrinter'
          : autoPrint
            ? 'printing'
            : 'off';
      setChargeDone({ tokenNumber: sale.tokenNumber, print, printError: null });
      void kickCounterSync();

      if (print === 'printing') {
        const failure = await printBill(billOfSale(sale), false);
        if (failure) haptics.error();
        setChargeDone((done) =>
          done ? { ...done, print: failure ? 'failed' : 'printed', printError: failure } : done
        );
      }
    } catch (err) {
      // Only the save to the phone can fail here; the sale did not happen.
      haptics.error();
      setNotice(extractErrorMessage(err));
      setChargeOpen(false);
    } finally {
      setChargeBusy(false);
    }
  }

  function closeCharge() {
    setChargeOpen(false);
    setChargeDone(null);
    setLastSale(null);
  }

  // --- A bill already taken ----------------------------------------------------

  const [openBill, setOpenBill] = useState<DisplayBill | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  async function reprint(bill: DisplayBill) {
    setBillBusy(true);
    setBillError(null);
    const failure = await printBill(bill, true);
    setBillBusy(false);
    if (failure) {
      haptics.error();
      setBillError(failure);
    } else {
      haptics.success();
    }
  }

  async function voidBill(bill: DisplayBill) {
    const yes = await confirm({
      title: t('counter.voidTitle', { token: bill.tokenNumber }),
      body: t('counter.voidBody'),
      confirmLabel: t('counter.void'),
      cancelLabel: t('common.cancel'),
    });
    if (!yes || !branchId) return;
    setBillBusy(true);
    setBillError(null);
    try {
      const held = bill.clientRef ? queue.sales.some((sale) => sale.clientRef === bill.clientRef) : false;
      if (held && bill.clientRef) {
        // The phone's own bill: voided here and sent like any other change, so
        // it works offline too.
        await voidSale(bill.clientRef);
        void kickCounterSync();
      } else if (bill.orderId) {
        // A bill this phone never held — taken on another phone, or before the
        // counter took payments. Only the server can void it.
        await voidServerOrder(branchId, bill.orderId);
        void refreshBranch(branchId);
      }
      haptics.success();
      setOpenBill(null);
    } catch (err) {
      haptics.error();
      setBillError(extractErrorMessage(err));
    } finally {
      setBillBusy(false);
    }
  }

  // --- Bills the server refused ----------------------------------------------

  const [attentionBusy, setAttentionBusy] = useState<string | null>(null);

  async function sendAgain(sale: LocalSale) {
    setAttentionBusy(sale.clientRef);
    await retry(sale.clientRef);
    await kickCounterSync();
    setAttentionBusy(null);
  }

  async function reopenDay(sale: LocalSale) {
    if (!businessId) return;
    setAttentionBusy(sale.clientRef);
    setNotice(null);
    try {
      await reopenCounterDay(businessId, sale.branchId, sale.dayKey);
      await retry(sale.clientRef);
      await kickCounterSync();
    } catch (err) {
      setNotice(extractErrorMessage(err));
    } finally {
      setAttentionBusy(null);
    }
  }

  async function removeFromPhone(sale: LocalSale) {
    const yes = await confirm({
      title: t('counter.removeTitle', { token: sale.tokenNumber }),
      body: t('counter.removeBody'),
      confirmLabel: t('counter.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (yes) await remove(sale.clientRef);
  }

  const total = cartTotal(cart);
  const shownError = notice ?? storeError;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('counter.title')}</Text>
          <View style={styles.headerActions}>
            {sameDay && context?.isClosed ? <Pill label={t('counter.dayClosed')} tone="muted" /> : null}
            <PressableScale
              testID="counter-printer"
              accessibilityLabel={t('printer.title')}
              style={styles.iconButton}
              onPress={() => navigation.navigate('ReceiptPrinter')}
            >
              <Ionicons name="print-outline" size={18} color={colors.text} />
            </PressableScale>
            {isPushed ? (
              <PressableScale testID="counter-close" style={styles.iconButton} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={20} color={colors.text} />
              </PressableScale>
            ) : null}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={!!(branchId && refreshing[branchId])}
              onRefresh={() => void refresh()}
              tintColor={colors.primary}
            />
          }
        >
          <SyncPill state={syncState} pendingCount={pendingCount} attentionCount={attention.length} />

          {branches.length > 1 ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.branchGrid}>
                {branches.map((item) => (
                  <View key={item.id} style={styles.branchItem}>
                    <SegmentedOption
                      testID={`counter-branch-${item.code}`}
                      title={item.name}
                      caption={item.code}
                      icon="storefront-outline"
                      selected={item.id === branchId}
                      onPress={() => {
                        if (item.id === branchId) return;
                        setSelectedBranchId(item.id);
                        setCart([]);
                        void refreshBranch(item.id);
                      }}
                    />
                  </View>
                ))}
              </View>
            </AnimatedEntrance>
          ) : null}

          {shownError ? (
            <AnimatedEntrance key={shownError} delay={0} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{shownError}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {/* Today at the counter — and, for whoever may read them, what it spent. */}
          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.statRow}>
              <StatTile
                label={t('counter.todaySales')}
                value={salesToday}
                accent={colors.success}
                formatValue={(v) => formatAmount(v, currency)}
              />
              <StatTile label={t('counter.todayBills')} value={billsToday} />
              {expensesToday !== null ? (
                <StatTile
                  label={t('counter.todayExpenses')}
                  value={expensesToday}
                  accent={colors.error}
                  formatValue={(v) => formatAmount(v, currency)}
                />
              ) : null}
            </View>
            {can.logExpenses(membership) && branchId ? (
              <PressableScale
                testID="counter-log-expense"
                style={styles.link}
                onPress={() => navigation.navigate('AddExpense', { branchId })}
              >
                <Ionicons name="wallet-outline" size={15} color={colors.primary} />
                <Text style={styles.linkText}>{t('counter.logExpense')}</Text>
              </PressableScale>
            ) : null}
          </AnimatedEntrance>

          {attention.length > 0 ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <AttentionCard
                sales={attention}
                canReopenDay={can.closeCounterDay(membership)}
                busyRef={attentionBusy}
                onRetry={(sale) => void sendAgain(sale)}
                onReopenDay={(sale) => void reopenDay(sale)}
                onRemove={(sale) => void removeFromPhone(sale)}
              />
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(2)} style={styles.block}>
            <Text style={styles.sectionTitle}>{t('counter.tapToAdd')}</Text>
            {menu.length === 0 ? (
              <Text style={styles.empty}>{context ? t('counter.noProducts') : t('counter.noMenuYet')}</Text>
            ) : (
              <View style={styles.productGrid}>
                {menu.map((product) => {
                  const count = onCart.get(product.id) ?? 0;
                  return (
                    <PressableScale
                      key={product.id}
                      testID={`counter-product-${product.id}`}
                      style={[styles.tile, { width: tileWidth }, count > 0 && styles.tileOnOrder]}
                      onPress={() => {
                        haptics.tap();
                        setCart((lines) =>
                          addToCart(lines, {
                            productId: product.id,
                            name: product.name,
                            sku: product.sku ?? null,
                            unitPrice: Number(product.effectiveSellPrice),
                          })
                        );
                      }}
                    >
                      <Text style={styles.tileName} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <View style={styles.tileFoot}>
                        <Text style={styles.tilePrice} numberOfLines={1}>
                          {formatAmount(Number(product.effectiveSellPrice), currency)}
                        </Text>
                        {count > 0 ? (
                          <View style={styles.tileCount}>
                            <Text style={styles.tileCountText}>{count}</Text>
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

          {bills.length > 0 ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <Text style={styles.sectionTitle}>{t('counter.todayBillsSection')}</Text>
              <View style={styles.list}>
                {bills.map((bill) => {
                  const isVoid = bill.status === 'VOID';
                  return (
                    <PressableScale
                      key={bill.key}
                      testID={`counter-bill-${bill.tokenNumber}`}
                      scaleTo={0.99}
                      style={[styles.billRow, isVoid && styles.billRowVoid]}
                      onPress={() => {
                        setBillError(null);
                        setOpenBill(bill);
                      }}
                    >
                      <View style={[styles.tokenBadge, bill.rejected && styles.tokenBadgeError]}>
                        <Text style={[styles.tokenText, bill.rejected && styles.tokenTextError]}>
                          {bill.tokenNumber}
                        </Text>
                      </View>
                      <View style={styles.billText}>
                        <Text style={[styles.billTotal, isVoid && styles.billTotalVoid]}>
                          {formatAmountPrecise(bill.total, currency)}
                        </Text>
                        <Text style={styles.billMeta}>
                          {t('counter.itemCount', { count: bill.itemCount })} · {formatTime(bill.at, t)}
                        </Text>
                      </View>
                      {!bill.synced ? (
                        <Ionicons
                          name={bill.rejected ? 'alert-circle-outline' : 'cloud-upload-outline'}
                          size={16}
                          color={bill.rejected ? colors.error : colors.warning}
                        />
                      ) : null}
                      {isVoid ? (
                        <Pill label={t('counterStatus.VOID')} tone="muted" />
                      ) : bill.paymentMethod === 'UPI' || bill.paymentMethod === 'CASH' ? (
                        <Pill label={t(`paymentMethod.${bill.paymentMethod}`)} tone="brand" />
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>
              <Text style={styles.hint}>{t('counter.billsHint')}</Text>
            </AnimatedEntrance>
          ) : null}
        </ScrollView>

        <CartTray
          lines={cart}
          currency={currency}
          blockedReason={blockedReason}
          onChangeQuantity={(index, quantity) => setCart((lines) => setCartQuantity(lines, index, quantity))}
          onClear={() => setCart([])}
          onCharge={() => {
            if (!ready) return;
            setChargeDone(null);
            setChargeOpen(true);
          }}
        />
      </SafeAreaView>

      <ChargeSheet
        visible={chargeOpen}
        amount={total}
        currency={currency}
        payee={context?.payee ?? null}
        // The branch and the token the bill is about to get, so a payment in the
        // shop's bank app can be matched to its bill.
        noteLabel={upiNote(branch?.code, [
          branchId ? nextTokenNumber(queue, branchId, dayKey, sameDay ? context?.lastTokenNumber : 0) : null,
        ])}
        busy={chargeBusy}
        done={chargeDone}
        onPaid={(method) => void paymentDone(method)}
        onPrint={() => void printLastSale(chargeDone?.print === 'printed')}
        onSetUpPrinter={() => {
          closeCharge();
          navigation.navigate('ReceiptPrinter');
        }}
        onClose={closeCharge}
      />

      <BillSheet
        bill={openBill}
        currency={currency}
        canVoid={can.voidCounterOrders(membership)}
        canPrint={isPrintingSupported() && !!printer}
        busy={billBusy}
        error={billError}
        onPrint={(bill) => void reprint(bill)}
        onVoid={(bill) => void voidBill(bill)}
        onClose={() => setOpenBill(null)}
      />
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
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: 0 },
  block: { marginTop: spacing.md },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingTop: spacing.sm },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
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
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  // A void is still information — kept in the list, but visibly spent.
  billRowVoid: { opacity: 0.6, backgroundColor: colors.background },
  billTotalVoid: { textDecorationLine: 'line-through', color: colors.textSecondary },
  tokenBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenBadgeError: { backgroundColor: colors.errorBg },
  tokenText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  tokenTextError: { color: colors.error },
  billText: { flex: 1, minWidth: 0 },
  billTotal: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  billMeta: { fontSize: 12, color: colors.textTertiary },
  hint: { fontSize: 11.5, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
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
