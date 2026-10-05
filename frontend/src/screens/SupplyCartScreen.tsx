import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { extractErrorMessage } from '@/api/client';
import { getSupplyOrder, placeSupplyOrder, updateSupplyOrderItem } from '@/api/supply';
import type { ChoosablePaymentMode, SupplyOrder, SupplyOrderItem, SupplyOrderVendor } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import UpiPayCard from '@/components/payments/UpiPayCard';
import { formatAmount } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { isUpiCurrency, supplierPayee, upiNote } from '@/utils/upi';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/** One supplier's share of the cart — what becomes one order when it is placed. */
type SupplierGroup = {
  key: string;
  vendor: SupplyOrderVendor | null;
  lines: SupplyOrderItem[];
  subtotal: number;
};

/**
 * The cart's lines grouped the way the server will split them: by each item's
 * supplier as it is now, the warehouse first and vendors by name.
 */
function groupBySupplier(items: SupplyOrderItem[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const line of items) {
    const vendor = line.inventoryItem?.vendor ?? null;
    const key = vendor?.id ?? 'WAREHOUSE';
    const group = groups.get(key) ?? { key, vendor, lines: [], subtotal: 0 };
    group.lines.push(line);
    group.subtotal += Number(line.lineTotal);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.vendor) return -1;
    if (!b.vendor) return 1;
    return a.vendor.name.localeCompare(b.vendor.name);
  });
}

/**
 * Review the order and send it — requirements 5, 24, 25 and 26.
 *
 * This is where quantities are actually decided, which is why each line has a
 * real numeric field rather than only a stepper: raw material is ordered in
 * twenties and halves, and getting to 20 kg by tapping a plus is not a design.
 * The steppers stay for the one-more case.
 *
 * ## One cart, one order per supplier
 *
 * Lines are grouped by who supplies them, because that is how the server splits
 * the cart when it is placed — each supplier's share becomes its own order with
 * its own payee. Showing the groups here means nothing about the result is a
 * surprise: the cashier sees the water is coming from Shree Water, not from the
 * warehouse, before pressing Place.
 *
 * ## Who pays, which the branch decides — not the cashier
 *
 * - **A company-operated (FOCO) branch** is asked nothing. Accounts pays once the
 *   goods arrive, and the screen says so in one line.
 * - **A franchise (FM) branch** chooses: pay now, by scanning each supplier's QR
 *   before placing, or pay on delivery. Paying now shows one QR per supplier,
 *   each with the exact amount, and Place waits until each one is marked done.
 *   Payment is still RECORDED, never collected: no gateway, no money through
 *   this app, and nothing to type — the receiver confirms it from their own UPI
 *   app (requirement 26).
 */
