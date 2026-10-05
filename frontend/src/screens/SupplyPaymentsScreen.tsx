import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useNavigationState } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useSupplyPayments } from '@/hooks/useSupplyPayments';
import { extractErrorMessage } from '@/api/client';
import { settleSupplyPayments, verifySupplyPayment } from '@/api/supply';
import { refreshSupplyPayments } from '@/store/supplyPaymentStore';
import type { SupplyPaymentOrder } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import UpiPayCard from '@/components/payments/UpiPayCard';
import { SupplyStatusPill } from '@/components/supply/SupplyPills';
import { confirm } from '@/utils/confirm';
import { formatDate, toISODate } from '@/utils/date';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { payeeOf, upiNote } from '@/utils/upi';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

type Tab = 'pay' | 'confirm';

/** The orders one payment can cover: everything owed to one payee. */
type PayeeSection = {
  key: string;
  payeeName: string;
  isVendor: boolean;
  readyTotal: number;
  readyCount: number;
  currency: string;
  data: SupplyPaymentOrder[];
};

const payeeKey = (order: SupplyPaymentOrder) => order.vendorId ?? 'WAREHOUSE';

/**
 * Paying for supply orders, and confirming payments arrived — requirements 26
 * and 27. The accountant's tab; the desk and the owner reach it from Home.
 *
 * ## To pay (`supplyPayment:settle`)
 *
 * Every company-operated branch's order still unpaid, grouped by WHO it is
 * owed to — the warehouse, or one vendor — because one payment pays one UPI ID.
 * An order still on its way is listed, dimmed, so accounts sees what is coming;
 * only a delivered one can be selected, which is Vatsal's rule and the server's.
 * Selecting is per payee: picking an order owed to somebody else starts a new
 * selection rather than building one payment to two people.
 *
 * Paying shows ONE QR for the whole selection — exact total, order numbers in
 * the note — with "Pay with UPI app" beside it, since the accountant is usually
 * holding the phone the code is on. "Payment done" asks first: it records money
 * as paid and cannot be undone.
 *
 * ## To confirm (`supplyPayment:verify`)
 *
 * Payments franchise branches have sent the warehouse. "Received" is one tap
 * here, after a question; "Not received" lives on the order, where the branch
 * and the history are in front of whoever is saying it.
 */