export default function SupplyCartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'SupplyCart'>>();
  const businessId = useBusinessId();

  const [order, setOrder] = useState<SupplyOrder | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ChoosablePaymentMode>('COD');
  // Which suppliers the cashier has said they paid, keyed like the groups.
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setError(null);
    try {
      setOrder(await getSupplyOrder(businessId, params.supplyOrderId));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, params.supplyOrderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const groups = useMemo(() => groupBySupplier(order?.items ?? []), [order]);
  const isFoco = order?.branch?.operatingModel === 'FOCO';
  // Paying now needs a QR for every supplier in the cart. When one has no UPI
  // ID yet, the choice is not offered rather than offered and refused.
  const payNowPossible =
    !!order &&
    isUpiCurrency(order.currency) &&
    groups.every((group) => !!supplierPayee(group.vendor, order.business).upiId);
  const effectiveMode: ChoosablePaymentMode = payNowPossible ? mode : 'COD';

  async function setQuantity(itemId: string, quantity: number) {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const updated = await updateSupplyOrderItem(businessId, order.id, itemId, quantity);
      setOrder(updated);
      // A changed amount is a different payment: any "done" for a supplier
      // whose subtotal just moved no longer describes what was paid.
      setPaid(new Set());
      // Drop the local draft so the field shows what the server actually stored
      // rather than what was typed at it.
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  /** Commit a typed quantity, ignoring anything that is not a positive number. */
  function commitDraft(itemId: string, current: number) {
    const typed = drafts[itemId];
    if (typed === undefined) return;
    const parsed = Number(typed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDrafts((prev) => ({ ...prev, [itemId]: String(current) }));
      return;
    }
    if (parsed === current) return;
    void setQuantity(itemId, parsed);
  }

  function markPaid(key: string, value: boolean) {
    haptics.tap();
    setPaid((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function place() {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const placed = await placeSupplyOrder(
        businessId,
        order.id,
        isFoco
          ? {}
          : effectiveMode === 'ONLINE'
            ? { paymentMode: 'ONLINE', paymentConfirmed: true }
            : { paymentMode: 'COD' }
      );
      haptics.success();
      // Replace rather than push: the cart is gone once it is an order, and
      // going "back" to it would show a screen that no longer exists. A cart
      // with two suppliers became two orders, which the list shows together.
      if (placed.placedOrders.length > 1) navigation.replace('SupplyOrders');
      else navigation.replace('SupplyOrderDetail', { supplyOrderId: placed.id });
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  const isEmpty = !order || order.items.length === 0;
  const canPlace =
    !isEmpty && (isFoco || effectiveMode === 'COD' || groups.every((group) => paid.has(group.key)));
  const branchCode = order?.branch?.code ?? null;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('supply.cartTitle')}</Text>
          <PressableScale testID="supply-cart-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {isEmpty ? (
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <View style={styles.emptyCard}>
                  <Ionicons name="cube-outline" size={22} color={colors.textTertiary} />
                  <Text style={styles.emptyTitle}>{t('supply.cartEmpty')}</Text>
                  <Text style={styles.emptyBody}>{t('supply.cartEmptyBody')}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {order
              ? groups.map((group, groupIndex) => (
                  <AnimatedEntrance key={group.key} delay={step(Math.min(groupIndex, 3))} style={styles.block}>
                    {/* Who it comes from heads every group, so a cart that will
                        become two orders reads as two before it is placed. */}
                    <View style={styles.supplierHeader}>
                      <Ionicons
                        name={group.vendor ? 'storefront-outline' : 'cube-outline'}
                        size={15}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.sectionTitle}>
                        {group.vendor
                          ? t('supply.fromVendor', { name: group.vendor.name })
                          : t('supply.fromWarehouse')}
                      </Text>
                    </View>
                    <View style={styles.list}>
                      {group.lines.map((line) => {
                        const current = Number(line.quantity);
                        return (
                          <View key={line.id} style={styles.line}>
                            <View style={styles.lineText}>
                              <Text style={styles.lineName} numberOfLines={1}>
                                {line.itemNameSnapshot}
                              </Text>
                              <Text style={styles.lineMeta}>
                                {t('supply.perUnit', {
                                  price: formatAmount(Number(line.unitPrice), order.currency),
                                  unit: line.unitSnapshot,
                                })}
                              </Text>
                            </View>

                            <View style={styles.qtyGroup}>
                              <PressableScale
                                testID={`supply-less-${line.id}`}
                                style={styles.stepper}
                                onPress={() => void setQuantity(line.id, Math.max(0, current - 1))}
                              >
                                <Ionicons name="remove" size={15} color={colors.text} />
                              </PressableScale>
                              <TextInput
                                testID={`supply-qty-${line.id}`}
                                style={styles.qtyInput}
                                value={drafts[line.id] ?? String(current)}
                                onChangeText={(text) => setDrafts((prev) => ({ ...prev, [line.id]: text }))}
                                onBlur={() => commitDraft(line.id, current)}
                                onSubmitEditing={() => commitDraft(line.id, current)}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                              />
                              <PressableScale
                                testID={`supply-more-${line.id}`}
                                style={styles.stepper}
                                onPress={() => void setQuantity(line.id, current + 1)}
                              >
                                <Ionicons name="add" size={15} color={colors.text} />
                              </PressableScale>
                            </View>

                            <Text style={styles.lineTotal}>
                              {formatAmount(Number(line.lineTotal), order.currency)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    {groups.length > 1 ? (
                      <View style={styles.subtotalRow}>
                        <Text style={styles.subtotalLabel}>{t('supply.subtotal')}</Text>
                        <Text style={styles.subtotal}>{formatAmount(group.subtotal, order.currency)}</Text>
                      </View>
                    ) : null}
                  </AnimatedEntrance>
                ))
              : null}

            {!isEmpty && order && isFoco ? (
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View testID="supply-paid-by-accounts" style={styles.infoCard}>
                  <Ionicons name="business-outline" size={18} color={colors.primary} />
                  <View style={styles.infoText}>
                    <Text style={styles.infoTitle}>{t('supply.accountsPaysTitle')}</Text>
                    <Text style={styles.infoBody}>{t('supply.accountsPaysBody')}</Text>
                  </View>
                </View>
              </AnimatedEntrance>
            ) : null}

            {!isEmpty && order && !isFoco && !payNowPossible ? (
              // Paying now needs every supplier's QR. When one has no UPI ID
              // yet, the choice is not offered at all — a "Pay now" that does
              // nothing when tapped is worse than saying why it is not there.
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View testID="supply-pay-on-delivery-only" style={styles.infoCard}>
                  <Ionicons name="cash-outline" size={18} color={colors.primary} />
                  <View style={styles.infoText}>
                    <Text style={styles.infoTitle}>{t('supply.payCod')}</Text>
                    <Text style={styles.infoBody}>{t('supply.payNowUnavailable')}</Text>
                  </View>
                </View>
              </AnimatedEntrance>
            ) : null}

            {!isEmpty && order && !isFoco && payNowPossible ? (
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <Text style={styles.sectionTitle}>{t('supply.paymentMode')}</Text>
                {/* Two options, side by side — exactly what SegmentedOption is
                    for. A third would make this a stacked OptionRow list. */}
                <View style={styles.modeRow}>
                  <SegmentedOption
                    testID="supply-mode-online"
                    title={t('supply.payNow')}
                    caption={t('supply.payNowHint')}
                    icon="qr-code-outline"
                    selected={effectiveMode === 'ONLINE'}
                    onPress={() => setMode('ONLINE')}
                  />
                  <SegmentedOption
                    testID="supply-mode-cod"
                    title={t('supply.payCod')}
                    caption={t('supply.payCodHint')}
                    icon="cash-outline"
                    selected={effectiveMode === 'COD'}
                    onPress={() => setMode('COD')}
                  />
                </View>

                {effectiveMode === 'ONLINE' ? (
                  <View style={styles.payCards}>
                    {groups.map((group) => (
                      <UpiPayCard
                        key={group.key}
                        testID={`supply-pay-${group.key}`}
                        payee={supplierPayee(group.vendor, order.business)}
                        amount={group.subtotal}
                        currency={order.currency}
                        note={upiNote(branchCode, [])}
                        done={paid.has(group.key)}
                        onDone={() => markPaid(group.key, true)}
                        onUndo={() => markPaid(group.key, false)}
                      />
                    ))}
                  </View>
                ) : null}
              </AnimatedEntrance>
            ) : null}
          </ScrollView>

          {!isEmpty && order ? (
            <View style={styles.tray}>
              <View style={styles.trayRow}>
                <Text style={styles.trayLabel}>{t('supply.total')}</Text>
                <Text style={styles.trayTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatAmount(Number(order.totalAmount), order.currency)}
                </Text>
              </View>
              {groups.length > 1 ? (
                <Text style={styles.trayNote}>{t('supply.splitNote', { count: groups.length })}</Text>
              ) : null}
              <PrimaryButton
                testID="supply-place"
                title={t('supply.place')}
                icon="paper-plane-outline"
                loading={isBusy}
                disabled={!canPlace}
                onPress={() => void place()}
              />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flexShrink: 1, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  block: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.label,
    flexShrink: 1,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // The supplier's name wraps beside its icon rather than pushing the row wider.
  supplierHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, marginBottom: spacing.sm },
  list: { gap: spacing.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  // The line wraps its name and lets the controls keep their size, so a long
  // item name shortens instead of squeezing the quantity field to nothing.
  lineText: { flex: 1, gap: 2, minWidth: 0 },
  lineName: { fontSize: 14, fontWeight: '600', color: colors.text },
  lineMeta: { fontSize: 12, color: colors.textTertiary },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    minWidth: 44,
    textAlign: 'center',
    paddingVertical: spacing.xs,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineTotal: { minWidth: 62, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: colors.text },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  subtotalLabel: { flexShrink: 1, fontSize: 12.5, color: colors.textSecondary },
  subtotal: { fontSize: 14, fontWeight: '800', color: colors.text },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  infoText: { flex: 1, gap: 2 },
  infoTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  infoBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  payCards: { gap: spacing.md, marginTop: spacing.md },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.md,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  /**
   * Stacked, not a row.
   *
   * The total and the button used to share one line, with the button sized by
   * its own content and refusing to shrink. On a 320dp phone that left about
   * 89dp for the amount — and "Place order" is the short version: every Indic
   * translation of it runs longer, so the languages most likely to be used are
   * the ones where the figure got squeezed first. A row whose contents both
   * grow with the language is a row that breaks in the language nobody tested.
   *
   * The total gets its own line and the button spans the width, which is both
   * the standard checkout shape and one that cannot degrade as a label grows.
   */
  tray: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.md,
  },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  trayLabel: { fontSize: 12, color: colors.textSecondary },
  // flexShrink so a seven-figure order scales down rather than shoving the
  // word "Total" off its own line.
  trayTotal: { flexShrink: 1, fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  trayNote: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
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