export default function SupplyPaymentsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const businessId = useBusinessId();
  // A tab for the accountant; pushed from Home for everybody else who may use
  // it. Only the pushed copy has anywhere to go back to.
  const isPushed = useNavigationState((state) => state.type === 'stack');

  const { canSettle, canVerify, due, toConfirm, ready, readyTotal, isLoading, error, refresh } =
    useSupplyPayments();

  const [tab, setTab] = useState<Tab>(canSettle ? 'pay' : 'confirm');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPaying, setIsPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const sections = useMemo<PayeeSection[]>(() => {
    const byPayee = new Map<string, PayeeSection>();
    for (const order of due) {
      const key = payeeKey(order);
      const section =
        byPayee.get(key) ??
        ({
          key,
          payeeName: order.vendor?.name ?? t('supply.fromWarehouse'),
          isVendor: !!order.vendor,
          readyTotal: 0,
          readyCount: 0,
          currency: order.currency,
          data: [],
        } satisfies PayeeSection);
      section.data.push(order);
      if (order.status === 'DELIVERED') {
        section.readyTotal += Number(order.totalAmount);
        section.readyCount += 1;
      }
      byPayee.set(key, section);
    }
    // The warehouse first, then vendors by name — the same order the cart uses.
    return [...byPayee.values()].sort((a, b) => {
      if (!a.isVendor) return -1;
      if (!b.isVendor) return 1;
      return a.payeeName.localeCompare(b.payeeName);
    });
  }, [due, t]);

  // What is selected and still payable. An order paid from another phone since
  // it was ticked drops out of the list on refresh, and so out of here.
  const selection = useMemo(() => ready.filter((order) => selected.has(order.id)), [ready, selected]);
  const selectionTotal = selection.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const selectionCurrency = selection[0]?.currency ?? 'INR';

  function toggle(order: SupplyPaymentOrder) {
    if (order.status !== 'DELIVERED') return;
    haptics.tap();
    setNotice(null);
    setSelected((prev) => {
      // One payee per payment: ticking somebody else's order starts over.
      const samePayee = selection.length === 0 || payeeKey(selection[0]) === payeeKey(order);
      const next = samePayee ? new Set(prev) : new Set<string>();
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      return next;
    });
  }

  function selectAllReady(section: PayeeSection) {
    haptics.tap();
    setNotice(null);
    setSelected(new Set(section.data.filter((order) => order.status === 'DELIVERED').map((order) => order.id)));
  }

  async function settle() {
    if (!businessId || selection.length === 0 || busy) return;
    const total = formatAmountPrecise(selectionTotal, selectionCurrency);
    const ok = await confirm({
      title: t('payments.confirmPaidTitle'),
      body: t('payments.confirmPaidBody', {
        amount: total,
        payee: payeeOf(selection[0]).name,
        count: selection.length,
      }),
      confirmLabel: t('upiPay.done'),
      cancelLabel: t('common.cancel'),
      destructive: false,
    });
    if (!ok) return;

    setBusy(true);
    setActionError(null);
    try {
      const result = await settleSupplyPayments(businessId, { supplyOrderIds: selection.map((order) => order.id) });
      haptics.success();
      setNotice(
        t('payments.paidNotice', {
          amount: formatAmountPrecise(result.totalAmount, result.currency),
          count: result.count,
        })
      );
      setSelected(new Set());
      setIsPaying(false);
      await refreshSupplyPayments();
    } catch (err) {
      haptics.error();
      setActionError(extractErrorMessage(err));
      // Whatever refused it has probably changed underneath — paid elsewhere,
      // cancelled — so show the lists as they are now.
      await refreshSupplyPayments();
    } finally {
      setBusy(false);
    }
  }

  async function markReceived(order: SupplyPaymentOrder) {
    if (!businessId || busy) return;
    const ok = await confirm({
      title: t('payments.confirmReceivedTitle'),
      body: t('payments.confirmReceivedBody', {
        amount: formatAmount(Number(order.totalAmount), order.currency),
        branch: order.branch?.name ?? '',
        number: order.orderNumber ?? '',
      }),
      confirmLabel: t('supply.markVerified'),
      cancelLabel: t('common.cancel'),
      destructive: false,
    });
    if (!ok) return;

    setBusy(true);
    setActionError(null);
    try {
      await verifySupplyPayment(businessId, order.id, { outcome: 'VERIFIED' });
      haptics.success();
      await refreshSupplyPayments();
    } catch (err) {
      haptics.error();
      setActionError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shownError = actionError ?? error;
  const openOrder = (order: SupplyPaymentOrder) =>
    navigation.navigate('SupplyOrderDetail', { supplyOrderId: order.id });

  // --- Paying: one QR for the whole selection -----------------------------------
  if (isPaying && selection.length > 0) {
    const payee = payeeOf(selection[0]);
    return (
      <View style={styles.container}>
        <ScreenBackground />
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('payments.payTitle')}</Text>
              <Text style={styles.subtitle}>{t('payments.payCount', { count: selection.length })}</Text>
            </View>
            <PressableScale testID="payments-pay-back" style={styles.close} onPress={() => setIsPaying(false)}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </PressableScale>
          </View>
          <SectionList
            sections={[{ key: 'orders', data: selection }]}
            keyExtractor={(order) => order.id}
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              <View style={styles.block}>
                {shownError ? <ErrorBanner message={shownError} /> : null}
                <UpiPayCard
                  testID="payments-batch"
                  payee={payee}
                  amount={selectionTotal}
                  currency={selectionCurrency}
                  note={upiNote(null, selection.map((order) => order.orderNumber))}
                  doneBusy={busy}
                  onDone={() => void settle()}
                />
                <Text style={[styles.sectionLabel, styles.coversLabel]}>{t('payments.covers')}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.coverRow}>
                <Text style={styles.coverText} numberOfLines={2}>
                  {t('supply.orderTitle', { number: item.orderNumber ?? '' })} · {item.branch?.name ?? ''}
                </Text>
                <Text style={styles.coverAmount}>{formatAmount(Number(item.totalAmount), item.currency)}</Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.coverSeparator} />}
          />
        </SafeAreaView>
      </View>
    );
  }

  const showTabs = canSettle && canVerify;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('payments.title')}</Text>
            <Text style={styles.subtitle}>
              {tab === 'pay' ? t('payments.paySubtitle') : t('payments.confirmSubtitle')}
            </Text>
          </View>
          {isPushed ? (
            <PressableScale testID="payments-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          ) : null}
        </View>

        {showTabs ? (
          <View style={styles.tabs}>
            {/* Two choices side by side — what SegmentedOption is for. */}
            <SegmentedOption
              testID="payments-tab-pay"
              title={t('payments.tabPay')}
              caption={t('payments.readyCount', { count: ready.length })}
              icon="wallet-outline"
              selected={tab === 'pay'}
              onPress={() => setTab('pay')}
            />
            <SegmentedOption
              testID="payments-tab-confirm"
              title={t('payments.tabConfirm')}
              caption={t('payments.waitingCount', { count: toConfirm.length })}
              icon="shield-checkmark-outline"
              selected={tab === 'confirm'}
              onPress={() => setTab('confirm')}
            />
          </View>
        ) : null}

        {tab === 'pay' ? (
          <SectionList
            testID="payments-due"
            sections={sections}
            keyExtractor={(order) => order.id}
            contentContainerStyle={styles.content}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={() => void refresh()} tintColor={colors.primary} />
            }
            ListHeaderComponent={
              <View>
                {shownError ? (
                  <View style={styles.block}>
                    <ErrorBanner message={shownError} />
                  </View>
                ) : null}
                {notice ? (
                  <AnimatedEntrance key={notice} delay={0} style={styles.block}>
                    <View style={styles.notice}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.noticeText}>{notice}</Text>
                    </View>
                  </AnimatedEntrance>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              isLoading ? null : (
                <AnimatedEntrance delay={step(0)} style={styles.block}>
                  <EmptyCard
                    icon="wallet-outline"
                    title={t('payments.nothingToPay')}
                    body={t('payments.nothingToPayBody')}
                  />
                </AnimatedEntrance>
              )
            }
            renderSectionHeader={({ section }) => (
              // Stacked, not a row: the payee's name, the figure and the button
              // each grow with the language, and three growing things on one
              // line is the line that breaks in Gujarati.
              <View style={styles.sectionHeader}>
                <View style={styles.payeeRow}>
                  <Ionicons
                    name={section.isVendor ? 'storefront-outline' : 'cube-outline'}
                    size={16}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.sectionLabel}>{section.payeeName}</Text>
                </View>
                <Text style={styles.readyLine}>
                  {section.readyCount > 0
                    ? t('payments.readyLine', {
                        amount: formatAmount(section.readyTotal, section.currency),
                        count: section.readyCount,
                      })
                    : t('payments.nothingReady')}
                </Text>
                {section.readyCount > 0 ? (
                  <PressableScale
                    testID={`payments-select-all-${section.key}`}
                    style={styles.selectAll}
                    scaleTo={0.98}
                    onPress={() => selectAllReady(section)}
                  >
                    <Ionicons name="checkbox-outline" size={16} color={colors.primary} />
                    <Text style={styles.selectAllText}>{t('payments.selectAllReady')}</Text>
                  </PressableScale>
                ) : null}
              </View>
            )}
            renderItem={({ item }) => {
              const isReady = item.status === 'DELIVERED';
              const isSelected = selected.has(item.id);
              return (
                <View style={[styles.row, !isReady && styles.rowWaiting, isSelected && styles.rowSelected]}>
                  {/* The tick and the row are two targets: ticking chooses what
                      to pay, the row opens the order. A row that did both would
                      open an order every time someone meant to tick it. */}
                  <PressableScale
                    testID={`payments-tick-${item.id}`}
                    style={styles.tick}
                    disabled={!isReady}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected, disabled: !isReady }}
                    onPress={() => toggle(item)}
                  >
                    <Ionicons
                      name={!isReady ? 'time-outline' : isSelected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={!isReady ? colors.textTertiary : colors.primary}
                    />
                  </PressableScale>
                  {/* Everything else stacks in one column — the amount too.
                      Given its own column it left the text about 104dp on a
                      320dp phone, and "on its way" in Gujarati ran to four
                      lines beside it. */}
                  <PressableScale
                    testID={`payments-order-${item.id}`}
                    style={styles.rowBody}
                    scaleTo={0.99}
                    onPress={() => openOrder(item)}
                  >
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {t('supply.orderTitle', { number: item.orderNumber ?? '' })} · {item.branch?.name ?? ''}
                    </Text>
                    <Text style={styles.rowAmount}>{formatAmount(Number(item.totalAmount), item.currency)}</Text>
                    <Text style={styles.rowMeta}>
                      {isReady
                        ? t('payments.deliveredOn', {
                            // The phone's own calendar day for the instant it
                            // arrived, which is the branch's for anyone at it.
                            date: formatDate(toISODate(new Date(item.deliveredAt ?? item.createdAt)), t),
                          })
                        : t('payments.onTheWay')}
                    </Text>
                    <View style={styles.rowPills}>
                      <SupplyStatusPill status={item.status} fromVendor={!!item.vendorId} />
                    </View>
                  </PressableScale>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <SectionList
            testID="payments-to-confirm"
            sections={toConfirm.length ? [{ key: 'toConfirm', data: toConfirm }] : []}
            keyExtractor={(order) => order.id}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={() => void refresh()} tintColor={colors.primary} />
            }
            ListHeaderComponent={
              shownError ? (
                <View style={styles.block}>
                  <ErrorBanner message={shownError} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              isLoading ? null : (
                <AnimatedEntrance delay={step(0)} style={styles.block}>
                  <EmptyCard
                    icon="shield-checkmark-outline"
                    title={t('payments.nothingToConfirm')}
                    body={t('payments.nothingToConfirmBody')}
                  />
                </AnimatedEntrance>
              )
            }
            renderItem={({ item }) => (
              <View style={styles.confirmCard}>
                <PressableScale
                  testID={`payments-open-${item.id}`}
                  style={styles.confirmBody}
                  scaleTo={0.99}
                  onPress={() => openOrder(item)}
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {t('supply.orderTitle', { number: item.orderNumber ?? '' })} · {item.branch?.name ?? ''}
                  </Text>
                  <Text style={styles.rowAmount}>{formatAmount(Number(item.totalAmount), item.currency)}</Text>
                  <Text style={styles.rowMeta}>
                    {item.paymentMode === 'COD' ? t('payments.sentOnDelivery') : t('payments.sentBeforeOrdering')}
                  </Text>
                </PressableScale>
                <PressableScale
                  testID={`payments-received-${item.id}`}
                  style={styles.receivedButton}
                  scaleTo={0.98}
                  disabled={busy}
                  onPress={() => void markReceived(item)}
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
                  <Text style={styles.receivedText}>{t('supply.markVerified')}</Text>
                </PressableScale>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        {tab === 'pay' && selection.length > 0 ? (
          // Stacked like the cart's tray: the total on its own line, the button
          // the full width beneath it.
          <View style={styles.tray}>
            {/* The count above the figure, not beside it: "3 ઓર્ડર પસંદ કર્યા"
                beside "₹12,34,567.50" needs about 275dp of a 320dp phone's 272. */}
            <View>
              <Text style={styles.trayLabel}>{t('payments.selectedCount', { count: selection.length })}</Text>
              <Text style={styles.trayTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {formatAmountPrecise(selectionTotal, selectionCurrency)}
              </Text>
            </View>
            <PrimaryButton
              testID="payments-pay-selected"
              title={t('payments.paySelected')}
              icon="qr-code-outline"
              onPress={() => {
                setActionError(null);
                setIsPaying(true);
              }}
            />
          </View>
        ) : null}
        {tab === 'pay' && selection.length === 0 && ready.length > 0 ? (
          <View style={styles.tray}>
            <Text style={styles.trayHint}>
              {t('payments.readyTotalHint', { amount: formatAmount(readyTotal, ready[0].currency) })}
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={16} color={colors.error} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function EmptyCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={22} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
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
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.sm, gap: spacing.xs },
  payeeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  sectionLabel: {
    ...typography.label,
    flexShrink: 1,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  coversLabel: { marginTop: spacing.lg },
  readyLine: { fontSize: 15, fontWeight: '800', color: colors.text },
  selectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
  },
  selectAllText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  rowWaiting: { opacity: 0.6 },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  // 44dp square: the platform's minimum for something a thumb has to hit.
  tick: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.xs },
  rowBody: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.xs },
  rowTitle: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  rowPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  rowAmount: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  separator: { height: spacing.sm },
  confirmCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirmBody: { gap: 2 },
  receivedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.success,
  },
  receivedText: { fontSize: 14, fontWeight: '700', color: colors.success },
  coverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  coverText: { flex: 1, fontSize: 13.5, color: colors.text },
  coverAmount: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  coverSeparator: { height: 1, backgroundColor: colors.border },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#E8F6ED',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.md,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  tray: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.md,
  },
  trayLabel: { fontSize: 12.5, color: colors.textSecondary },
  trayTotal: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  trayHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
